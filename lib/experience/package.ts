/**
 * Experience Mapping - portable ZIP project package.
 *
 * Canonical exchange format for the complete editable project.
 * project/project.json is the single source of truth; the experience/*,
 * api/*, integration/* and architecture/* files are derived mirrors for
 * human inspection. Import reads project.json + assets only.
 */

import JSZip from "jszip";
import type { MappingProject } from "../mapping/types";

export const PACKAGE_FORMAT = "sobject-studio-project";
export const PACKAGE_FORMAT_VERSION = 1;

const MAX_ENTRIES = 2000;
const MAX_DECOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;

export interface PackageManifest {
  format: typeof PACKAGE_FORMAT;
  formatVersion: number;
  application: string;
  exportedAt: string;
  project: { id: string; name: string };
  modules: string[];
  assets: { id: string; path: string; mimeType: string }[];
  counts: {
    screens: number;
    components: number;
    operations: number;
    bindings: number;
    mappings: number;
    decisions: number;
  };
}

export interface PackageSummary {
  name: string;
  screens: number;
  assets: number;
  operations: number;
  bindings: number;
  mappingRefs: number;
  approxBytes: number;
}

function extFor(mime: string): string {
  return mime === "image/webp" ? "webp" : "png";
}

export function packageSummary(project: MappingProject, assetBytes: number): PackageSummary {
  const exp = project.experience;
  return {
    name: project.name,
    screens: exp?.screens.length ?? 0,
    assets: exp?.assets.length ?? 0,
    operations: project.apiCatalog?.operations.length ?? 0,
    bindings: exp?.bindings.length ?? 0,
    mappingRefs: (project.apiCatalog?.dependencies ?? []).filter((d) => d.kind === "integration-mapping").length,
    approxBytes: assetBytes + JSON.stringify(project).length,
  };
}

export async function exportProjectZip(
  project: MappingProject,
  loadBlob: (storageKey: string) => Promise<Blob | null>
): Promise<{ blob: Blob; summary: PackageSummary }> {
  const zip = new JSZip();
  const root = zip.folder("sobject-studio-project")!;
  const now = new Date().toISOString();
  const exp = project.experience;

  // Assets first (so the summary carries real byte counts).
  const assetEntries: PackageManifest["assets"] = [];
  let assetBytes = 0;
  for (const a of exp?.assets ?? []) {
    const blob = await loadBlob(a.storageKey);
    if (!blob) continue; // Missing asset recorded, never silently invented.
    const path = `assets/screens/${a.storageKey}.${extFor(a.mimeType)}`;
    root.file(path, blob);
    assetBytes += blob.size;
    assetEntries.push({ id: a.id, path, mimeType: a.mimeType });
    if (a.thumbnailStorageKey) {
      const thumb = await loadBlob(a.thumbnailStorageKey);
      if (thumb) root.file(`assets/thumbnails/${a.thumbnailStorageKey}.${extFor(a.mimeType)}`, thumb);
    }
  }

  const modules = ["integration"];
  if (exp && (exp.screens.length > 0 || (project.apiCatalog?.operations.length ?? 0) > 0)) modules.push("experience");
  if ((project.apiCatalog?.operations.length ?? 0) > 0) modules.push("api");
  if ((project.archDecisions?.length ?? 0) > 0 || (project.changeLog?.length ?? 0) > 0) modules.push("architecture");

  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    formatVersion: PACKAGE_FORMAT_VERSION,
    application: "sObject Studio",
    exportedAt: now,
    project: { id: project.id, name: project.name },
    modules,
    assets: assetEntries,
    counts: {
      screens: exp?.screens.length ?? 0,
      components: exp?.components.length ?? 0,
      operations: project.apiCatalog?.operations.length ?? 0,
      bindings: exp?.bindings.length ?? 0,
      mappings: project.mappings.length,
      decisions: (project.archDecisions?.length ?? 0) + (project.decisions?.length ?? 0),
    },
  };
  root.file("manifest.json", JSON.stringify(manifest, null, 2));
  root.file("project/project.json", JSON.stringify(project, null, 2));

  // Derived human-inspection mirrors (import ignores these).
  if (exp) {
    root.file("experience/screens.json", JSON.stringify(exp.screens, null, 2));
    root.file("experience/components.json", JSON.stringify(exp.components, null, 2));
    root.file("experience/annotations.json", JSON.stringify(exp.annotations, null, 2));
    root.file("experience/actions.json", JSON.stringify(exp.actions, null, 2));
    root.file("experience/bindings.json", JSON.stringify(exp.bindings, null, 2));
    root.file("experience/data-requirements.json", JSON.stringify(exp.requirements, null, 2));
    root.file("experience/states.json", JSON.stringify(exp.states, null, 2));
    root.file("experience/journeys.json", JSON.stringify({ journeys: exp.journeys, transitions: exp.transitions }, null, 2));
  }
  if (project.apiCatalog) root.file("api/catalog.json", JSON.stringify(project.apiCatalog, null, 2));
  root.file("integration/mappings.json", JSON.stringify({ recordPlans: project.recordPlans, relationships: project.relationships, mappings: project.mappings, decisions: project.decisions }, null, 2));
  if (project.sfSnapshot) root.file("integration/schema-snapshot.json", JSON.stringify(project.sfSnapshot, null, 2));
  root.file("architecture/decisions.json", JSON.stringify({ decisions: project.archDecisions ?? [], assumptions: project.assumptions ?? [] }, null, 2));
  root.file("architecture/change-log.json", JSON.stringify(project.changeLog ?? [], null, 2));
  root.file("documentation/README.md", packageReadme(project, manifest));

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return { blob, summary: packageSummary(project, assetBytes) };
}

