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
    const mobile = src.slice(src.indexOf("md:hidden"));
    expect(mobile).toContain('href="/draw"');
  });

  it("tab reads Draw+ with a raised plus", () => {
    for (const rel of ["components/layout/AppHeader.tsx", "components/layout/ToolHeader.tsx"]) {
      expect(read(rel)).toContain("Draw<sup");
    }
  });
});
