import { describe, it, expect, vi, beforeEach } from "vitest";

const { FAKE_HOME } = vi.hoisted(() => ({ FAKE_HOME: "/fake/persist-home" }));
const files: Record<string, string> = {};
const modes: Record<string, number> = {};

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
    rename: async () => undefined,
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
});
