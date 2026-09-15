import { describe, it, expect, vi, beforeEach } from "vitest";

const { FAKE_HOME } = vi.hoisted(() => ({ FAKE_HOME: "/fake/persist-home" }));
const files: Record<string, string> = {};
const modes: Record<string, number> = {};
let writeError: Error | null = null;

vi.mock("node:os", () => ({ homedir: () => FAKE_HOME }));

vi.mock("node:fs", () => ({
  promises: {
    readFile: async (path: string) => {
      if (path in files) return files[path];
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    },
    writeFile: async (path: string, data: string, opts: { mode?: number }) => {
      if (writeError) throw writeError;
      files[path] = data;
      if (opts?.mode) modes[path] = opts.mode;
    },
    mkdir: async () => undefined,
    access: async (path: string) => {
      if (path in files) return;
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    },
    rename: async (from: string, to: string) => {
      if (from in files) {
        files[to] = files[from];
        delete files[from];
      }
      if (from in modes) {
        modes[to] = modes[from];
        delete modes[from];
      }
    },
  },
}));

import {
  loadPreferences,
  savePreferences,
  getPrefsPath,
  isConfigured,
  type Preferences,
} from "../persistence";

describe("persistence (SPEC primitive-setup §4.1)", () => {
  beforeEach(() => {
    for (const k of Object.keys(files)) delete files[k];
    for (const k of Object.keys(modes)) delete modes[k];
    writeError = null;
  });

  it("round-trip {endpoint, token, model, thinking}", async () => {
    const prefs: Preferences = {
      endpoint: "https://opencode.ai/zen/go/v1",
      token: "sk-test",
      model: "deepseek-v4-pro",
      thinking: true,
    };
    await savePreferences(prefs);
    const loaded = await loadPreferences();
    expect(loaded).toEqual(prefs);
  });

  it("isConfigured: true когда endpoint+token+model заданы", () => {
    expect(isConfigured({ endpoint: "x", token: "y", model: "z" })).toBe(true);
    expect(isConfigured({ endpoint: "x", token: "y" })).toBe(false);
    expect(isConfigured({})).toBe(false);
  });

  it("мигрирует легаси {credentials.custom, model} → новый формат", async () => {
    files[getPrefsPath()] = JSON.stringify({
      provider: "custom",
      model: "deepseek-v4-pro",
      credentials: {
        custom: {
          apiKey: "sk-legacy",
          baseURL: "https://opencode.ai/zen/go/v1",
        },
      },
    });
    const loaded = await loadPreferences();
    expect(loaded).toEqual({
      endpoint: "https://opencode.ai/zen/go/v1",
      token: "sk-legacy",
      model: "deepseek-v4-pro",
    });
  });

  it("битый/отсутствующий файл → пустой объект", async () => {
    const loaded = await loadPreferences();
    expect(loaded).toEqual({});
  });

  it("старый формат без custom-кредов → пустой объект", async () => {
    files[getPrefsPath()] = JSON.stringify({
      provider: "zai",
      credentials: { zai: { apiKey: "sk-zai" } },
    });
    const loaded = await loadPreferences();
    expect(loaded).toEqual({});
  });

  it("файл создаётся с режимом 0o600 (безопасность ключей)", async () => {
    await savePreferences({ endpoint: "x", token: "y", model: "z" });
    expect(modes[getPrefsPath()]).toBe(0o600);
  });

  it("атомарная замена исправляет права существующего файла", async () => {
    files[getPrefsPath()] = JSON.stringify({ endpoint: "old" });
    modes[getPrefsPath()] = 0o644;
    await savePreferences({ endpoint: "x", token: "y", model: "z" });
    expect(modes[getPrefsPath()]).toBe(0o600);
  });

  it("не подавляет ошибку записи", async () => {
    writeError = new Error("ENOSPC");
    await expect(savePreferences({ endpoint: "x" })).rejects.toThrow("ENOSPC");
  });

  it("сериализует записи и оставляет последнее значение", async () => {
    await Promise.all([
      savePreferences({ endpoint: "first" }),
      savePreferences({ endpoint: "second" }),
    ]);
    await expect(loadPreferences()).resolves.toEqual({ endpoint: "second" });
  });

  it("загружает частичные настройки по любому известному полю", async () => {
    files[getPrefsPath()] = JSON.stringify({
      model: "partial-model",
      thinking: true,
      extraHeaders: { "X-Valid": "yes", "X-Invalid": 42 },
    });
    await expect(loadPreferences()).resolves.toEqual({
      model: "partial-model",
      thinking: true,
      extraHeaders: { "X-Valid": "yes" },
    });
  });
});
