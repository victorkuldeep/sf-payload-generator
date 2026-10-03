/**
 * Studio workspace - portable ZIP package (v2).
 *
 * Canonical exchange format for a whole PROJECT: the workspace root,
 * every child integration mapping, screenshots and a manifest.
 * Import always creates a NEW workspace with remapped record ids, so
 * existing browser data is never overwritten or collided with.
 */

import JSZip from "jszip";
import type { MappingProject } from "../mapping/types";
import type { StudioProject } from "../studio/types";

export const WORKSPACE_PACKAGE_FORMAT = "gravenx-workspace";
export const WORKSPACE_PACKAGE_VERSION = 1;

const MAX_ENTRIES = 3000;
const MAX_DECOMPRESSED_BYTES = 300 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 150 * 1024 * 1024;

export interface WorkspaceManifest {
  format: typeof WORKSPACE_PACKAGE_FORMAT;
  formatVersion: number;
  application: string;
  exportedAt: string;
  workspace: { id: string; name: string; customer?: string };
  mappings: { id: string; name: string; sourceApi?: string }[];
  assets: { id: string; path: string; mimeType: string }[];
  counts: {
    mappings: number;
    screens: number;
    components: number;
    operations: number;
    bindings: number;
    fieldMappings: number;
    decisions: number;
  };
}

export interface WorkspaceSummary {
  name: string;
  mappings: number;
  screens: number;
  assets: number;
  operations: number;
  approxBytes: number;
}

function extFor(mime: string): string {
  return mime === "image/webp" ? "webp" : "png";
}

export async function exportWorkspaceZip(
  root: StudioProject,
  children: MappingProject[],
  loadBlob: (storageKey: string) => Promise<Blob | null>
): Promise<{ blob: Blob; summary: WorkspaceSummary }> {
  const zip = new JSZip();
  const base = zip.folder("gravenx-workspace")!;
  const now = new Date().toISOString();
  const exp = root.experience;

  const assetEntries: WorkspaceManifest["assets"] = [];
  let assetBytes = 0;
  for (const a of exp?.assets ?? []) {
    const blob = await loadBlob(a.storageKey);
    if (!blob) continue; // missing asset recorded, never invented
    const path = `assets/screens/${a.storageKey}.${extFor(a.mimeType)}`;
    base.file(path, blob);
    assetBytes += blob.size;
    assetEntries.push({ id: a.id, path, mimeType: a.mimeType });
    if (a.thumbnailStorageKey) {
      const thumb = await loadBlob(a.thumbnailStorageKey);
      if (thumb) base.file(`assets/thumbnails/${a.thumbnailStorageKey}.${extFor(a.mimeType)}`, thumb);
    }
  }

  for (const child of children) {
    base.file(`mappings/${child.id}.json`, JSON.stringify(child, null, 2));
  }
  base.file("workspace.json", JSON.stringify(root, null, 2));

  const manifest: WorkspaceManifest = {
    format: WORKSPACE_PACKAGE_FORMAT,
    formatVersion: WORKSPACE_PACKAGE_VERSION,
    application: "GRAVENX",
    exportedAt: now,
    workspace: { id: root.id, name: root.name, customer: root.customer },
    mappings: children.map((c) => ({ id: c.id, name: c.name, sourceApi: c.sourceApi })),
    assets: assetEntries,
    counts: {
      mappings: children.length,
      screens: exp?.screens.length ?? 0,
      components: exp?.components.length ?? 0,
      operations: root.apiCatalog?.operations.length ?? 0,
      bindings: exp?.bindings.length ?? 0,
      fieldMappings: children.reduce((n, c) => n + c.mappings.length, 0),
      decisions: (root.archDecisions?.length ?? 0) + (root.assumptions?.length ?? 0),
    },
  };
  base.file("manifest.json", JSON.stringify(manifest, null, 2));
  base.file(
    "README.md",
    [
      `# ${root.name}`,
      ``,
      `Exported from GRAVENX on ${now}.`,
      ``,
      `## Restore`,
      ``,
      `Mapping → project → Deliverables → Import workspace ZIP. Imports as a NEW project with fresh ids; nothing is overwritten.`,
      ``,
      `## Contents`,
      ``,
      `- Integration mappings: ${manifest.counts.mappings}`,
      `- Screens: ${manifest.counts.screens} (${assetEntries.length} images)`,
      `- API operations: ${manifest.counts.operations}`,
      `- Field mappings: ${manifest.counts.fieldMappings}`,
      ``,
      `Design-time architecture record - not proof of runtime behavior.`,
      ``,
    ].join("\n")
  );

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const summary: WorkspaceSummary = {
    name: root.name,
    mappings: children.length,
    screens: exp?.screens.length ?? 0,
    assets: assetEntries.length,
    operations: root.apiCatalog?.operations.length ?? 0,
    approxBytes: assetBytes + JSON.stringify(root).length + children.reduce((n, c) => n + JSON.stringify(c).length, 0),
  };
  return { blob, summary };
}

