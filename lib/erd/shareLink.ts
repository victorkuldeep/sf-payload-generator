"use client";

/**
 * Link-share codec: a slim STRUCTURE payload (api names + positions + view,
 * optional notes) that a teammate resolves against their own org. No field
 * metadata ever leaves the browser - the receiver re-describes locally.
 * Transport-agnostic: same shape rides URL-hash links and the KV backend.
 */

export const SHARE_LINK_VERSION = 1;
export const SHARE_MAX_NODES = 2000;
export const SHARE_MAX_BODY_BYTES = 256 * 1024;

export interface ShareStructure {
  v: number;
  name: string;
  root: string;
  nodes: string[];
  positions: Record<string, { x: number; y: number }>;
  view?: "erd" | "graph";
  notes?: string;
  entityNotes?: Record<string, { text: string; todo: boolean; done: boolean; updatedAt: number }>;
  todos?: {
    id: string;
    title: string;
    body?: string;
    assignee?: string;
    dueDate?: string;
    status: "open" | "in-progress" | "blocked" | "awaiting-feedback" | "done";
    createdAt: number;
    updatedAt: number;
  }[];
}

export function validateShareStructure(raw: unknown): ShareStructure | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.v !== SHARE_LINK_VERSION) return null;
  if (typeof p.root !== "string" || !p.root) return null;
  if (!Array.isArray(p.nodes) || p.nodes.length === 0 || p.nodes.length > SHARE_MAX_NODES) return null;
  if (!p.nodes.every((n): n is string => typeof n === "string" && !!n)) return null;
  if (!p.positions || typeof p.positions !== "object") return null;
  for (const [k, v] of Object.entries(p.positions as Record<string, unknown>)) {
    if (typeof k !== "string") return null;
    const pos = v as { x?: unknown; y?: unknown };
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") return null;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
  }
  if (p.view !== undefined && p.view !== "erd" && p.view !== "graph") return null;
  if (p.notes !== undefined && typeof p.notes !== "string") return null;
  if (p.entityNotes !== undefined) {
    if (!p.entityNotes || typeof p.entityNotes !== "object") return null;
    for (const en of Object.values(p.entityNotes as Record<string, unknown>)) {
      const e = en as { text?: unknown };
      if (!e || typeof e.text !== "string") return null;
    }
  }
  let todos: ShareStructure["todos"];
  if (p.todos !== undefined) {
    if (!Array.isArray(p.todos)) return null;
    todos = [];
    for (const t of p.todos) {
      const todo = t as Record<string, unknown>;
      if (!todo || typeof todo.id !== "string" || !todo.id || typeof todo.title !== "string") return null;
      const status =
        todo.status === "done" ||
        todo.status === "in-progress" ||
        todo.status === "blocked" ||
        todo.status === "awaiting-feedback"
          ? todo.status
          : "open";
      todos.push({
        id: todo.id,
        title: todo.title,
        body: typeof todo.body === "string" ? todo.body : undefined,
        assignee: typeof todo.assignee === "string" ? todo.assignee : undefined,
        dueDate: typeof todo.dueDate === "string" ? todo.dueDate : undefined,
        status,
        createdAt: typeof todo.createdAt === "number" ? todo.createdAt : Date.now(),
        updatedAt: typeof todo.updatedAt === "number" ? todo.updatedAt : Date.now(),
      });
    }
  }
  return {
    v: SHARE_LINK_VERSION,
    name: typeof p.name === "string" && p.name ? p.name : "Shared canvas",
    root: p.root,
    nodes: p.nodes as string[],
    positions: p.positions as ShareStructure["positions"],
    view: p.view as ShareStructure["view"],
    notes: p.notes as string | undefined,
    entityNotes: p.entityNotes as ShareStructure["entityNotes"],
    todos,
  };
}

export function shareStructureBytes(s: ShareStructure): number {
  try {
    return new TextEncoder().encode(JSON.stringify(s)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Short random id for KV keys (32 hex chars, unguessable capability). */
export function newShareId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}${Math.random().toString(36).slice(2, 18)}`.slice(0, 32);
}
