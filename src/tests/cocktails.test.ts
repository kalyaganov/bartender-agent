import { describe, it, expect } from "vitest";
import { COCKTAILS, formatMenu } from "../data/cocktails";

describe("cocktails DB (M4)", () => {
  it("содержит и алкогольные, и безалкогольные напитки", () => {
    expect(COCKTAILS.some((c) => c.alcoholic)).toBe(true);
    expect(COCKTAILS.some((c) => !c.alcoholic)).toBe(true);
  });

  it("у каждого коктейля заполнены поля", () => {
    for (const c of COCKTAILS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.ingredients.length).toBeGreaterThan(0);
      expect(c.units).toBeGreaterThanOrEqual(0);
      expect(c.price).toBeGreaterThanOrEqual(0);
    }
  });

  it("formatMenu отдаёт читаемое меню с разделами", () => {
    const menu = formatMenu();
    expect(menu).toContain("МЕНЮ");
    expect(menu).toContain("Крепкое");
    expect(menu).toContain("Безалкогольное");
    expect(menu).toContain("₽");
  });
});
