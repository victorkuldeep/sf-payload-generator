"use client";

/**
 * Architecture Inbox domain model (Phase 1): a normalized, read-mostly view
 * over existing records - live canvas/entity notes (autosave slice) and
 * manual snapshots (erd-snapshots store). No duplicate editable copies: the
 * Inbox edits the canonical record through caller-supplied writers.
 */

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
  body?: string;
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
  body: string;
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
