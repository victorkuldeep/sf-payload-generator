import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { blankProject } from "../mapping/types";
import { exportProjectZip, inspectPackage, PACKAGE_FORMAT } from "./package";
import { blankExperienceModule } from "./types";

async function project() {
  const p = blankProject({ id: "p1", name: "Demo", now: "2026-01-01" });
  const exp = blankExperienceModule("e", "2026-01-01");
  exp.screens = [
    { id: "s1", name: "List", journeyIds: [], canvas: { sourceWidth: 10, sourceHeight: 10, aspectRatio: 1 }, componentIds: [], actionIds: [], bindingIds: [], status: "draft", tags: [], createdAt: "t", updatedAt: "t" },
  ];
  p.experience = exp;
  return p;
}

describe("project package", () => {
  it("round-trips project + manifest", async () => {
    const p = await project();
    const { blob, summary } = await exportProjectZip(p, async () => null);
    expect(summary.screens).toBe(1);
    expect(blob.size).toBeGreaterThan(0);
    const inspected = await inspectPackage(blob);
    expect(inspected.ok).toBe(true);
    expect(inspected.manifest?.format).toBe(PACKAGE_FORMAT);
    expect(inspected.project?.id).toBe("p1");
    expect(inspected.project?.experience?.screens[0].name).toBe("List");
  });

  it("embeds image blobs and recovers them", async () => {
    const p = await project();
    p.experience!.assets = [
      { id: "a1", screenId: "s1", fileName: "s.png", mimeType: "image/png", byteSize: 4, width: 10, height: 10, storageKey: "key-1", thumbnailStorageKey: "key-1-thumb", createdAt: "t" },
    ];
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const { blob } = await exportProjectZip(p, async (k) => (k === "key-1" ? png : k === "key-1-thumb" ? png : null));
    const inspected = await inspectPackage(blob);
    expect(inspected.ok).toBe(true);
    expect(inspected.manifest?.assets).toHaveLength(1);
  });

  it("rejects traversal entries and non-packages", async () => {
    const zip = new JSZip();
    zip.file("../evil.txt", "x");
    const evil = await zip.generateAsync({ type: "blob" });
    expect((await inspectPackage(evil)).ok).toBe(false);

    const plain = new Blob([JSON.stringify({ hello: 1 })], { type: "application/zip" });
    const r = await inspectPackage(plain);
    expect(r.ok).toBe(false);
  });

  it("rejects broken project shapes", async () => {
    const zip = new JSZip();
    const root = zip.folder("sobject-studio-project")!;
    root.file("manifest.json", JSON.stringify({ format: PACKAGE_FORMAT, formatVersion: 1, application: "t", exportedAt: "t", project: { id: "x", name: "y" }, modules: [], assets: [], counts: {} }));
    root.file("project/project.json", JSON.stringify({ id: "x" }));
    const blob = await zip.generateAsync({ type: "blob" });
    const r = await inspectPackage(blob);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/name missing|array missing/);
  });
});