export interface WorkspaceInspect {
  ok: boolean;
  manifest?: WorkspaceManifest;
  root?: StudioProject;
  mappings?: MappingProject[];
  missingAssets?: string[];
  errors: string[];
  warnings: string[];
}

function bad(errors: string[], warnings: string[] = []): WorkspaceInspect {
  return { ok: false, errors, warnings };
}

/** Staged inspection: type → entries → manifest → version → records → refs. */
export async function inspectWorkspace(file: Blob): Promise<WorkspaceInspect> {
  const warnings: string[] = [];
  if (file.size === 0) return bad(["That file is empty."]);
  if (file.size > MAX_PACKAGE_BYTES) return bad([`Package exceeds the ${MAX_PACKAGE_BYTES / 1024 / 1024} MB import limit.`]);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return bad(["Not a readable ZIP archive."]);
  }

  const names = Object.keys(zip.files);
  if (names.length > MAX_ENTRIES) return bad([`Archive declares ${names.length} entries (limit ${MAX_ENTRIES}).`]);
  for (const name of names) {
    if (name.includes("..") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
      return bad([`Unsafe archive entry rejected: ${name}.`]);
    }
  }

  const readJson = async (path: string): Promise<{ ok: boolean; value?: unknown; error?: string }> => {
    const entry = zip.file(path);
    if (!entry) return { ok: false, error: `Missing ${path}.` };
    try {
      return { ok: true, value: JSON.parse(await entry.async("string")) };
    } catch {
      return { ok: false, error: `${path} is not valid JSON.` };
    }
  };

  const manifestRes = await readJson("gravenx-workspace/manifest.json");
  if (!manifestRes.ok) return bad(["Not a studio workspace package (manifest missing or broken)."]);
  const manifest = manifestRes.value as WorkspaceManifest;
  if (manifest.format !== WORKSPACE_PACKAGE_FORMAT) return bad([`Unknown package format "${(manifest as { format?: string }).format}".`]);
  if (manifest.formatVersion > WORKSPACE_PACKAGE_VERSION) {
    return bad([`Unsupported package version ${manifest.formatVersion} (this app reads v${WORKSPACE_PACKAGE_VERSION}).`]);
  }

  const rootRes = await readJson("gravenx-workspace/workspace.json");
  if (!rootRes.ok) return bad([rootRes.error!]);
  const root = rootRes.value as StudioProject;
  if (typeof root.id !== "string" || !root.id) return bad(["Workspace id missing."]);
  if (typeof root.name !== "string" || !root.name) return bad(["Workspace name missing."]);
  if (!Array.isArray(root.mappingIds)) return bad(["Workspace mapping list missing."]);

  const mappings: MappingProject[] = [];
  for (const m of manifest.mappings ?? []) {
    const res = await readJson(`gravenx-workspace/mappings/${m.id}.json`);
    if (!res.ok) {
      warnings.push(`Mapping "${m.name}" unreadable - skipped, the rest imports.`);
      continue;
    }
    const child = res.value as MappingProject;
    const shape = checkMappingShape(child);
    if (!shape.ok) {
      warnings.push(`Mapping "${m.name}" invalid (${shape.errors.join("; ")}) - skipped.`);
      continue;
    }
    mappings.push(child);
  }

  const missingAssets: string[] = [];
  let decompressed = 0;
  for (const a of manifest.assets ?? []) {
    const entry = zip.file(`gravenx-workspace/${a.path}`);
    if (!entry) {
      missingAssets.push(a.path);
      warnings.push(`Declared image missing: ${a.path}. Screens keep metadata without the image.`);
      continue;
    }
    decompressed += await entry.async("uint8array").then((b) => b.byteLength).catch(() => 0);
    if (decompressed > MAX_DECOMPRESSED_BYTES) return bad(["Decompressed contents exceed the safety limit."]);
  }

  return { ok: true, manifest, root, mappings, missingAssets, errors: [], warnings };
}

