import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import React from "react";

const mockPrefsStore: { current: Record<string, unknown> } = { current: {} };
const mockSaveError: { current: Error | null } = { current: null };
const mocks = vi.hoisted(() => ({
  listModels: vi.fn(),
  checkConnection: vi.fn(),
}));

vi.mock("../persistence", () => ({
  loadPreferences: async () => mockPrefsStore.current,
  savePreferences: async (prefs: Record<string, unknown>) => {
    if (mockSaveError.current) throw mockSaveError.current;
    mockPrefsStore.current = prefs;
  },
  getPrefsPath: () => "/fake/prefs.json",
  hasProviderConnection: (prefs: { endpoint?: string; token?: string }) => Boolean(prefs.endpoint && prefs.token),
  isConfigured: (prefs: { endpoint?: string; token?: string; model?: string }) => Boolean(prefs.endpoint && prefs.token && prefs.model),
}));

vi.mock("../agent/models", () => ({
  listModels: mocks.listModels,
}));

vi.mock("../agent/connection", () => ({
  checkConnection: mocks.checkConnection,
}));

import { SetupScreen } from "../ui/SetupScreen";
import { ProviderConnectionScreen } from "../ui/ProviderConnectionScreen";
import { ModelSelectionScreen } from "../ui/ModelSelectionScreen";
import { useAppStore } from "../state/app";
import type { Preferences } from "../persistence";

const ENTER = "\r";
const DOWN = "\u001B[B";
const ESC = "\u001B";
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

function setPrefs(prefs: Preferences): void {
  mockPrefsStore.current = prefs as Record<string, unknown>;
  useAppStore.setState({ prefs });
}

function resetStore(): void {
  useAppStore.setState({ screen: "setup", prevScreen: "bar", prefs: {} });
}

async function moveDown(stdin: { write: (data: string) => void }, count: number): Promise<void> {
  for (let index = 0; index < count; index++) {
    stdin.write(DOWN);
    await tick();
  }
}

