import { describe, it, expect } from "vitest";
import { resolveInitialProvider } from "../bootstrap";
import { ALL_PROVIDERS, PROVIDERS, getProviderDef } from "../agent/providers/registry";
import type { ProviderId } from "../agent/providers/types";

const ALL: ProviderId[] = ["anthropic", "openai", "opencode-go"];

describe("resolveInitialProvider (SPEC §3.1)", () => {
  it("env BARTENDER_PROVIDER выигрывает над prefs", () => {
    const d = resolveInitialProvider({
      envProvider: "anthropic",
      envModel: "claude-x",
      prefs: { provider: "openai" },
      configured: ALL,
    });
    expect(d.providerId).toBe("anthropic");
    expect(d.model).toBe("claude-x");
    expect(d.goToPicker).toBe(false);
  });

  it("prefs используются, если нет env", () => {
    const d = resolveInitialProvider({
      prefs: { provider: "openai", model: "gpt-yy" },
      configured: ALL,
    });
    expect(d.providerId).toBe("openai");
    expect(d.model).toBe("gpt-yy");
    expect(d.goToPicker).toBe(false);
  });

  it("единственный настроенный → авто-выбор, пикер пропускается", () => {
    const d = resolveInitialProvider({ configured: ["opencode-go"] });
    expect(d.providerId).toBe("opencode-go");
    expect(d.goToPicker).toBe(false);
  });

  it("несколько настроенных и нет выбора → пикер", () => {
    const d = resolveInitialProvider({ configured: ALL });
    expect(d.providerId).toBeNull();
    expect(d.goToPicker).toBe(true);
  });

  it("ноль настроенных → пикер (экран-инструкция)", () => {
    const d = resolveInitialProvider({ configured: [] });
    expect(d.providerId).toBeNull();
    expect(d.goToPicker).toBe(true);
  });

  it("env провайдер не настроен (нет ключа) → fallback к prefs", () => {
    const d = resolveInitialProvider({
      envProvider: "anthropic",
      prefs: { provider: "openai" },
      configured: ["openai", "opencode-go"],
    });
    expect(d.providerId).toBe("openai");
    expect(d.goToPicker).toBe(false);
  });

  it("prefs провайдер не настроен → fallback к single/picker", () => {
    const d = resolveInitialProvider({
      prefs: { provider: "anthropic" },
      configured: ["openai", "opencode-go"],
    });
    expect(d.providerId).toBeNull();
    expect(d.goToPicker).toBe(true);
  });
});

describe("provider registry", () => {
  it("ALL_PROVIDERS содержит все три id", () => {
    expect(ALL_PROVIDERS.map((p) => p.id).sort()).toEqual(
      ["anthropic", "openai", "opencode-go"].sort(),
    );
  });

  it("getProviderDef находит каждый id", () => {
    for (const id of ALL) expect(getProviderDef(id)?.id).toBe(id);
  });

  it("PROVIDERS — подмножество ALL и только configured", () => {
    expect(PROVIDERS.length).toBeLessThanOrEqual(ALL_PROVIDERS.length);
    for (const p of PROVIDERS) expect(p.configured).toBe(true);
  });

  it("у каждого провайдера есть defaultModel", () => {
    for (const p of ALL_PROVIDERS) expect(p.defaultModel.length).toBeGreaterThan(0);
  });
});
