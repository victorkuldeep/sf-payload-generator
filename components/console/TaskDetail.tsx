"use client";

import { useEffect, useRef, useState } from "react";
import { AiMarkdown } from "@/components/ai/Markdown";
import {
  checkAttachmentFile,
  deleteAttachment,
  listAttachments,
  readAttachmentFile,
  saveAttachment,
} from "@/lib/console/attachments";
import {
  CONSOLE_PRIORITIES,
  CONSOLE_STATUS_LABELS,
  consoleTaskKey,
  nextStatuses,
  type ConsoleAttachment,
  type ConsolePriority,
  type ConsoleStatus,
  type ConsoleTask,
} from "@/lib/console/model";
import { consoleLinkHref } from "@/lib/console/model";
import type { CanvasLinkView } from "@/lib/console/sync";

const STATUS_PILL: Record<ConsoleStatus, string> = {
  open: "border-[#D8D0C0] bg-white text-[#777168]",
  "in-progress": "border-[#E5C98F] bg-[#F5EEDF] text-[#8A6A2F]",
  blocked: "border-[#E5AFAF] bg-[#F9E9E9] text-[#A02C2C]",
  "awaiting-feedback": "border-[#C3BCE0] bg-[#ECEAF6] text-[#4E4494]",
  resolved: "border-[#B5CFA8] bg-[#EBF2E6] text-[#3E6B34]",
};

const PRIORITY_DOT: Record<ConsolePriority, string> = {
  low: "bg-[#A39B8E]",
  normal: "bg-[#C9A86A]",
  high: "bg-[#C26A2E]",
  critical: "bg-red-700",
};