describe("разделённая настройка LLM", () => {
  beforeEach(() => {
    resetStore();
    mockPrefsStore.current = {};
    mockSaveError.current = null;
    mocks.listModels.mockReset();
    mocks.checkConnection.mockReset();
  });

  it("обзор блокирует выбор модели без подключения", async () => {
    const { lastFrame, stdin } = render(React.createElement(SetupScreen));
    await tick();
    expect(lastFrame()).toContain("Подключение к провайдеру");
    expect(lastFrame()).toContain("Выбор модели");
    await moveDown(stdin, 1);
    stdin.write(ENTER);
    await tick();
    expect(lastFrame()).toContain("Сначала сохрани endpoint и token");
    expect(useAppStore.getState().screen).toBe("setup");
  });

  it("из обзора открывает блок подключения", async () => {
    const { stdin } = render(React.createElement(SetupScreen));
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(useAppStore.getState().screen).toBe("provider-connection");
  });

  it("ESC из обзора возвращает к меню при полной настройке", async () => {
    setPrefs({ endpoint: "https://x/v1", token: "token", model: "model" });
    useAppStore.setState({ screen: "setup", prevScreen: "menu" });
    const { stdin } = render(React.createElement(SetupScreen));
    await tick();
    stdin.write(ESC);
    await tick();
    expect(useAppStore.getState().screen).toBe("menu");
  });

  it("загружает список по черновым endpoint/token без сохранения", async () => {
    mocks.listModels.mockResolvedValue({ kind: "available", models: ["a", "b"] });
    const { lastFrame, stdin } = render(React.createElement(ProviderConnectionScreen));
    await tick();
    stdin.write("https://example.com/v1");
    await moveDown(stdin, 1);
    stdin.write("token");
    await moveDown(stdin, 1);
    stdin.write(ENTER);
    await tick();
    expect(mocks.listModels).toHaveBeenCalledWith({
      endpoint: "https://example.com/v1",
      token: "token",
      extraHeaders: undefined,
    }, expect.any(AbortSignal));
    expect(lastFrame()).toContain("Провайдер отдал моделей: 2");
    expect(useAppStore.getState().prefs).toEqual({});
  });

  it("сохраняет подключение отдельно и сбрасывает модель после его изменения", async () => {
    setPrefs({
      endpoint: "https://old/v1",
      token: "old-token",
      model: "old-model",
      thinking: true,
      extraHeaders: { "X-Title": "Bartender" },
    });
    const { lastFrame, stdin } = render(React.createElement(ProviderConnectionScreen));
    await tick();
    stdin.write("2");
    await moveDown(stdin, 3);
    stdin.write(ENTER);
    await tick();
    expect(useAppStore.getState().prefs).toEqual({
      endpoint: "https://old/v12",
      token: "old-token",
      thinking: false,
      extraHeaders: { "X-Title": "Bartender" },
    });
    expect(lastFrame()).toContain("Теперь выбери модель");
  });

  it("оставляет текущую модель, если подключение не менялось", async () => {
    setPrefs({ endpoint: "https://x/v1", token: "token", model: "model", thinking: true });
    const { stdin } = render(React.createElement(ProviderConnectionScreen));
    await tick();
    await moveDown(stdin, 3);
    stdin.write(ENTER);
    await tick();
    expect(useAppStore.getState().prefs).toMatchObject({ model: "model", thinking: true });
  });

  it("показывает ручной fallback, если каталог не поддержан", async () => {
    setPrefs({ endpoint: "https://x/v1", token: "token" });
    mocks.listModels.mockResolvedValue({ kind: "unsupported" });
    const { lastFrame, stdin } = render(React.createElement(ModelSelectionScreen));
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(lastFrame()).toContain("не публикует совместимый список");
    expect(lastFrame()).toContain("Модель     (не выбрана)");
  });

  it("выбирает ID из загруженного списка и сохраняет модель", async () => {
    setPrefs({ endpoint: "https://x/v1", token: "token" });
    mocks.listModels.mockResolvedValue({ kind: "available", models: ["alpha", "beta"] });
    const { lastFrame, stdin } = render(React.createElement(ModelSelectionScreen));
    await tick();
    stdin.write(ENTER);
    await tick();
    expect(lastFrame()).toContain("alpha");
    await moveDown(stdin, 2);
    stdin.write(ENTER);
    await tick();
    await moveDown(stdin, 3);
    stdin.write(ENTER);
    await tick();
    expect(useAppStore.getState().prefs).toMatchObject({ model: "alpha", thinking: false });
    expect(useAppStore.getState().screen).toBe("bar");
  });

  it("проверяет вручную введённую модель без сохранения", async () => {
    setPrefs({ endpoint: "https://x/v1", token: "token" });
    mocks.checkConnection.mockResolvedValue("ready");
    const { lastFrame, stdin } = render(React.createElement(ModelSelectionScreen));
    await tick();
    await moveDown(stdin, 1);
    stdin.write("manual-model");
    await moveDown(stdin, 2);
    stdin.write(ENTER);
    await tick();
    expect(mocks.checkConnection).toHaveBeenCalledWith({
      endpoint: "https://x/v1",
      token: "token",
      model: "manual-model",
      thinking: false,
      extraHeaders: undefined,
    });
    expect(lastFrame()).toContain("streaming и инструменты доступны");
    expect(useAppStore.getState().prefs.model).toBeUndefined();
  });

  it("ошибка сохранения модели оставляет экран открытым", async () => {
    setPrefs({ endpoint: "https://x/v1", token: "token", model: "model" });
    mockSaveError.current = new Error("ENOSPC");
    useAppStore.setState({ screen: "model-selection", prevScreen: "setup" });
    const { lastFrame, stdin } = render(React.createElement(ModelSelectionScreen));
    await tick();
    await moveDown(stdin, 4);
    stdin.write(ENTER);
    await tick();
    expect(useAppStore.getState().screen).toBe("model-selection");
    expect(lastFrame()).toContain("Не удалось сохранить настройки");
  });
});
