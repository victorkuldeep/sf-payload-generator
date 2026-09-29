"use client";

/**
 * Architecture Inbox domain model (Phase 1): a normalized, read-mostly view
 * over existing records - live canvas/entity notes (autosave slice) and
 * manual snapshots (erd-snapshots store). No duplicate editable copies: the
 * Inbox edits the canonical record through caller-supplied writers.
 */

export type InboxItemKind = "note" | "task" | "question" | "decision";

export type InboxStatus = "open" | "in-progress" | "resolved";

export type AnchorType = "canvas" | "entity" | "field" | "relationship";

export type StaleState = "ok" | "missing" | "unknown";

export interface InboxAnchor {
  type: AnchorType;
  /** Stable API name / canvas id - never a display label alone. */
  id: string;
  labelAtCreation?: string;
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
