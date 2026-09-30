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

import type {
  ArchitectureInboxItem,
  CanvasTodo,
  InboxMeta,
  InboxQuery,
  StaleState,
} from "./types";
import type { ErdSnapshot } from "@/lib/erd/snapshotDb";
import { fingerprintEntity, fingerprintField, type EntityFacts, type FieldFacts } from "./schemaReview";

export interface EntityNoteInput {
  text: string;
  todo: boolean;
  done: boolean;
  updatedAt: number;
  meta?: InboxMeta;
}

export interface LiveNotesInput {
  orgScopeId: string;
  text: string;
  updatedAt: number | null;
  todos?: CanvasTodo[];
  entities: Record<string, EntityNoteInput>;
  labels: Map<string, string>;
}

export interface SnapshotMetaInput {
  notes?: string;
  meta?: InboxMeta;
}

export interface SnapshotInput {
  snapshot: ErdSnapshot & { noteMeta?: InboxMeta };
  orgScopeId: string;
}

/** Live schema knowledge for staleness resolution. Pure data, no fetching. */
export interface StaleContext {
  knownApis: Set<string>;
  entities: Map<string, EntityFacts>;
  fields: Map<string, FieldFacts>;
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
      history: [],
      provenance: { source: "live-canvas" },
    });
  }
  for (const t of input.todos ?? []) {
    items.push({
      id: `live-canvas-todo-${t.id}`,
      orgScopeId,
      canvasId: "live",
      canvasName: "Live canvas",
      kind: "task",
      status: t.status === "done" ? "resolved" : t.status,
      title: t.title.trim() || "Untitled TODO",
      body: t.body ?? "",
      anchor: { type: "canvas", id: "live" },
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      stale: "ok",
      owner: t.assignee,
      dueDate: t.dueDate,
      history: [],
      provenance: { source: "live-canvas" },
    });
  }
  for (const [api, n] of Object.entries(entities)) {
    if (!n.text.trim() && !n.todo && !n.meta) continue;
    const meta = n.meta ?? {};
    const kind = meta.kind ?? (n.todo ? "task" : "note");
    items.push({
      id: `live-entity-${api}`,
      orgScopeId,
      canvasId: "live",
      canvasName: "Live canvas",
      kind,
      status: n.done ? "resolved" : (meta.status ?? "open"),
      title: labels.get(api) ?? api,
      body: n.text,
      anchor: meta.anchor ?? { type: "entity", id: api, labelAtCreation: labels.get(api) },
      createdAt: n.updatedAt,
      updatedAt: n.updatedAt,
      stale: "unknown",
      owner: meta.owner,
      team: meta.team,
      priority: meta.priority,
      dueDate: meta.dueDate,
      resolution: meta.resolution,
      decisionState: meta.decisionState,
      fingerprint: meta.fingerprint,
      anchorFacts: meta.anchorFacts,
      history: meta.history ?? [],
      provenance: { source: "live-entity" },
    });
  }
  return items;
}

export function normalizeSnapshotNotes(input: SnapshotInput): ArchitectureInboxItem[] {
  const { snapshot, orgScopeId } = input;
  if (!snapshot.notes?.trim()) return [];
  const meta = snapshot.noteMeta ?? {};
  return [
    {
      id: `snap-${snapshot.id}`,
      orgScopeId,
      canvasId: snapshot.id,
      canvasName: snapshot.name,
      kind: meta.kind ?? "note",
      status: meta.status ?? "open",
      title: `Snapshot notes - ${snapshot.name}`,
      body: snapshot.notes,
      anchor: meta.anchor ?? { type: "canvas", id: snapshot.id, labelAtCreation: snapshot.name },
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.createdAt,
      stale: "unknown",
      owner: meta.owner,
      team: meta.team,
      priority: meta.priority,
      dueDate: meta.dueDate,
      resolution: meta.resolution,
      decisionState: meta.decisionState,
      fingerprint: meta.fingerprint,
      anchorFacts: meta.anchorFacts,
      history: meta.history ?? [],
      provenance: { source: "snapshot", snapshotId: snapshot.id },
    },
  ];
}

/** Resolve "unknown" staleness against live schema knowledge. Pure. */
export function resolveStale(
  items: ArchitectureInboxItem[],
  ctx: StaleContext
): ArchitectureInboxItem[] {
  return items.map((item) => {
    if (item.stale !== "unknown") return item;
    const anchor = item.anchor;
    if (anchor.type === "entity") {
      if (!ctx.knownApis.has(anchor.id)) return { ...item, stale: "missing" as StaleState };
      if (item.fingerprint) {
        const live = ctx.entities.get(anchor.id);
        if (live && fingerprintEntity(live) !== item.fingerprint.value) {
          return { ...item, stale: "changed" as StaleState };
        }
      }
      return { ...item, stale: "ok" as StaleState };
    }
    if (anchor.type === "field" || anchor.type === "relationship") {
      const live = ctx.fields.get(anchor.id);
      if (!live) return { ...item, stale: "missing" as StaleState };
      if (item.fingerprint && fingerprintField(live) !== item.fingerprint.value) {
        return { ...item, stale: "changed" as StaleState };
      }
      return { ...item, stale: "ok" as StaleState };
    }
    return { ...item, stale: "ok" as StaleState };
  });
}

function matchesQuery(item: ArchitectureInboxItem, q: InboxQuery): boolean {
  if (q.kinds.length > 0 && !q.kinds.includes(item.kind)) return false;
  if (q.statuses.length > 0 && !q.statuses.includes(item.status)) return false;
  if (q.canvases.length > 0 && !q.canvases.includes(item.canvasId)) return false;
  if (q.staleOnly && item.stale !== "missing" && item.stale !== "changed") return false;
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
    if (item.stale === "missing" || item.stale === "changed") counts.stale++;
  }
  return counts;
}

export { firstLine };
