"use client";

import { useState } from "react";
import Button from "../ui/Button";
import { renderMarkdownLite, toggleTaskLine } from "../erd/notesMd";
import { CanvasTodoCard } from "../notes/CanvasTodoCard";
import type { CanvasTodo } from "@/lib/inbox/types";

/**
 * Project notes & TODOs (System Design): markdown Write/Preview, full TODO
 * engine, Markdown download. Writes route through parent mutate() so every
 * keystroke is undoable and autosaved with the project.
 */
export function ProjectNotesModal({
  open,
  onClose,
  projectName,
  notes,
  todos,
  onNotes,
  onAddTodo,
  onPatchTodo,
  onDeleteTodo,
}: {
  open: boolean;
  onClose: () => void;
  projectName: string;
  notes: string;
  todos: CanvasTodo[];
  onNotes: (text: string) => void;
  onAddTodo: () => string;
  onPatchTodo: (id: string, patch: Partial<CanvasTodo>) => void;
  onDeleteTodo: (id: string) => void;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!open) return null;
  const openCount = todos.filter((t) => t.status !== "done").length;

  const download = () => {
    const d = new Date();
    const pad = (v: number) => String(v).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const slug = projectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "architecture";
    const todoLines = todos.map((t) => `- [${t.status === "done" ? "x" : " "}] ${t.title.trim() || "Untitled TODO"}`).join("\n");
    const body = `# ${projectName} - design notes\n\n${notes}${todos.length > 0 ? `\n\n## TODOs\n\n${todoLines}\n` : ""}`;
    const blob = new Blob([body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `design-notes-${slug}-${stamp}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="notes-title" onClick={onClose}>
      <div
        className="modal-card max-w-2xl flex flex-col"
        style={{ maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-line-soft)] px-6 pt-5 pb-4 shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
              Project notes · {projectName}
            </p>
            <h2 id="notes-title" className="mt-1 text-lg font-bold text-ivory-950">
              Design Notes{openCount > 0 ? ` · ${openCount} open TODO${openCount === 1 ? "" : "s"}` : ""}
            </h2>
          </div>
          <div className="flex rounded-lg border border-[var(--color-line)] overflow-hidden" role="tablist" aria-label="Notes mode">
            {(["write", "preview"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors cursor-pointer ${tab === t ? "bg-ivory-950 text-ivory-100" : "text-ivory-600 hover:text-ivory-950"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notes"
            className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-700">
                TODOs ({todos.length})
              </p>
              <button
                type="button"
                onClick={() => {
                  const id = onAddTodo();
                  setExpandedId(id);
                }}
                className="rounded-lg bg-ivory-950 px-2.5 py-1 text-[11px] font-semibold text-ivory-100 hover:bg-bronze-600 transition-colors cursor-pointer"
              >
                + TODO
              </button>
            </div>
            {todos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--color-line)] px-3 py-2.5 text-[11px] text-ivory-500">
                No TODOs yet - track design work with assignees and due dates.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {todos.map((t) => (
                  <CanvasTodoCard
                    key={t.id}
                    todo={t}
                    expanded={expandedId === t.id}
                    onToggleExpand={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                    onPatch={(patch) => onPatchTodo(t.id, patch)}
                    onDelete={() => {
                      if (expandedId === t.id) setExpandedId(null);
                      onDeleteTodo(t.id);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>

          {tab === "write" ? (
            <textarea
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              placeholder={"# Design log\n- [ ] Confirm the ServiceNow mapping\n- 14:32 — middleware retry policy…"}
              spellCheck={false}
              aria-label="Project design notes (markdown)"
              rows={10}
              className="min-h-[220px] w-full resize-y rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)] p-3 font-mono text-xs leading-relaxed text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
            />
          ) : (
            <div className="min-h-[220px] break-words overflow-x-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)] p-3">
              {notes.trim() ? (
                renderMarkdownLite(notes, (idx) => {
                  const lines = notes.split("\n");
                  const line = lines[idx] ?? "";
                  const m = /^(\s*[-*]\s+\[)([ xX])(\]\s+.*)$/.exec(line);
                  if (!m) return;
                  lines[idx] = `${m[1]}${m[2] === " " ? "x" : " "}${m[3]}`;
                  onNotes(lines.join("\n"));
                })
              ) : (
                <p className="text-xs text-ivory-500">Nothing to preview yet - write some markdown.</p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-ivory-500">
              {notes.trim().split(/\s+/).filter(Boolean).length} words · markdown-lite · saved with the project
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {notes.trim() && (
                <button
                  type="button"
                  onClick={() => onNotes("")}
                  className="text-[10px] text-ivory-500 hover:text-red-700 underline cursor-pointer"
                >
                  Delete note
                </button>
              )}
              {notes.trim() && (
                <button
                  type="button"
                  onClick={download}
                  title="Download notes + TODOs as a Markdown file"
                  aria-label="Download notes as Markdown"
                  className="rounded p-1 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-200 transition-colors cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-[var(--color-line-soft)] shrink-0 flex justify-end">
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
