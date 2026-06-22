import { describe, it, expect } from "vitest";
import {
  clamp,
  displayDrunkenness,
  metabolize,
  zoneLabel,
} from "../state/drunkenness";

describe("drunkenness model (M3)", () => {
  it("clamp ограничивает диапазон", () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("displayDrunkenness взвешивает 80% perceived + 40% bacProxy (с насыщением)", () => {
    // perceived=8, bacProxy=4 → 0.8*8 + 0.4*4 = 6.4 + 1.6 = 8.0
    expect(displayDrunkenness(8, 4)).toBeCloseTo(8.0, 5);
  });

  it("bacProxy выше 10 насыщается до 10", () => {
    // perceived=0, bacProxy=25 → 0.8*0 + 0.4*10 = 4
    expect(displayDrunkenness(0, 25)).toBeCloseTo(4, 5);
  });

  it("высокий perceived score Alone триггерит порог отказа", () => {
    // perceived=9, bac=0 → 7.2 (≥7 порог)
    expect(displayDrunkenness(9, 0)).toBeGreaterThanOrEqual(7);
  });

  it("displayDrunkenness не превышает 10", () => {
    expect(displayDrunkenness(10, 10)).toBe(10);
    expect(displayDrunkenness(12, 15)).toBe(10);
  });

  it("metabolize снижает bacProxy и не уходит в минус", () => {
    expect(metabolize(3, 10)).toBeCloseTo(3 - 0.05 * 10, 5);
    expect(metabolize(0.1, 100)).toBe(0);
  });

  it("zoneLabel отдаёт корректные зоны по SPEC §3.2", () => {
    expect(zoneLabel(0)).toBe("трезв");
    expect(zoneLabel(4)).toBe("навеселе");
    expect(zoneLabel(6)).toBe("пьян");
    expect(zoneLabel(8)).toBe("сильно пьян");
    expect(zoneLabel(10)).toBe("срез");
  });
});
