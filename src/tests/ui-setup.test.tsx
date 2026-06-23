import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "ink-testing-library";
import React from "react";

const mockPrefsStore: { current: Record<string, unknown> } = { current: {} };

vi.mock("../persistence", () => ({
  loadPreferences: async () => mockPrefsStore.current,
  savePreferences: async (p: Record<string, unknown>) => {
    mockPrefsStore.current = p;
  },
  getPrefsPath: () => "/fake/prefs.json",
  isConfigured: (p: { endpoint?: string; token?: string; model?: string }) =>
    Boolean(p.endpoint && p.token && p.model),
}));

import { SetupScreen } from "../ui/SetupScreen";
import { useAppStore } from "../state/app";
import type { Preferences } from "../persistence";

const ENTER = "\r";
const TAB = "\t";
const DOWN = "\u001B[B";
const SPACE = " ";
const tick = () => new Promise((r) => setTimeout(r, 20));

function setPrefs(p: Preferences): void {
  mockPrefsStore.current = p as unknown as Record<string, unknown>;
  useAppStore.setState({ prefs: p });
}

function resetStore() {
  useAppStore.setState({
    screen: "bar",
    prevScreen: "bar",
    prefs: {},
  });
}

describe("SetupScreen (SPEC primitive-setup §4.6)", () => {
  beforeEach(() => {
    resetStore();
    setPrefs({});
    mockPrefsStore.current = {};
  });

  it("показывает 4 поля и кнопку сохранить", async () => {
    const { lastFrame } = render(React.createElement(SetupScreen));
    await tick();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Endpoint");
    expect(frame).toContain("Token");
    expect(frame).toContain("Модель");
    expect(frame).toContain("Thinking");
    expect(frame).toContain("Сохранить");
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

  it("Tab переключает поля", async () => {
    const { lastFrame, stdin } = render(React.createElement(SetupScreen));
    await tick();
    expect(lastFrame()).toContain("▸");
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
    stdin.write(TAB);
    await tick();
    stdin.write(TAB);
    await tick();
    stdin.write(TAB);
    await tick();
    expect(lastFrame()).toContain("[ ] OFF");
    stdin.write(SPACE);
    await tick();
    expect(lastFrame()).toContain("[✓] ON");
  });

  it("Enter на Сохранить без заполнения → ошибка", async () => {
    const { lastFrame, stdin } = render(React.createElement(SetupScreen));
    await tick();
    for (let i = 0; i < 4; i++) {
      stdin.write(DOWN);
      await tick();
    }
    stdin.write(ENTER);
    await tick();
    expect(lastFrame()).toContain("Заполни");
  });

  it("Сохранение валидных данных → go(bar) и prefs обновлены", async () => {
    setPrefs({
      endpoint: "https://opencode.ai/zen/go/v1",
      token: "sk-test",
      model: "deepseek-v4-pro",
      thinking: false,
    });
    const { stdin } = render(React.createElement(SetupScreen));
    await tick();
    for (let i = 0; i < 4; i++) {
      stdin.write(DOWN);
      await tick();
    }
    stdin.write(ENTER);
    await tick();
    const state = useAppStore.getState();
    expect(state.screen).toBe("bar");
    expect(state.prefs.endpoint).toBe("https://opencode.ai/zen/go/v1");
    expect(state.prefs.model).toBe("deepseek-v4-pro");
  });
});
