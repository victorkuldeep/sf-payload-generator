import { noteToTodoBody, todoBodyToNote, type CanvasTodo, type CanvasTodoStatus } from "@/lib/inbox/types";
import { appendNoteLine } from "@/lib/notes/notebody";
import type { SystemProject } from "@/lib/system-design/model";
import { listSystemProjects, loadSystemProject, saveSystemProject } from "@/lib/system-design/store";
import type { ConsoleStatus } from "./model";

/**
 * Two-way console sync. Surfaces plug in as adapters; v1 ships System.
 *
 * Pull: canvas TODOs/notes become linked view models (never copies).
 * Push: Console edits write back through the surface's own store writers.
 * Guard: a push is refused as stale when the canvas record moved on
 * (updatedAt newer than the pulled snapshot) instead of clobbering.
 */

export type SyncSurface = "system";

export interface CanvasLinkView {
  surface: SyncSurface;
  recordId: string;
  recordName: string;
  todoId?: string;
  title: string;
  status: ConsoleStatus | null;
  updatedAt: number;
  excerpt?: string;
}

export interface PushResult {
  ok: boolean;
  stale?: boolean;
  error?: string;
}

/**
 * One lifecycle everywhere: only the terminal differs (done ↔ resolved).
 * Every working state - open, in-progress, blocked, awaiting-feedback -
 * syncs verbatim in both directions, canvas TODOs included.
 */
export function canvasToConsole(status: CanvasTodoStatus): ConsoleStatus {
  return status === "done" ? "resolved" : status;
}

export function consoleToCanvas(status: ConsoleStatus): CanvasTodoStatus {
  return status === "resolved" ? "done" : status;
}

export interface SystemStoreFns {
  list: () => Promise<{ id: string; name: string; updatedAt: number }[]>;
  load: (id: string) => Promise<SystemProject | null>;
  save: (p: SystemProject) => Promise<unknown>;
}

const liveFns: SystemStoreFns = { list: listSystemProjects, load: loadSystemProject, save: saveSystemProject };

/** Pull every System TODO + project note as linkable views. */
export async function pullSystem(fns: SystemStoreFns = liveFns): Promise<CanvasLinkView[]> {
  const metas = await fns.list().catch(() => []);
  const views: CanvasLinkView[] = [];
  for (const m of metas) {
    const project = await fns.load(m.id).catch(() => null);
    if (!project) continue;
    for (const todo of project.todos ?? []) {
      views.push({
        surface: "system",
        recordId: project.id,
        recordName: project.name,
        todoId: todo.id,
        title: todo.title,
        status: canvasToConsole(todo.status),
        updatedAt: todo.updatedAt ?? project.updatedAt,
        excerpt: todo.body?.slice(0, 120),
      });
    }
    if (project.notes && project.notes.trim()) {
      views.push({
        surface: "system",
        recordId: project.id,
        recordName: project.name,
        title: `Design notes — ${project.name}`,
        status: null,
        updatedAt: project.updatedAt,
        excerpt: project.notes.trim().slice(0, 120),
      });
    }
  }
  return views.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Push a Console status move back onto a canvas TODO. */
export async function pushTodoStatus(
  fns: SystemStoreFns,
  recordId: string,
  todoId: string,
  to: CanvasTodoStatus,
  knownUpdatedAt: number,
  now = Date.now(),
): Promise<PushResult> {
  const project = await fns.load(recordId).catch(() => null);
  if (!project) return { ok: false, error: "Canvas project is gone." };
  const todos = [...(project.todos ?? [])];
  const i = todos.findIndex((t) => t.id === todoId);
  if (i < 0) return { ok: false, error: "Canvas TODO is gone." };
  const current = todos[i];
  if ((current.updatedAt ?? 0) > knownUpdatedAt) return { ok: false, stale: true };
  const next: CanvasTodo = { ...current, status: to, updatedAt: now };
  todos[i] = next;
  await fns.save({ ...project, todos, updatedAt: now });
  return { ok: true };
}

/** Push a Console note into a canvas TODO body (appended, never replaced). */
export async function pushTodoNote(
  fns: SystemStoreFns,
  recordId: string,
  todoId: string,
  text: string,
  knownUpdatedAt: number,
  now = Date.now(),
): Promise<PushResult> {
  const clean = text.trim().slice(0, 2000);
  if (!clean) return { ok: false, error: "Empty note." };
  const project = await fns.load(recordId).catch(() => null);
  if (!project) return { ok: false, error: "Canvas project is gone." };
  const todos = [...(project.todos ?? [])];
  const i = todos.findIndex((t) => t.id === todoId);
  if (i < 0) return { ok: false, error: "Canvas TODO is gone." };
  const current = todos[i];
  if ((current.updatedAt ?? 0) > knownUpdatedAt) return { ok: false, stale: true };
  const stamp = new Date(now).toLocaleString();
  const next = appendNoteLine(todoBodyToNote(current), `[Console ${stamp}] ${clean}`);
  todos[i] = { ...current, ...noteToTodoBody(next), updatedAt: now };
  await fns.save({ ...project, todos, updatedAt: now });
  return { ok: true };
}

export const liveSystemFns: SystemStoreFns = liveFns;