function packageReadme(project: MappingProject, manifest: PackageManifest): string {
  return [
    `# ${project.name}`,
    ``,
    `Exported from sObject Studio on ${manifest.exportedAt}.`,
    ``,
    `## Restore`,
    ``,
    `Mapping → Deliverables → Import ZIP. The file project/project.json is the canonical record; the other JSON files are derived mirrors for inspection.`,
    ``,
    `## Contents`,
    ``,
    `- Screens: ${manifest.counts.screens} (${manifest.assets.length} image assets)`,
    `- Components: ${manifest.counts.components}`,
    `- API operations: ${manifest.counts.operations}`,
    `- API bindings: ${manifest.counts.bindings}`,
    `- Integration mappings: ${manifest.counts.mappings}`,
    `- Decisions: ${manifest.counts.decisions}`,
    ``,
    `Design-time architecture record - not proof of runtime behavior.`,
    ``,
  ].join("\n");
}

export interface InspectResult {
  ok: boolean;
  manifest?: PackageManifest;
  project?: MappingProject;
  missingAssets?: string[];
  errors: string[];
  warnings: string[];
}

/** Staged inspection: type → entries → manifest → version → project → refs. */
export async function inspectPackage(file: Blob): Promise<InspectResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (file.size === 0) return { ok: false, errors: ["That file is empty."], warnings };
  if (file.size > MAX_PACKAGE_BYTES) return { ok: false, errors: [`Package exceeds the ${MAX_PACKAGE_BYTES / 1024 / 1024} MB import limit.`], warnings };

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, errors: ["Not a readable ZIP archive."], warnings };
  }

  const names = Object.keys(zip.files);
  if (names.length > MAX_ENTRIES) return { ok: false, errors: [`Archive declares ${names.length} entries (limit ${MAX_ENTRIES}).`], warnings };
  for (const name of names) {
    if (name.includes("..") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
      return { ok: false, errors: [`Unsafe archive entry rejected: ${name}.`], warnings };
    }
  }

  const manifestFile = zip.file("sobject-studio-project/manifest.json");
  const projectFile = zip.file("sobject-studio-project/project/project.json");
  if (!manifestFile || !projectFile) {
    return { ok: false, errors: ["Not an sObject Studio project package (manifest or project record missing)."], warnings };
  }

  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(await manifestFile.async("string")) as PackageManifest;
  } catch {
    return { ok: false, errors: ["Package manifest is not valid JSON."], warnings };
  }
  if (manifest.format !== PACKAGE_FORMAT) return { ok: false, errors: [`Unknown package format "${(manifest as { format?: string }).format}".`], warnings };
  if (manifest.formatVersion > PACKAGE_FORMAT_VERSION) {
    return { ok: false, errors: [`Unsupported package version ${manifest.formatVersion} (this app reads v${PACKAGE_FORMAT_VERSION}).`], warnings };
  }

  let project: MappingProject;
  try {
    project = JSON.parse(await projectFile.async("string")) as MappingProject;
  } catch {
    return { ok: false, errors: ["Project record is not valid JSON."], warnings };
  }
  const shape = validateProjectShape(project);
  if (!shape.ok) return { ok: false, errors: shape.errors, warnings };

  // Asset inventory vs archive contents.
  const missingAssets: string[] = [];
  let decompressed = 0;
  for (const a of manifest.assets) {
    const entry = zip.file(`sobject-studio-project/${a.path}`);
    if (!entry) {
      missingAssets.push(a.path);
      warnings.push(`Declared asset missing from archive: ${a.path}. The screen keeps its metadata without the image.`);
      continue;
    }
    decompressed += await entry.async("uint8array").then((b) => b.byteLength).catch(() => 0);
    if (decompressed > MAX_DECOMPRESSED_BYTES) {
      return { ok: false, errors: ["Decompressed contents exceed the safety limit."], warnings };
    }
  }

  return { ok: true, manifest, project, missingAssets, errors, warnings };
}

