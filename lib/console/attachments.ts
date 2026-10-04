import { z } from "zod";
import { STORES, withStore } from "@/lib/db";
import {
  CONSOLE_ATTACHMENT_MAX_BYTES,
  CONSOLE_ATTACHMENT_MIMES,
  type ConsoleAttachment,
} from "./model";

/**
 * Console attachments: screenshots pinned to a task. Bytes live in their own
 * `console-attachments` store (DB v22) keyed by id - the task record only
 * carries counts, so the queue stays light and export stays portable.
 */

export const consoleAttachmentSchema: z.ZodType<ConsoleAttachment> = z.object({
  id: z.string().min(1).max(160),
  taskId: z.string().min(1).max(160),
  name: z.string().min(1).max(200),
  mime: z.string().min(1).max(100),
  size: z.number().int().nonnegative(),
  dataUrl: z.string().min(1).max(8 * 1024 * 1024),
  at: z.number(),
});

export interface PickedFile {
  name: string;
  type: string;
  size: number;
}

/** Pure gate for the file picker - images only, 3 MB cap. No DOM needed. */
export function checkAttachmentFile(file: PickedFile): { ok: true } | { ok: false; error: string } {
  if (!(CONSOLE_ATTACHMENT_MIMES as readonly string[]).includes(file.type)) {
    return { ok: false, error: `${file.name || "File"} is not a screenshot (PNG, JPEG, WebP or GIF).` };
  }
  if (file.size > CONSOLE_ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: `${file.name || "File"} is ${(file.size / 1048576).toFixed(1)} MB - keep screenshots under 3 MB.` };
  }
  if (file.size <= 0) return { ok: false, error: `${file.name || "File"} is empty.` };
  return { ok: true };
}

/** Browser-only: read a picked file into a ConsoleAttachment. */
export function readAttachmentFile(taskId: string, file: File, now = Date.now()): Promise<ConsoleAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        reject(new Error("Could not read file."));
        return;
      }
      resolve(
        consoleAttachmentSchema.parse({
          id: `att_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
          taskId,
          name: file.name.slice(0, 200) || "screenshot",
          mime: file.type,
          size: file.size,
          dataUrl,
          at: now,
        }),
      );
    };
    reader.readAsDataURL(file);
  });
}

export async function listAttachments(taskId: string): Promise<ConsoleAttachment[]> {
  try {
    const all = await withStore<ConsoleAttachment[]>(STORES.consoleAttachments, "readonly", (s) => s.getAll());
    return all.filter((a) => a.taskId === taskId).sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

export async function listAllAttachments(): Promise<ConsoleAttachment[]> {
  try {
    return await withStore<ConsoleAttachment[]>(STORES.consoleAttachments, "readonly", (s) => s.getAll());
  } catch {
    return [];
  }
}

export async function countAttachments(taskIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (taskIds.length === 0) return out;
  try {
    const all = await withStore<ConsoleAttachment[]>(STORES.consoleAttachments, "readonly", (s) => s.getAll());
    for (const a of all) {
      if (taskIds.includes(a.taskId)) out[a.taskId] = (out[a.taskId] ?? 0) + 1;
    }
  } catch {
    /* safe empty */
  }
  return out;
}

export async function saveAttachment(att: ConsoleAttachment): Promise<boolean> {
  try {
    await withStore(STORES.consoleAttachments, "readwrite", (s) =>
      s.put(consoleAttachmentSchema.parse(att)),
    );
    return true;
  } catch {
    return false;
  }
}

export async function deleteAttachment(id: string): Promise<boolean> {
  try {
    await withStore(STORES.consoleAttachments, "readwrite", (s) => s.delete(id));
    return true;
  } catch {
    return false;
  }
}

export async function deleteTaskAttachments(taskId: string): Promise<void> {
  const all = await listAttachments(taskId);
  for (const a of all) await deleteAttachment(a.id);
}
