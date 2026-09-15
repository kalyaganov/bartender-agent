import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "ink-testing-library";
import React from "react";

const mockPrefsStore: { current: Record<string, unknown> } = { current: {} };
const mockSaveError: { current: Error | null } = { current: null };
const connectionMocks = vi.hoisted(() => ({
  checkConnection: vi.fn(),
}));

vi.mock("../persistence", () => ({
  loadPreferences: async () => mockPrefsStore.current,
  savePreferences: async (p: Record<string, unknown>) => {
    if (mockSaveError.current) throw mockSaveError.current;
    mockPrefsStore.current = p;
  },
  getPrefsPath: () => "/fake/prefs.json",
  isConfigured: (p: { endpoint?: string; token?: string; model?: string }) =>
    Boolean(p.endpoint && p.token && p.model),
}));

vi.mock("../agent/connection", () => ({
  checkConnection: connectionMocks.checkConnection,
}));

import { SetupScreen } from "../ui/SetupScreen";
import { useAppStore } from "../state/app";
import type { Preferences } from "../persistence";

const ENTER = "\r";
const TAB = "\t";
const DOWN = "\u001B[B";
const SPACE = " ";
const ESC = "\u001B";
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

function setPrefs(prefs: Preferences): void {
  mockPrefsStore.current = prefs as unknown as Record<string, unknown>;
  useAppStore.setState({ prefs });
}

function resetStore(): void {
  useAppStore.setState({
    screen: "bar",
    prevScreen: "bar",
    prefs: {},
  });
}

async function moveDown(stdin: { write: (data: string) => void }, count: number): Promise<void> {
  for (let index = 0; index < count; index++) {
    stdin.write(DOWN);
    await tick();
  }
}

describe("SetupScreen (SPEC byollm-connection-test)", () => {
  beforeEach(() => {
    resetStore();
    setPrefs({});
    mockPrefsStore.current = {};
    mockSaveError.current = null;
    connectionMocks.checkConnection.mockReset();
  });

  it("показывает поля, проверку, сохранение и подсказки", async () => {
    const { lastFrame } = render(React.createElement(SetupScreen));
    await tick();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Endpoint");
    expect(frame).toContain("Token");
    expect(frame).toContain("Модель");
    expect(frame).toContain("Thinking");
    expect(frame).toContain("Проверить");
    expect(frame).toContain("Сохранить");
    expect(frame).toContain("Chat Completions");
    expect(frame).toContain("/chat/completions");
  });

  it("предзаполняет из текущих prefs", async () => {
    setPrefs({
      endpoint: "https://x.example/v1",
      token: "sk-pre",
      model: "pre-model",
      thinking: true,
    });
    const { lastFrame } = render(React.createElement(SetupScreen));
    await tick();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("https://x.example/v1");
    expect(frame).toContain("pre-model");
    expect(frame).toContain("[✓] ON");
  });

  it("не сбрасывает текст при вводе", async () => {
    const { lastFrame, stdin } = render(React.createElement(SetupScreen));
    await tick();
    stdin.write("https://example.com/v1");
    await tick();
    expect(lastFrame()).toContain("https://example.com/v1");
  });

  it("Tab переключает поля", async () => {
    const { lastFrame, stdin } = render(React.createElement(SetupScreen));
    await tick();
    stdin.write(TAB);
    await tick();
    stdin.write(TAB);
    await tick();
    stdin.write(TAB);
    await tick();
    expect(lastFrame()).toContain("Thinking");
  });

  it("пробел переключает thinking", async () => {
    const { lastFrame, stdin } = render(React.createElement(SetupScreen));
    await tick();
    await moveDown(stdin, 3);
    expect(lastFrame()).toContain("[ ] OFF");
    stdin.write(SPACE);
    await tick();
    expect(lastFrame()).toContain("[✓] ON");
  });

  it("Enter на Сохранить без заполнения показывает ошибку", async () => {
    const { lastFrame, stdin } = render(React.createElement(SetupScreen));
    await tick();
    await moveDown(stdin, 5);
    stdin.write(ENTER);
    await tick();
    expect(lastFrame()).toContain("Заполни");
  });

  it("проверяет несохранённые настройки без записи на диск", async () => {
    setPrefs({ endpoint: "https://example.com/v1", token: "token", model: "model" });
    connectionMocks.checkConnection.mockResolvedValue("ready");
    const { lastFrame, stdin } = render(React.createElement(SetupScreen));
    await tick();
    await moveDown(stdin, 4);
    stdin.write(ENTER);
    await tick();
    expect(connectionMocks.checkConnection).toHaveBeenCalledWith({
      endpoint: "https://example.com/v1",
      token: "token",
      model: "model",
      thinking: false,
      extraHeaders: undefined,
    });
    expect(useAppStore.getState().screen).toBe("bar");
    expect(lastFrame()).toContain("streaming и инструменты доступны");
  });

  it("показывает предупреждение без tool calling", async () => {
    setPrefs({ endpoint: "https://example.com/v1", token: "token", model: "model" });
    connectionMocks.checkConnection.mockResolvedValue("tools-unavailable");
    const { lastFrame, stdin } = render(React.createElement(SetupScreen));
    await tick();
    await moveDown(stdin, 4);
    stdin.write(ENTER);
    await tick();
    expect(lastFrame()).toContain("не вызвала инструмент");
  });

  it("сохраняет валидные данные и сохраняет extraHeaders", async () => {
    setPrefs({
      endpoint: "https://opencode.ai/zen/go/v1",
      token: "sk-test",
      model: "deepseek-v4-pro",
      thinking: false,
      extraHeaders: {
        "HTTP-Referer": "https://example.com",
        "X-Title": "Bartender",
      },
    });
    const { stdin } = render(React.createElement(SetupScreen));
    await tick();
    await moveDown(stdin, 5);
    stdin.write(ENTER);
    await tick();
    const state = useAppStore.getState();
    expect(state.screen).toBe("bar");
    expect(state.prefs.endpoint).toBe("https://opencode.ai/zen/go/v1");
    expect(state.prefs.model).toBe("deepseek-v4-pro");
    expect(state.prefs.extraHeaders).toEqual({
      "HTTP-Referer": "https://example.com",
      "X-Title": "Bartender",
    });
  });

  it("ошибка сохранения оставляет форму открытой", async () => {
    setPrefs({ endpoint: "https://example.com/v1", token: "token", model: "model" });
    useAppStore.setState({ screen: "setup", prevScreen: "menu" });
    mockSaveError.current = new Error("ENOSPC");
    const { lastFrame, stdin } = render(React.createElement(SetupScreen));
    await tick();
    await moveDown(stdin, 5);
    stdin.write(ENTER);
    await tick();
    expect(useAppStore.getState().screen).toBe("setup");
    expect(lastFrame()).toContain("Не удалось сохранить настройки");
  });

  it("ESC возвращает из setup в меню", async () => {
    setPrefs({ endpoint: "https://example.com/v1", token: "token", model: "model" });
    useAppStore.setState({ screen: "setup", prevScreen: "menu" });
    const { stdin } = render(React.createElement(SetupScreen));
    await tick();
    stdin.write(ESC);
    await tick();
    expect(useAppStore.getState().screen).toBe("menu");
  });
});