export function fmtDate(n: number): string {
  return new Date(n).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** JIRA-style task panel: identity, lifecycle, markdown detail, screenshots, links, activity. */
export function TaskDetail({
  task,
  views,
  onClose,
  onMove,
  onNote,
  onLink,
  onUnlink,
  onPatch,
  onDelete,
}: {
  task: ConsoleTask;
  views: CanvasLinkView[];
  onClose: () => void;
  onMove: (to: ConsoleStatus) => void;
  onNote: (text: string) => void;
  onLink: (item: CanvasLinkView) => void;
  onUnlink: (idx: number) => void;
  onPatch: (patch: Partial<ConsoleTask>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [descTab, setDescTab] = useState<"view" | "edit">("view");
  const [descDraft, setDescDraft] = useState(task.body ?? "");
  const [noteDraft, setNoteDraft] = useState("");
  const [showLinker, setShowLinker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [attachments, setAttachments] = useState<ConsoleAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ConsoleAttachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fresh detail state whenever another task is picked from the queue.
  useEffect(() => {
    setTitle(task.title);
    setDescDraft(task.body ?? "");
    setDescTab("view");
    setNoteDraft("");
    setShowLinker(false);
    setConfirmDelete(false);
    setAttachError(null);
    setLightbox(null);
    void listAttachments(task.id).then(setAttachments);
  }, [task.id, task.title, task.body]);

  const commitTitle = () => {
    const clean = title.trim().slice(0, 160);
    if (clean && clean !== task.title) onPatch({ title: clean });
    else setTitle(task.title);
  };

  const saveDescription = () => {
    const clean = descDraft.trim().slice(0, 12000);
    if ((clean || undefined) !== (task.body || undefined)) onPatch({ body: clean || undefined });
    setDescTab("view");
  };

  const upload = (files: FileList | null) => {
    if (!files) return;
    void (async () => {
      for (const f of Array.from(files)) {
        const gate = checkAttachmentFile({ name: f.name, type: f.type, size: f.size });
        if (!gate.ok) {
          setAttachError(gate.error);
          continue;
        }
        try {
          const att = await readAttachmentFile(task.id, f);
          if (await saveAttachment(att)) setAttachments((prev) => [...prev, att]);
          else setAttachError(`Could not store ${f.name} in this browser.`);
        } catch {
          setAttachError(`Could not read ${f.name}.`);
        }
      }
    })();
  };

  const removeAttachment = async (id: string) => {
    await deleteAttachment(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    if (lightbox?.id === id) setLightbox(null);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={task.title} className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#E8E2D8] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-md bg-[#F0EBE0] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#777168]">
              {consoleTaskKey(task)}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              aria-label="Task title"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-[16px] font-semibold text-[#27241F] focus:outline-none focus:ring-1 focus:ring-[#C9A86A]"
            />
            <button type="button" onClick={onClose} aria-label="Close task" className="cursor-pointer rounded p-1.5 text-[#A39B8E] hover:bg-[#F5F1E8] hover:text-[#27241F]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-[#777168]">
              Status
              <select
                value={task.status}
                onChange={(e) => onMove(e.target.value as ConsoleStatus)}
                aria-label="Task status"
                className={`cursor-pointer rounded-lg border px-2 py-1 text-[12px] font-semibold focus:outline-none ${STATUS_PILL[task.status]}`}
              >
                {[task.status, ...nextStatuses(task.status).filter((s) => s !== task.status)].map((s) => (
                  <option key={s} value={s}>{CONSOLE_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-[#777168]">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
              Priority
              <select
                value={task.priority}
                onChange={(e) => onPatch({ priority: e.target.value as ConsolePriority })}
                aria-label="Task priority"
                className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-2 py-1 text-[12px] capitalize text-[#27241F] focus:border-[#C9A86A] focus:outline-none"
              >
                {CONSOLE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-[#777168]">
              Due
              <input
                type="date"
                value={task.dueDate ?? ""}
                onChange={(e) => onPatch({ dueDate: e.target.value || undefined })}
                aria-label="Due date"
                className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-2 py-1 text-[12px] text-[#27241F] focus:border-[#C9A86A] focus:outline-none"
              />
            </label>
            <span className="ml-auto font-mono text-[10px] text-[#A39B8E]">logged {fmtDate(task.createdAt)}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <div className="flex items-center gap-2">
              <h4 className="font-mono text-[9px] uppercase tracking-[2px] text-[#A39B8E]">Description · markdown</h4>
              <span className="ml-auto inline-flex overflow-hidden rounded-lg border border-[#E8E2D8]" role="group" aria-label="Description mode">
                {(["view", "edit"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      if (t === "edit") setDescDraft(task.body ?? "");
                      setDescTab(t);
                    }}
                    aria-pressed={descTab === t}
                    className={`cursor-pointer px-2 py-0.5 text-[11px] font-semibold capitalize ${descTab === t ? "bg-[#27241F] text-[#F5F1E8]" : "bg-white text-[#777168] hover:text-[#27241F]"}`}
                  >
                    {t === "view" ? "Preview" : "Write"}
                  </button>
                ))}
              </span>
            </div>
            {descTab === "view" ? (
              task.body ? (
                <div className="mt-1.5 rounded-xl border border-[#E8E2D8] bg-[#FBFAF7] px-3 py-2">
                  <AiMarkdown content={task.body} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDescTab("edit")}
                  className="mt-1.5 block w-full cursor-pointer rounded-xl border border-dashed border-[#D8D0C0] px-3 py-3 text-left text-[12px] text-[#A39B8E] hover:border-[#C9A86A] hover:text-[#777168]"
                >
                  Add a description — goal, acceptance criteria, context…
                </button>
              )
            ) : (
              <div className="mt-1.5">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value.slice(0, 12000))}
                  rows={7}
                  autoFocus
                  placeholder={"## Goal\n\nWhat done looks like.\n\n- [ ] acceptance one\n- [ ] acceptance two"}
                  spellCheck={false}
                  aria-label="Task description markdown"
                  className="w-full resize-y rounded-xl border border-[#E8E2D8] bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-[#27241F] placeholder-[#A39B8E] focus:border-[#C9A86A] focus:outline-none"
                />
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDescDraft(task.body ?? "");
                      setDescTab("view");
                    }}
                    className="cursor-pointer rounded-lg border border-[#E8E2D8] px-2.5 py-1 text-[12px] font-semibold text-[#27241F] hover:border-[#C9A86A]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveDescription}
                    className="cursor-pointer rounded-lg bg-[#27241F] px-2.5 py-1 text-[12px] font-semibold text-[#F5F1E8] hover:bg-[#3A352D]"
                  >
                    Save description
                  </button>
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2">
              <h4 className="font-mono text-[9px] uppercase tracking-[2px] text-[#A39B8E]">
                Screenshots · {attachments.length} · stored in this browser
              </h4>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="ml-auto cursor-pointer rounded-lg border border-[#E8E2D8] px-2 py-1 text-[11px] font-semibold text-[#27241F] hover:border-[#C9A86A]"
              >
                + Attach
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                aria-label="Attach screenshots"
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {attachError && (
              <p role="alert" className="mt-1.5 rounded-lg border border-[#E5AFAF] bg-[#F9E9E9] px-2.5 py-1.5 text-[12px] text-[#A02C2C]">
                {attachError}{" "}
                <button type="button" onClick={() => setAttachError(null)} className="cursor-pointer underline">Dismiss</button>
              </p>
            )}
            {attachments.length > 0 ? (
              <ul className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {attachments.map((a) => (
                  <li key={a.id} className="group relative overflow-hidden rounded-xl border border-[#E8E2D8] bg-[#FBFAF7]">
                    <button type="button" onClick={() => setLightbox(a)} title={a.name} className="block w-full cursor-pointer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.name} className="aspect-[4/3] w-full object-cover" />
                      <span className="block truncate px-1.5 py-1 text-left font-mono text-[10px] text-[#777168]">{a.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeAttachment(a.id)}
                      aria-label={`Remove ${a.name}`}
                      className="absolute right-1 top-1 cursor-pointer rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[12px] text-[#A39B8E]">No screenshots yet — pin error states, ERDs, review markups. They travel with export.</p>
            )}
          </section>

          <section>
            <h4 className="font-mono text-[9px] uppercase tracking-[2px] text-[#A39B8E]">Links · two-way with canvas</h4>
            <ul className="mt-1 space-y-1">
              {task.links.map((l, i) => (
                <li key={`${l.recordId}-${l.todoId ?? "record"}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-[#E8E2D8] px-2 py-1.5">
                  <a
                    href={consoleLinkHref(l)}
                    title={`Open in ${l.surface} tab`}
                    className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#3A352D] hover:text-[#8A6A2F] hover:underline"
                  >
                    {l.label}
                  </a>
                  <span className="shrink-0 font-mono text-[9px] uppercase text-[#A39B8E]">{l.surface}</span>
                  <button type="button" onClick={() => onUnlink(i)} aria-label={`Unlink ${l.label}`} className="shrink-0 cursor-pointer rounded p-1 text-[#C9BFAE] hover:bg-red-500/10 hover:text-red-700">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setShowLinker((v) => !v)} className="mt-1.5 cursor-pointer text-[12px] font-semibold text-[#8A6A2F] hover:underline">
              {showLinker ? "Hide canvas items" : "+ Link a canvas TODO or note"}
            </button>
            {showLinker && (
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[#E8E2D8] bg-[#FBFAF7] p-1.5">
                {views.map((v) => {
                  const linked = task.links.some((l) => l.recordId === v.recordId && (l.todoId ?? "") === (v.todoId ?? ""));
                  return (
                    <li key={`${v.recordId}-${v.todoId ?? "notes"}`}>
                      <button
                        type="button"
                        disabled={linked}
                        onClick={() => onLink(v)}
                        className="block w-full cursor-pointer rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white disabled:cursor-default disabled:opacity-50"
                      >
                        <span className="block truncate text-[12px] font-semibold text-[#27241F]">
                          {v.todoId ? `${v.recordName} · ${v.title}` : v.title}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-[#A39B8E]">
                          {v.status ? CONSOLE_STATUS_LABELS[v.status] : "Note"} · {v.recordName}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {views.length === 0 && <li className="px-2 py-2 text-[12px] text-[#A39B8E]">No canvas TODOs yet — add some on a System project.</li>}
              </ul>
            )}
          </section>

          <section>
            <h4 className="font-mono text-[9px] uppercase tracking-[2px] text-[#A39B8E]">Notes · sync to linked TODOs</h4>
            <ul className="mt-1 space-y-1.5">
              {task.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-[#FBFAF7] px-2.5 py-1.5">
                  <AiMarkdown content={n.text} />
                  <p className="mt-0.5 font-mono text-[10px] text-[#A39B8E]">{fmtDate(n.at)}</p>
                </li>
              ))}
              {task.notes.length === 0 && <li className="text-[12px] text-[#A39B8E]">No notes yet.</li>}
            </ul>
            <div className="mt-1.5">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={2}
                placeholder="Add a note (markdown) — pushes to linked canvas TODOs"
                aria-label="New note"
                spellCheck={false}
                className="w-full resize-y rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[12px] text-[#27241F] placeholder-[#A39B8E] focus:border-[#C9A86A] focus:outline-none"
              />
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  disabled={!noteDraft.trim()}
                  onClick={() => {
                    onNote(noteDraft);
                    setNoteDraft("");
                  }}
                  className="cursor-pointer rounded-lg bg-[#27241F] px-2.5 py-1.5 text-xs font-semibold text-[#F5F1E8] hover:bg-[#3A352D] disabled:cursor-default disabled:opacity-40"
                >
                  Add note
                </button>
              </div>
            </div>
          </section>

          <section>
            <h4 className="font-mono text-[9px] uppercase tracking-[2px] text-[#A39B8E]">Activity</h4>
            <ul className="mt-1 space-y-1">
              {[...task.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="text-[12px] text-[#777168]">
                  {h.what} <span className="font-mono text-[10px] text-[#A39B8E]">· {fmtDate(h.at)}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="border-t border-[#E8E2D8] pt-3">
            <button type="button" onClick={() => setConfirmDelete(true)} className="cursor-pointer text-[12px] text-[#A39B8E] hover:text-red-700 hover:underline">
              Delete this task
            </button>
          </div>
        </div>
      </div>

      {lightbox && (
        <div role="dialog" aria-modal="true" aria-label={lightbox.name} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6" onClick={() => setLightbox(null)}>
          <div className="max-h-full max-w-4xl overflow-auto rounded-2xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.dataUrl} alt={lightbox.name} className="max-h-[70vh] w-auto max-w-full rounded-xl" />
            <div className="flex items-center gap-2 px-1 pb-1 pt-2">
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#3A352D]">{lightbox.name}</span>
              <a href={lightbox.dataUrl} download={lightbox.name} className="cursor-pointer rounded-lg border border-[#E8E2D8] px-2 py-1 text-[11px] font-semibold text-[#27241F] hover:border-[#C9A86A]">
                Download
              </a>
              <button type="button" onClick={() => void removeAttachment(lightbox.id)} className="cursor-pointer rounded-lg border border-[#E8E2D8] px-2 py-1 text-[11px] font-semibold text-red-700 hover:border-red-300">
                Delete
              </button>
              <button type="button" onClick={() => setLightbox(null)} className="cursor-pointer rounded-lg bg-[#27241F] px-2 py-1 text-[11px] font-semibold text-[#F5F1E8]">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div role="alertdialog" aria-modal="true" aria-label="Delete task" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-[14px] font-semibold text-[#27241F]">Delete {consoleTaskKey(task)}?</h4>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[#777168]">
              “{task.title}” goes away with its description, notes, screenshots and links. Linked canvas TODOs stay untouched.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="cursor-pointer rounded-lg border border-[#E8E2D8] px-3 py-1.5 text-xs font-semibold text-[#27241F] hover:border-[#C9A86A]">
                Keep
              </button>
              <button type="button" onClick={onDelete} className="cursor-pointer rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800">
                Delete task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
