import { describe, expect, it } from "vitest";
import { wireIconDef, wireIconNames, WIRE_ICONS } from "./icons";

describe("wireframe icon set", () => {
  it("ships named glyphs with drawable geometry", () => {
    const names = wireIconNames();
    expect(names.length).toBeGreaterThan(20);
    expect(new Set(names).size).toBe(names.length);
    for (const [name, def] of Object.entries(WIRE_ICONS)) {
      expect(def.label.length, name).toBeGreaterThan(0);
      expect(def.els.length, name).toBeGreaterThan(0);
      for (const el of def.els) {
        expect(Object.keys(el.attrs).length, `${name}/${el.tag}`).toBeGreaterThan(0);
      }
    }
  });

  it("covers the everyday UI vocabulary plus brands", () => {
    for (const must of ["menu", "search", "bell", "user", "home", "trash", "star", "mail", "book", "lock", "globe", "github", "linkedin"]) {
      expect(WIRE_ICONS[must], must).toBeDefined();
    }
  });

  it("falls back to star on unknown names", () => {
    expect(wireIconDef("nope")).toBe(WIRE_ICONS.star);
  });
});