function checkMappingShape(c: MappingProject): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!c || typeof c !== "object") return { ok: false, errors: ["not an object"] };
  if (typeof c.id !== "string" || !c.id) errors.push("id missing");
  if (typeof c.name !== "string" || !c.name) errors.push("name missing");
  for (const key of ["mappings", "recordPlans", "relationships", "decisions", "versions"] as const) {
    if (!Array.isArray(c[key])) errors.push(`"${key}" missing`);
  }
  const ids = new Set<string>();
  for (const m of c.mappings ?? []) {
    if (ids.has(m.id)) errors.push(`duplicate row ${m.id}`);
    ids.add(m.id);
  }
  return { ok: errors.length === 0, errors };
}

/** Read declared image blobs back out of an inspected archive. */
export async function extractWorkspaceAssets(file: Blob, manifest: WorkspaceManifest): Promise<{ storageKey: string; blob: Blob; thumbnail: Blob | null }[]> {
  const zip = await JSZip.loadAsync(file);
  const out: { storageKey: string; blob: Blob; thumbnail: Blob | null }[] = [];
  for (const a of manifest.assets ?? []) {
    const entry = zip.file(`gravenx-workspace/${a.path}`);
    if (!entry) continue;
    const blob = await entry.async("blob");
    if (blob.type && blob.type !== a.mimeType && blob.size > 0) continue;
    const storageKey = a.path.split("/").pop()!.replace(/\.(png|webp)$/, "");
    const thumbEntry = zip.file(`gravenx-workspace/assets/thumbnails/${storageKey}.${a.mimeType === "image/webp" ? "webp" : "png"}`);
    out.push({ storageKey, blob, thumbnail: thumbEntry ? await thumbEntry.async("blob") : null });
  }
  return out;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Remap record ids for import-as-new: fresh workspace + mapping ids,
 * dependency references rewritten, row/plan ids preserved (random uids,
 * collision-safe). References to row/plan ids stay valid.
 */
export function remapWorkspaceImport(root: StudioProject, mappings: MappingProject[]): { root: StudioProject; mappings: MappingProject[] } {
  const now = new Date().toISOString();
  const nextRoot = JSON.parse(JSON.stringify(root)) as StudioProject;
  const nextMappings = JSON.parse(JSON.stringify(mappings)) as MappingProject[];
  const idMap = new Map<string, string>();
  for (const m of nextMappings) {
    const fresh = newId("map");
    idMap.set(m.id, fresh);
    m.id = fresh;
    m.updatedAt = now;
  }
  nextRoot.id = newId("ws");
  nextRoot.mappingIds = nextMappings.map((m) => m.id);
  nextRoot.updatedAt = now;
  nextRoot.createdAt = nextRoot.createdAt || now;
  // Screen payload links point at mapping records - rewrite them.
  if (nextRoot.experience) {
    for (const s of nextRoot.experience.screens) {
      if (s.payloadMappingId && idMap.has(s.payloadMappingId)) {
        s.payloadMappingId = idMap.get(s.payloadMappingId);
      }
    }
  }
  // Dependency references carry the workspace id - point at the new root.
  if (nextRoot.apiCatalog) {
    for (const d of nextRoot.apiCatalog.dependencies) {
      if (d.reference && "projectId" in d.reference) {
        d.reference.projectId = nextRoot.id;
      }
    }
  }
  void idMap;
  return { root: nextRoot, mappings: nextMappings };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
