"use client";

/**
 * Normalization adapters: existing records (autosave notes slice, manual
 * snapshots) become ArchitectureInboxItems without changing their storage.
 * Mapping preserves existing semantics:
 * - entity note without TODO flag -> kind "note"
 * - entity note with TODO flag   -> kind "task"
 * - done === true  -> status "resolved", else "open"
 * - canvas markdown / snapshot notes -> kind "note" (never inferred as task)
 */

import type { ArchitectureInboxItem, InboxQuery, StaleState } from "./types";
import type { ErdSnapshot } from "@/lib/erd/snapshotDb";

export interface LiveNotesInput {
  orgScopeId: string;
  text: string;
  updatedAt: number | null;
  entities: Record<string, { text: string; todo: boolean; done: boolean; updatedAt: number }>;
  labels: Map<string, string>;
}

export interface SnapshotInput {
  snapshot: ErdSnapshot;
  orgScopeId: string;
}

function firstLine(text: string, max = 90): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const clean = line.replace(/^#{1,3}\s+|^[-*]\s+(\[[ xX]\]\s+)?|^\d+[.)]\s+/, "");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function normalizeLiveNotes(input: LiveNotesInput): ArchitectureInboxItem[] {
  const items: ArchitectureInboxItem[] = [];
  const { orgScopeId, text, updatedAt, entities, labels } = input;
  if (text.trim()) {
    items.push({
      id: "live-canvas",
      orgScopeId,
      canvasId: "live",
      canvasName: "Live canvas",
      kind: "note",
      status: "open",
      title: "Canvas design notes",
      body: text,
      anchor: { type: "canvas", id: "live" },
      createdAt: updatedAt ?? Date.now(),
      updatedAt: updatedAt ?? Date.now(),
      stale: "ok",
      provenance: { source: "live-canvas" },
    });
  }
  for (const [api, n] of Object.entries(entities)) {
    if (!n.text.trim() && !n.todo) continue;
    const isTask = n.todo;
    items.push({
      id: `live-entity-${api}`,
      orgScopeId,
      canvasId: "live",
      canvasName: "Live canvas",
      kind: isTask ? "task" : "note",
      status: n.done ? "resolved" : "open",
      title: labels.get(api) ?? api,
      body: n.text,
      anchor: { type: "entity", id: api, labelAtCreation: labels.get(api) },
      createdAt: n.updatedAt,
      updatedAt: n.updatedAt,
      stale: "unknown",
      provenance: { source: "live-entity" },
    });
  }
  return items;
}

export function normalizeSnapshotNotes(input: SnapshotInput): ArchitectureInboxItem[] {
  const { snapshot, orgScopeId } = input;
  if (!snapshot.notes?.trim()) return [];
  return [
    {
      id: `snap-${snapshot.id}`,
      orgScopeId,
      canvasId: snapshot.id,
      canvasName: snapshot.name,
      kind: "note",
      status: "open",
      title: `Snapshot notes - ${snapshot.name}`,
      body: snapshot.notes,
      anchor: { type: "canvas", id: snapshot.id, labelAtCreation: snapshot.name },
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.createdAt,
      stale: "unknown",
      provenance: { source: "snapshot", snapshotId: snapshot.id },
    },
  ];
}

/** Resolve "unknown" staleness against live schema knowledge. Pure. */
export function resolveStale(
  items: ArchitectureInboxItem[],
  knownApis: Set<string>
): ArchitectureInboxItem[] {
  return items.map((item) => {
    if (item.stale !== "unknown") return item;
    let stale: StaleState = "ok";
    if (item.anchor.type === "entity") {
      stale = knownApis.has(item.anchor.id) ? "ok" : "missing";
    } else if (item.anchor.type === "canvas" && item.provenance.source === "snapshot") {
      stale = "ok";
    }
    return { ...item, stale };
  });
}

function matchesQuery(item: ArchitectureInboxItem, q: InboxQuery): boolean {
  if (q.kinds.length > 0 && !q.kinds.includes(item.kind)) return false;
  if (q.statuses.length > 0 && !q.statuses.includes(item.status)) return false;
  if (q.canvases.length > 0 && !q.canvases.includes(item.canvasId)) return false;
  if (q.staleOnly && item.stale !== "missing") return false;
  const t = q.text.trim().toLowerCase();
  if (t) {
    const hay = `${item.title}\n${item.body}\n${item.anchor.id}\n${item.anchor.labelAtCreation ?? ""}\n${item.canvasName}`.toLowerCase();
    // All tokens must match somewhere (AND semantics), whitespace-normalized.
    const tokens = t.split(/\s+/).filter(Boolean);
    if (!tokens.every((tok) => hay.includes(tok))) return false;
  }
  return true;
}

/** Deterministic workflow sort: open tasks/questions first, then by recency. */
const KIND_RANK: Record<string, number> = { task: 0, question: 1, decision: 2, note: 3 };
const STATUS_RANK: Record<string, number> = { open: 0, "in-progress": 1, resolved: 2 };

export function queryInbox(items: ArchitectureInboxItem[], q: InboxQuery): ArchitectureInboxItem[] {
  return items
    .filter((item) => matchesQuery(item, q))
    .sort((a, b) => {
      const openA = a.status === "open" ? 0 : 1;
      const openB = b.status === "open" ? 0 : 1;
      if (openA !== openB) return openA - openB;
      const ka = KIND_RANK[a.kind] ?? 9;
      const kb = KIND_RANK[b.kind] ?? 9;
      if (ka !== kb) return ka - kb;
      const sa = STATUS_RANK[a.status] ?? 9;
      const sb = STATUS_RANK[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      return a.id < b.id ? -1 : 1;
    });
}

export interface InboxCounts {
  total: number;
  open: number;
  tasks: number;
  openTasks: number;
  questions: number;
  decisions: number;
  stale: number;
  resolved: number;
}

export function countInbox(items: ArchitectureInboxItem[]): InboxCounts {
  const counts: InboxCounts = {
    total: items.length,
    open: 0,
    tasks: 0,
    openTasks: 0,
    questions: 0,
    decisions: 0,
    stale: 0,
    resolved: 0,
  };
  for (const item of items) {
    if (item.status === "open") counts.open++;
    if (item.status === "resolved") counts.resolved++;
    if (item.kind === "task") {
      counts.tasks++;
      if (item.status === "open") counts.openTasks++;
    }
    if (item.kind === "question") counts.questions++;
    if (item.kind === "decision") counts.decisions++;
    if (item.stale === "missing") counts.stale++;
  }
  return counts;
}

export { firstLine };
