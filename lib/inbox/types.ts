"use client";

/**
 * Architecture Inbox domain model (Phase 1): a normalized, read-mostly view
 * over existing records - live canvas/entity notes (autosave slice) and
 * manual snapshots (erd-snapshots store). No duplicate editable copies: the
 * Inbox edits the canonical record through caller-supplied writers.
 */

import { noteBodyFromMd, type NoteBody, type NoteFormat } from "@/lib/notes/notebody";

export type InboxItemKind = "note" | "task" | "question" | "decision";

/** One lifecycle everywhere: Console, canvas TODOs and Inbox share it. */
export type InboxStatus = "open" | "in-progress" | "blocked" | "awaiting-feedback" | "resolved";

export type InboxPriority = "low" | "normal" | "high" | "critical";

export type DecisionState = "proposed" | "confirmed" | "rejected" | "superseded";

/** Canvas-level TODO status. Maps to InboxStatus (done → resolved); the working states are identical. */
export type CanvasTodoStatus = "open" | "in-progress" | "blocked" | "awaiting-feedback" | "done";

/** One canvas TODO: title + lifecycle, tracked individually. */
export interface CanvasTodo {
  id: string;
  title: string;
  /** Markdown side of the details (previews, sync, share). */
  body?: string;
  /** Rich side of the details + the editor last used. Absent on vintage
   * TODOs - the Markdown side migrates them on first touch. */
  bodyFormat?: NoteFormat;
  bodyHtml?: string;
  assignee?: string;
  dueDate?: string;
  status: CanvasTodoStatus;
  createdAt: number;
  updatedAt: number;
}

export type AnchorType = "canvas" | "entity" | "field" | "relationship";

export type StaleState = "ok" | "missing" | "changed" | "unknown";

export interface InboxAnchor {
  type: AnchorType;
  /** Stable API name / canvas id - never a display label alone. */
  id: string;
  labelAtCreation?: string;
}

/** Meaningful-change log entry. Never keystrokes - explicit actions only. */
export interface InboxHistoryEntry {
  at: number;
  what: string;
}

/** Baseline schema facts captured when an anchor is created or reviewed. */
export type AnchorFacts =
  | { kind: "field"; type: string; required: boolean; referenceTo: string[]; label: string }
  | { kind: "entity"; fieldNames: string[]; childNames: string[] };

/** Stored hash + timestamp of the baseline facts. */
export interface InboxFingerprint {
  value: string;
  at: number;
}

/**
 * Optional lifecycle/anchor metadata layered onto existing records.
 * Everything optional - legacy records without meta keep working.
 */
export interface InboxMeta {
  kind?: InboxItemKind;
  status?: InboxStatus;
  owner?: string;
  team?: string;
  priority?: InboxPriority;
  dueDate?: string;
  resolution?: string;
  decisionState?: DecisionState;
  anchor?: InboxAnchor;
  fingerprint?: InboxFingerprint;
  anchorFacts?: AnchorFacts;
  history?: InboxHistoryEntry[];
}

export interface ArchitectureInboxItem {
  /** Stable canonical id: live-canvas | live-entity-<api> | snap-<snapshotId>. */
  id: string;
  orgScopeId: string;
  /** Source canvas: "live" or the snapshot id. Display name resolved by UI. */
  canvasId: string;
  canvasName: string;
  kind: InboxItemKind;
  status: InboxStatus;
  title: string;
  /** Markdown side of the body (search, Action Pack, default display). */
  body: string;
  /** Rich side + the editor last used, passed through from the canonical
   * record. Absent on vintage records - the Markdown side migrates them. */
  bodyFormat?: NoteFormat;
  bodyHtml?: string;
  anchor: InboxAnchor;
  createdAt: number;
  updatedAt: number;
  stale: StaleState;
  owner?: string;
  team?: string;
  priority?: InboxPriority;
  dueDate?: string;
  resolution?: string;
  decisionState?: DecisionState;
  fingerprint?: InboxFingerprint;
  anchorFacts?: AnchorFacts;
  history: InboxHistoryEntry[];
  provenance: {
    source: "live-canvas" | "live-entity" | "snapshot";
    snapshotId?: string;
  };
}

export interface InboxQuery {
  text: string;
  kinds: InboxItemKind[];
  statuses: InboxStatus[];
  /** Canvas ids to include; empty = all. */
  canvases: string[];
  staleOnly: boolean;
}

export const EMPTY_QUERY: InboxQuery = {
  text: "",
  kinds: [],
  statuses: [],
  canvases: [],
  staleOnly: false,
};

/**
 * Stored TODO details triple → editor-ready dual body. Vintage TODOs carry
 * Markdown only and migrate on first touch.
 */
export function todoBodyToNote(t: Pick<CanvasTodo, "body" | "bodyFormat" | "bodyHtml">): NoteBody {
  if (t.bodyFormat === "rich" && t.bodyHtml?.trim()) {
    return { format: "rich", md: t.body ?? "", html: t.bodyHtml };
  }
  return noteBodyFromMd(t.body ?? "");
}

/** Editor draft → storable triple. Empty drafts clear all three sides. */
export function noteToTodoBody(b: NoteBody): Pick<CanvasTodo, "body" | "bodyFormat" | "bodyHtml"> {
  if (!b.md.trim() && !b.html.trim()) return { body: undefined, bodyFormat: undefined, bodyHtml: undefined };
  return { body: b.md, bodyFormat: b.format, bodyHtml: b.html };
}

/** Inbox item body triple → editor-ready dual body (same migration rule). */
export function inboxBodyToNote(t: Pick<ArchitectureInboxItem, "body" | "bodyFormat" | "bodyHtml">): NoteBody {
  if (t.bodyFormat === "rich" && t.bodyHtml?.trim()) {
    return { format: "rich", md: t.body ?? "", html: t.bodyHtml };
  }
  return noteBodyFromMd(t.body ?? "");
}
