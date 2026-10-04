import { z } from "zod";

/**
 * Console domain model - the architect's personal task console.
 *
 * ConsoleTask is the writable personal layer. Canvas records (System project
 * TODOs/notes) are addressed through links, never duplicated: the sync engine
 * (lib/console/sync.ts) pulls them into linked views and pushes Console edits
 * back to the owning record. Last-write-wins on updatedAt; every cross-write
 * appends history on both sides.
 */

export const CONSOLE_STATUSES = ["open", "in-progress", "resolved"] as const;
export type ConsoleStatus = (typeof CONSOLE_STATUSES)[number];

export const CONSOLE_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type ConsolePriority = (typeof CONSOLE_PRIORITIES)[number];

/** Address of a canvas record this task tracks. */
export interface ConsoleLink {
  /** Owning surface. Only "system" syncs two-way in v1; others are jump links. */
  surface: "system" | "wireframe" | "sequence" | "draw" | "schema";
  /** Owning record id (e.g. System project id). */
  recordId: string;
  /** Canvas TODO id when tracking one TODO; absent when tracking the whole record. */
  todoId?: string;
  /** Display label captured at link time - refreshed on pull. */
  label: string;
}

export interface ConsoleNote {
  id: string;
  at: number;
  text: string;
}

export interface ConsoleHistoryEntry {
  at: number;
  what: string;
}

export interface ConsoleTask {
  id: string;
  title: string;
  body?: string;
  status: ConsoleStatus;
  priority: ConsolePriority;
  dueDate?: string;
  links: ConsoleLink[];
  notes: ConsoleNote[];
  history: ConsoleHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}

export function newConsoleTask(title: string, now = Date.now()): ConsoleTask {
  const clean = title.trim().slice(0, 160);
  return {
    id: `task_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    title: clean,
    status: "open",
    priority: "normal",
    links: [],
    notes: [],
    history: [{ at: now, what: "Logged in Console." }],
    createdAt: now,
    updatedAt: now,
  };
}

const linkSchema = z.object({
  surface: z.enum(["system", "wireframe", "sequence", "draw", "schema"]),
  recordId: z.string().min(1).max(160),
  todoId: z.string().min(1).max(160).optional(),
  label: z.string().max(200),
});

export const consoleTaskSchema: z.ZodType<ConsoleTask> = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(160),
  body: z.string().max(4000).optional(),
  status: z.enum(CONSOLE_STATUSES),
  priority: z.enum(CONSOLE_PRIORITIES),
  dueDate: z.string().max(32).optional(),
  links: z.array(linkSchema).max(24),
  notes: z
    .array(z.object({ id: z.string().min(1), at: z.number(), text: z.string().min(1).max(4000) }))
    .max(200),
  history: z.array(z.object({ at: z.number(), what: z.string().min(1).max(500) })).max(500),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/** Status transitions. resolved is terminal unless explicitly reopened. */
export function canTransition(from: ConsoleStatus, to: ConsoleStatus): boolean {
  if (from === to) return true;
  if (from === "open" && (to === "in-progress" || to === "resolved")) return true;
  if (from === "in-progress" && (to === "resolved" || to === "open")) return true;
  if (from === "resolved" && to === "open") return true;
  return false;
}

export function moveTask(task: ConsoleTask, to: ConsoleStatus, now = Date.now()): ConsoleTask {
  if (!canTransition(task.status, to)) return task;
  if (task.status === to) return task;
  return {
    ...task,
    status: to,
    updatedAt: now,
    history: [...task.history, { at: now, what: `Moved ${task.status} → ${to}.` }].slice(-500),
  };
}

export function addNote(task: ConsoleTask, text: string, now = Date.now()): ConsoleTask {
  const clean = text.trim().slice(0, 4000);
  if (!clean) return task;
  return {
    ...task,
    notes: [...task.notes, { id: `note_${now.toString(36)}`, at: now, text: clean }].slice(-200),
    updatedAt: now,
    history: [...task.history, { at: now, what: "Note added." }].slice(-500),
  };
}