function validateProjectShape(p: MappingProject): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!p || typeof p !== "object") return { ok: false, errors: ["Project record is not an object."] };
  if (typeof p.id !== "string" || !p.id) errors.push("Project id missing.");
  if (typeof p.name !== "string" || !p.name) errors.push("Project name missing.");
  for (const key of ["mappings", "recordPlans", "relationships", "decisions", "versions"] as const) {
    if (!Array.isArray(p[key])) errors.push(`"${key}" array missing.`);
  }
  const ids = new Set<string>();
  for (const m of p.mappings ?? []) {
    if (ids.has(m.id)) errors.push(`Duplicate mapping id ${m.id}.`);
    ids.add(m.id);
  }
  // Stable-id sanity for experience entities.
  const exp = p.experience;
  if (exp) {
    for (const [label, list] of [["screens", exp.screens], ["components", exp.components], ["annotations", exp.annotations]] as const) {
      const seen = new Set<string>();
      for (const e of list ?? []) {
        if (!e.id || typeof e.id !== "string") errors.push(`${label} entry without a stable id.`);
        else if (seen.has(e.id)) errors.push(`Duplicate ${label} id ${e.id}.`);
        seen.add(e.id);
      }
    }
    for (const b of exp.bindings ?? []) {
      if (!(p.apiCatalog?.operations ?? []).some((o) => o.id === b.operationId)) errors.push(`Binding ${b.id} references unknown operation ${b.operationId}.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Read declared image blobs back out of an inspected archive. */
export async function extractAssets(file: Blob, manifest: PackageManifest): Promise<{ storageKey: string; blob: Blob; thumbnail: Blob | null }[]> {
  const zip = await JSZip.loadAsync(file);
  const out: { storageKey: string; blob: Blob; thumbnail: Blob | null }[] = [];
  for (const a of manifest.assets) {
    const entry = zip.file(`sobject-studio-project/${a.path}`);
    if (!entry) continue;
    const blob = await entry.async("blob");
    if (blob.type && blob.type !== a.mimeType && blob.size > 0) continue; // MIME mismatch - skip, never trust blindly
    const storageKey = a.path.split("/").pop()!.replace(/\.(png|webp)$/, "");
    const thumbEntry = zip.file(`sobject-studio-project/assets/thumbnails/${storageKey}.${a.mimeType === "image/webp" ? "webp" : "png"}`);
    const thumbnail = thumbEntry ? await thumbEntry.async("blob") : null;
    out.push({ storageKey, blob, thumbnail });
  }
  return out;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
