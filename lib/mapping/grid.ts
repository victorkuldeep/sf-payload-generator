/**
 * Spreadsheet-grid helpers - pure parse/validate/merge behind the grid
 * editing surface. The grid and the guide edit the same mappings array;
 * everything here commits through the same row patches.
 */

import { FREE_SOURCE_PATH, type MappingProject, type MappingRow } from "./types";

export interface ParsedTarget {
  objectName: string;
  fieldName: string;
}

/** "Account.Name" -> parts. Exactly one dot, no blanks, no inner spaces. */
export function parseTargetText(text: string): ParsedTarget | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(".");
  if (parts.length !== 2) return null;
  const [objectName, fieldName] = parts.map((p) => p.trim());
  if (!objectName || !fieldName) return null;
  if (/\s/.test(objectName) || /\s/.test(fieldName)) return null;
  return { objectName, fieldName };
}

export type TargetCheck =
  | { ok: true; target: ParsedTarget }
  | { ok: false; reason: string };

/**
 * Shape is always enforced; existence is enforced against the snapshot
 * when one is captured. Without a snapshot the target commits blind and
 * diagnostics flags it if wrong - the grid never bricks on metadata.
 */
export function validateTarget(project: MappingProject, text: string): TargetCheck {
  const target = parseTargetText(text);
  if (!target) return { ok: false, reason: "Use Object.Field - e.g. Account.Industry." };
  const snap = project.sfSnapshot;
  if (!snap) return { ok: true, target };
  const obj = snap.objects.find((o) => o.name === target.objectName);
  if (!obj) return { ok: false, reason: `${target.objectName} is not in the metadata snapshot.` };
  const field = obj.fields.find((f) => f.name === target.fieldName);
  if (!field) return { ok: false, reason: `${target.fieldName} is not on ${target.objectName} in the snapshot.` };
  return { ok: true, target };
}

export interface PasteRow {
  sourcePath: string;
  objectName: string;
  fieldName: string;
}

export interface PasteSkip {
  line: number;
  reason: string;
}

const SEPARATORS = ["\t", "->", "→", ",", ";"];

/**
 * Client spreadsheets paste as "source -> Object.Field" lines. Tab wins,
 * then arrows, then comma/semicolon. Blank lines are ignored silently;
 * malformed lines are reported with reasons, never half-applied.
 */
export function parsePasteGrid(text: string): { rows: PasteRow[]; skipped: PasteSkip[] } {
  const rows: PasteRow[] = [];
  const skipped: PasteSkip[] = [];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const sep = SEPARATORS.find((s) => line.includes(s));
    if (!sep) {
      skipped.push({ line: i + 1, reason: "No separator (tab, ->, comma)." });
      continue;
    }
    const at = line.indexOf(sep);
    const sourcePath = line.slice(0, at).trim();
    const target = parseTargetText(line.slice(at + sep.length));
    if (!sourcePath) {
      skipped.push({ line: i + 1, reason: "Empty source path." });
      continue;
    }
    if (!target) {
      skipped.push({ line: i + 1, reason: "Target must be Object.Field." });
      continue;
    }
    rows.push({ sourcePath, ...target });
  }
  return { rows, skipped };
}

/**
 * Fold pasted rows into the mapping list: same source updates in place
 * (last wins), new sources append. Pasted "(constant)" lines always
 * append as free rows - they never collide with each other.
 */
export function mergePasteRows(
  existing: MappingRow[],
  parsed: PasteRow[],
  planId: string | null,
  nextId: () => string,
  now: string,
): MappingRow[] {
  const next = existing.map((m) => ({ ...m }));
  const bySource = new Map(next.filter((m) => m.sourcePath !== FREE_SOURCE_PATH).map((m) => [m.sourcePath, m]));
  for (const p of parsed) {
    const hit = p.sourcePath === FREE_SOURCE_PATH ? undefined : bySource.get(p.sourcePath);
    if (hit) {
      hit.objectName = p.objectName;
      hit.fieldName = p.fieldName;
      hit.kind = "direct";
      hit.updatedAt = now;
      continue;
    }
    const row: MappingRow = {
      id: nextId(),
      sourcePath: p.sourcePath,
      planId,
      objectName: p.objectName,
      fieldName: p.fieldName,
      kind: "direct",
      status: "mapped",
      updatedAt: now,
    };
    next.push(row);
    if (p.sourcePath !== FREE_SOURCE_PATH) bySource.set(p.sourcePath, row);
  }
  return next;
}

/** Every Object.Field in the snapshot, for grid autocomplete. */
export function snapshotTargets(project: MappingProject): string[] {
  return (project.sfSnapshot?.objects ?? []).flatMap((o) => o.fields.map((f) => `${o.name}.${f.name}`));
}
