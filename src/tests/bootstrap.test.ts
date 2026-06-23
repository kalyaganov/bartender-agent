import { describe, it, expect } from "vitest";
import { resolveInitialScreen } from "../bootstrap";
import type { Preferences } from "../persistence";

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
