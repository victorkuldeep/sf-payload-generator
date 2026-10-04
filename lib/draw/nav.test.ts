import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Draw must be reachable from every header, placed after System. */
describe("draw navigation", () => {
  for (const rel of ["components/layout/AppHeader.tsx", "components/layout/ToolHeader.tsx"]) {
    it(`${rel} links Draw after System`, () => {
      const src = read(rel);
      // JSX spells it href="/draw", route tables spell it href: "/draw".
      const at = (p: string): number => {
        const candidates = [src.indexOf(`href="${p}"`), src.indexOf(`href: "${p}"`)].filter(
          (i) => i >= 0,
        );
        return candidates.length > 0 ? Math.min(...candidates) : -1;
      };
      expect(at("/draw")).toBeGreaterThan(-1);
      expect(at("/draw")).toBeGreaterThan(at("/system"));
    });
  }

  it("home mobile nav includes Draw", () => {
    const src = read("components/layout/AppHeader.tsx");
    // Grouped nav: one navGroups structure drives desktop panels and the
    // mobile flat row, so Draw must be in the data and the flat renderer.
    expect(src).toContain('href: "/draw"');
    const mobile = src.slice(src.indexOf("md:hidden"));
    expect(mobile).toContain("renderFlatEntry");
    expect(mobile).toContain("navGroups");
  });

  it("tab reads Draw+ with a raised plus", () => {
    // ToolHeader is still flat: literal Draw<sup.
    expect(read("components/layout/ToolHeader.tsx")).toContain("Draw<sup");
    // AppHeader is grouped: the Draw entry carries plus:true and the shared
    // label renderer raises it in a sup.
    const app = read("components/layout/AppHeader.tsx");
    expect(app).toContain('label: "Draw", plus: true');
    expect(app).toContain("<sup");
  });

  it("JSON, Draw+ and Console stand alone at the end", () => {
    const app = read("components/layout/AppHeader.tsx");
    // Standalone routes render after the groups on desktop and at the end
    // of the mobile flat row - Draw+ and JSON are no longer grouped.
    expect(app).toContain("standaloneRoutes");
    const table = app.slice(app.indexOf("const standaloneRoutes"));
    expect(table.indexOf('href: "/json"')).toBeGreaterThan(-1);
    expect(table.indexOf('href: "/draw"')).toBeGreaterThan(table.indexOf('href: "/json"'));
    expect(table.indexOf('href: "/console"')).toBeGreaterThan(table.indexOf('href: "/draw"'));
    const mobile = app.slice(app.indexOf("md:hidden"));
    expect(mobile).toContain("standaloneRoutes");
  });

  it("grouped panels are full-width mega-panels with brand zones", () => {
    const app = read("components/layout/AppHeader.tsx");
    // Apple-style: one MegaPanel per group, brand copy on the group data,
    // tagline zone follows the hovered entry.
    expect(app).toContain("MegaPanel");
    expect(app).toContain("fixed inset-x-0");
    for (const field of ["eyebrow:", "headline:", "punch:"]) {
      expect(app).toContain(field);
    }
    expect(app).toContain("On this tab");
  });
});
