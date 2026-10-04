"use client";

import { useState } from "react";
import { AiMarkdown } from "@/components/ai/Markdown";
import {
  CONSOLE_PRIORITIES,
  CONSOLE_STATUS_LABELS,
  CONSOLE_STATUSES,
  type ConsolePriority,
  type ConsoleStatus,
} from "@/lib/console/model";

export interface NewTaskDraft {
  title: string;
  body?: string;
  status: ConsoleStatus;
  priority: ConsolePriority;
  dueDate?: string;
}

/**
 * Proper task creation: title, description, status, priority and due date
 * up front - no more instant "Untitled task" rows.
 */
export function NewTaskDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (d: NewTaskDraft) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [descTab, setDescTab] = useState<"write" | "preview">("write");
  const [status, setStatus] = useState<ConsoleStatus>("open");
  const [priority, setPriority] = useState<ConsolePriority>("normal");
  const [dueDate, setDueDate] = useState("");

  const clean = title.trim();
  const submit = () => {
    if (!clean) return;
    onCreate({
      title: clean.slice(0, 160),
      ...(body.trim() ? { body: body.trim().slice(0, 12000) } : {}),
      status,
      priority,
      ...(dueDate ? { dueDate } : {}),
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Log a task" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-5" onClick={onClose}>
      <div className="flex h-[calc(100vh-40px)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#E8E2D8] px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-[#27241F]">Log a task</h3>
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-[#A39B8E]">Console queue · autosaved to this browser</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <div>
            <label htmlFor="new-task-title" className="mb-1 block text-[12px] font-semibold text-[#3A352D]">Title</label>
            <input
              id="new-task-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 160))}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="e.g. ERD the Order object before the workshop"
              spellCheck={false}
              className="w-full rounded-lg border border-[#E8E2D8] bg-white px-3 py-2 text-[13px] text-[#27241F] placeholder-[#A39B8E] focus:border-[#C9A86A] focus:outline-none"
            />
          </div>
          <div className="flex min-h-40 flex-1 flex-col">
            <div className="mb-1 flex items-center gap-2">
              <label htmlFor="new-task-body" className="text-[12px] font-semibold text-[#3A352D]">
                Description <span className="font-normal text-[#A39B8E]">· markdown</span>
              </label>
              <span className="ml-auto inline-flex overflow-hidden rounded-lg border border-[#E8E2D8]" role="group" aria-label="Description mode">
                {(["write", "preview"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDescTab(t)}
                    aria-pressed={descTab === t}
                    className={`cursor-pointer px-2 py-0.5 text-[11px] font-semibold capitalize ${descTab === t ? "bg-[#27241F] text-[#F5F1E8]" : "bg-white text-[#777168] hover:text-[#27241F]"}`}
                  >
                    {t}
                  </button>
                ))}
              </span>
            </div>
            {descTab === "write" ? (
              <textarea
                id="new-task-body"
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 12000))}
                placeholder={"What needs doing, acceptance criteria, links…\n\n- [ ] first step\n- [ ] second step"}
                spellCheck={false}
                className="w-full min-h-40 flex-1 resize-none rounded-lg border border-[#E8E2D8] bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-[#27241F] placeholder-[#A39B8E] focus:border-[#C9A86A] focus:outline-none"
              />
            ) : (
              <div className="min-h-40 flex-1 overflow-y-auto rounded-lg border border-[#E8E2D8] bg-[#FBFAF7] px-3 py-2">
                {body.trim() ? (
                  <AiMarkdown content={body} />
                ) : (
                  <p className="text-[12px] text-[#A39B8E]">Nothing to preview yet — switch back to Write.</p>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3 border-t border-[#E8E2D8] pt-3">
            <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#3A352D]">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ConsoleStatus)}
                className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[12px] font-normal text-[#27241F] focus:border-[#C9A86A] focus:outline-none"
              >
                {CONSOLE_STATUSES.map((s) => (
                  <option key={s} value={s}>{CONSOLE_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#3A352D]">
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ConsolePriority)}
                className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[12px] font-normal capitalize text-[#27241F] focus:border-[#C9A86A] focus:outline-none"
              >
                {CONSOLE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#3A352D]">
              Due
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[12px] font-normal text-[#27241F] focus:border-[#C9A86A] focus:outline-none"
              />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#E8E2D8] px-5 py-3">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg border border-[#E8E2D8] px-3 py-1.5 text-xs font-semibold text-[#27241F] hover:border-[#C9A86A]">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!clean}
            className="cursor-pointer rounded-lg bg-[#27241F] px-3 py-1.5 text-xs font-semibold text-[#F5F1E8] hover:bg-[#3A352D] disabled:cursor-default disabled:opacity-40"
          >
            Log task
          </button>
        </div>
      </div>
    </div>
  );
}
