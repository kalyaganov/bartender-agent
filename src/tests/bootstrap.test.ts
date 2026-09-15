import { describe, it, expect, beforeEach, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  prefs: {} as Record<string, unknown>,
  save: vi.fn(),
}));

vi.mock("../persistence", () => ({
  loadPreferences: async () => persistenceMocks.prefs,
  savePreferences: persistenceMocks.save,
  isConfigured: (p: { endpoint?: string; token?: string; model?: string }) =>
    Boolean(p.endpoint && p.token && p.model),
}));

import { bootstrap, resolveInitialScreen } from "../bootstrap";
import { useAppStore } from "../state/app";
import type { Preferences } from "../persistence";

beforeEach(() => {
  persistenceMocks.prefs = {};
  persistenceMocks.save.mockReset();
  useAppStore.setState({ screen: "bar", prevScreen: "bar", prefs: {} });
});

describe("resolveInitialScreen (SPEC primitive-setup §4.8)", () => {
  it("настроено → bar", () => {
    const prefs: Preferences = {
      endpoint: "https://opencode.ai/zen/go/v1",
      token: "sk",
      model: "deepseek-v4-pro",
    };
    expect(resolveInitialScreen(prefs)).toBe("bar");
  });

  it("нет endpoint → setup", () => {
    expect(resolveInitialScreen({ token: "sk", model: "m" })).toBe("setup");
  });

  it("нет token → setup", () => {
    expect(resolveInitialScreen({ endpoint: "x", model: "m" })).toBe("setup");
  });

  it("нет model → setup", () => {
    expect(resolveInitialScreen({ endpoint: "x", token: "y" })).toBe("setup");
  });

  it("пустые prefs → setup", () => {
    expect(resolveInitialScreen({})).toBe("setup");
  });

  it("thinking=true не влияет на configured", () => {
    expect(
      resolveInitialScreen({
        endpoint: "x",
        token: "y",
        model: "z",
        thinking: true,
      }),
    ).toBe("bar");
  });
});

describe("bootstrap", () => {
  it("гидратирует store без повторного сохранения", async () => {
    persistenceMocks.prefs = {
      endpoint: "https://example.com/v1",
      token: "token",
      model: "model",
    };
    await bootstrap();
    expect(useAppStore.getState().prefs).toEqual(persistenceMocks.prefs);
    expect(useAppStore.getState().screen).toBe("bar");
    expect(persistenceMocks.save).not.toHaveBeenCalled();
  });
});
