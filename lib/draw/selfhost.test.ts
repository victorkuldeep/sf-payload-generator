import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Runtime Draw code must never phone home to a CDN - assets ship from our origin. */
const FORBIDDEN_HOSTS = [
  "esm.run",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "excalidraw.com",
];

const SCANNED = [
  "components/draw/DrawCanvas.tsx",
  "components/draw/DrawStudio.tsx",
  "components/draw/DraftDialog.tsx",
  "lib/draw/storage.ts",
  "lib/draw/toSystemDraft.ts",
  "scripts/copy-excalidraw-assets.mjs",
  "app/draw/page.tsx",
];

describe("draw self-hosting", () => {
  it("pins an exact Excalidraw version", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@excalidraw/excalidraw"]).toBe("0.18.1");
  });

  it("points the editor at our own asset origin", () => {
    expect(read("components/draw/DrawCanvas.tsx")).toContain("/excalidraw-assets/");
  });

  it("references no external CDN in Draw runtime code", () => {
    for (const rel of SCANNED) {
      const src = read(rel);
      for (const host of FORBIDDEN_HOSTS) {
        expect(src, `${rel} mentions ${host}`).not.toContain(host);
      }
    }
  });
});
