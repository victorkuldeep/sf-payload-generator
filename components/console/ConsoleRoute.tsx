"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addNote,
  consoleLinkHref,
  CONSOLE_PRIORITIES,
  CONSOLE_STATUSES,
  moveTask,
  newConsoleTask,
  type ConsoleLink,
  type ConsolePriority,
  type ConsoleStatus,
  type ConsoleTask,
} from "@/lib/console/model";
import { exportConsoleTasks, importConsoleTasks, deleteConsoleTask, listConsoleTasks, saveConsoleTask } from "@/lib/console/store";
import {
  consoleToCanvas,
  liveSystemFns,
  pullSystem,
  pushTodoNote,
  pushTodoStatus,
  type CanvasLinkView,
} from "@/lib/console/sync";

const PRIORITY_DOT: Record<ConsolePriority, string> = {
  low: "bg-[#A39B8E]",
  normal: "bg-[#C9A86A]",
  high: "bg-[#C26A2E]",
  critical: "bg-red-700",
};

const STATUS_LABEL: Record<ConsoleStatus, string> = {
  open: "Open",
  "in-progress": "In Progress",
  resolved: "Resolved",
};

function fmtDate(n: number): string {
  return new Date(n).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ConsoleRoute() {
  const [tasks, setTasks] = useState<ConsoleTask[]>([]);
  const [views, setViews] = useState<CanvasLinkView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"board" | "timeline">("board");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Last-seen canvas timestamps per linked TODO - the stale-write guard.
  const knownRef = useRef(new Map<string, number>());

  const refresh = useCallback(async () => {
    const [t, v] = await Promise.all([listConsoleTasks(), pullSystem(liveSystemFns)]);
    setTasks(t);
    setViews(v);
    for (const item of v) {
      if (item.todoId) knownRef.current.set(`${item.recordId}:${item.todoId}`, item.updatedAt);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = useCallback(async (task: ConsoleTask) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)).sort((a, b) => b.updatedAt - a.updatedAt));
    await saveConsoleTask(task);
  }, []);

  const create = useCallback(async () => {
    const task = newConsoleTask("Untitled task");
    setTasks((prev) => [task, ...prev]);
    await saveConsoleTask(task);
    setSelectedId(task.id);
  }, []);

  /** Push a Console status move back onto every linked canvas TODO. */
  const moveWithSync = useCallback(
    async (task: ConsoleTask, to: ConsoleStatus) => {
      const next = moveTask(task, to);
      if (next === task) return;
      let stale = false;
      for (const link of task.links) {
        if (link.surface !== "system" || !link.todoId) continue;
        const key = `${link.recordId}:${link.todoId}`;
        const r = await pushTodoStatus(liveSystemFns, link.recordId, link.todoId, consoleToCanvas(to), knownRef.current.get(key) ?? 0);
        if (!r.ok && r.stale) stale = true;
      }
      await persist(next);
      if (stale) {
        setNotice("A linked canvas moved on — its side kept the newer state. Pull refreshed below.");
        void refresh();
      }
    },
    [persist, refresh],
  );

  const addNoteWithSync = useCallback(
    async (task: ConsoleTask, text: string) => {
      const next = addNote(task, text);
      if (next === task) return;
      for (const link of task.links) {
        if (link.surface !== "system" || !link.todoId) continue;
        const key = `${link.recordId}:${link.todoId}`;
        await pushTodoNote(liveSystemFns, link.recordId, link.todoId, text, knownRef.current.get(key) ?? 0);
      }
      await persist(next);
    },
    [persist],
  );

  const linkView = useCallback(
    async (task: ConsoleTask, item: CanvasLinkView) => {
      if (task.links.some((l) => l.recordId === item.recordId && (l.todoId ?? "") === (item.todoId ?? ""))) return;
      const link: ConsoleLink = {
        surface: "system",
        recordId: item.recordId,
        ...(item.todoId ? { todoId: item.todoId } : {}),
        label: item.todoId ? `${item.recordName} · ${item.title}` : item.title,
      };
      const next: ConsoleTask = {
        ...task,
        links: [...task.links, link],
        updatedAt: Date.now(),
        history: [...task.history, { at: Date.now(), what: `Linked canvas item: ${link.label}.` }],
      };
      if (item.todoId) {
        knownRef.current.set(`${item.recordId}:${item.todoId}`, item.updatedAt);
        // Adopt the canvas status so both sides start agreed.
        if (item.status && item.status !== next.status) {
          await persist({ ...next, status: item.status });
          return;
        }
      }
      await persist(next);
    },
    [persist],
  );

  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  const timeline = tasks
    .flatMap((t) =>
      [
        ...t.history.map((h) => ({ at: h.at, task: t.title, what: h.what })),
        ...t.notes.map((n) => ({ at: n.at, task: t.title, what: `Note: ${n.text.slice(0, 140)}` })),
      ],
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, 120);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#E8E2D8] bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[#27241F]">Console</h2>
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-[#A39B8E]">
              {tasks.filter((t) => t.status === "open").length} open · {tasks.filter((t) => t.status === "in-progress").length} active ·{" "}
              {views.length} canvas items linked live
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1.5">
            <ViewToggle view={view} setView={setView} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Import a console package JSON from a fellow dev"
              className="cursor-pointer rounded-lg border border-[#E8E2D8] px-2.5 py-1.5 text-xs font-semibold text-[#27241F] transition-colors hover:border-[#C9A86A]"
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([exportConsoleTasks(tasks)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "gravenx-console.json";
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              title="Export all tasks as portable JSON"
              className="cursor-pointer rounded-lg border border-[#E8E2D8] px-2.5 py-1.5 text-xs font-semibold text-[#27241F] transition-colors hover:border-[#C9A86A]"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => void create()}
              className="cursor-pointer rounded-lg bg-[#27241F] px-2.5 py-1.5 text-xs font-semibold text-[#F5F1E8] transition-colors hover:bg-[#3A352D]"
            >
              New task
            </button>
          </span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Import console package"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void f.text().then(async (text) => {
              const { tasks: incoming, error } = importConsoleTasks(text);
              if (error || incoming.length === 0) {
                setNotice(error ?? "Nothing to import.");
                return;
              }
              for (const t of incoming) await saveConsoleTask(t);
              setTasks((prev) => [...incoming, ...prev].sort((a, b) => b.updatedAt - a.updatedAt));
              setNotice(`Imported ${incoming.length} task${incoming.length === 1 ? "" : "s"} (re-id, nothing overwritten).`);
            });
          }}
        />
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-[#E5C98F] bg-[#F5EEDF] px-4 py-2 text-[12px] text-[#5C4A23]">
          {notice} <button type="button" onClick={() => setNotice(null)} className="ml-2 cursor-pointer underline">Dismiss</button>
        </p>
      )}

      {view === "board" ? (
        <div className="grid gap-2.5 md:grid-cols-3">
          {CONSOLE_STATUSES.map((status) => (
            <div key={status} className="rounded-xl border border-[#E8E2D8] bg-[#FBFAF7] p-2">
              <p className="px-1.5 pb-1.5 font-mono text-[10px] uppercase tracking-[2px] text-[#A39B8E]">
                {STATUS_LABEL[status]} · {tasks.filter((t) => t.status === status).length}
              </p>
              <div className="space-y-1.5">
                {tasks
                  .filter((t) => t.status === status)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="block w-full cursor-pointer rounded-xl border border-[#E8E2D8] bg-white px-3 py-2 text-left transition-colors hover:border-[#C9A86A]"
                    >
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#27241F]">{t.title}</span>
                      </span>
                      <span className="mt-1 block truncate font-mono text-[10px] text-[#A39B8E]">
                        {t.links.length > 0 ? `${t.links.length} link${t.links.length === 1 ? "" : "s"} · ` : ""}
                        {t.notes.length} note{t.notes.length === 1 ? "" : "s"}
                        {t.dueDate ? ` · due ${t.dueDate}` : ""}
                      </span>
                    </button>
                  ))}
                {loaded && tasks.filter((t) => t.status === status).length === 0 && (
                  <p className="px-1.5 py-3 text-center text-[11px] text-[#A39B8E]">Nothing here.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ol className="relative ml-2 space-y-0 rounded-xl border border-[#E8E2D8] bg-white px-4 py-3">
          {timeline.map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
              <span aria-hidden="true" className="absolute bottom-0 left-[4px] top-4 w-px bg-[#E8E2D8]" />
              <span aria-hidden="true" className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full border-2 border-[#C9A86A] bg-white" />
              <div className="min-w-0">
                <p className="text-[12px] text-[#3A352D]">
                  <span className="font-semibold text-[#27241F]">{e.task}</span> — {e.what}
                </p>
                <p className="font-mono text-[10px] text-[#A39B8E]">{fmtDate(e.at)}</p>
              </div>
            </li>
          ))}
          {timeline.length === 0 && <p className="py-3 text-center text-[12px] text-[#A39B8E]">Log a task to start the timeline.</p>}
        </ol>
      )}

      {selected && (
        <TaskDrawer
          task={selected}
          views={views}
          onClose={() => setSelectedId(null)}
          onMove={(to) => void moveWithSync(selected, to)}
          onNote={(text) => void addNoteWithSync(selected, text)}
          onLink={(item) => void linkView(selected, item)}
          onUnlink={async (idx) => {
            const next = { ...selected, links: selected.links.filter((_, i) => i !== idx), updatedAt: Date.now() };
            await persist(next);
          }}
          onPatch={async (patch) => {
            await persist({ ...selected, ...patch, updatedAt: Date.now() });
          }}
          onDelete={async () => {
            await deleteConsoleTask(selected.id);
            setTasks((prev) => prev.filter((t) => t.id !== selected.id));
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}

function ViewToggle({ view, setView }: { view: "board" | "timeline"; setView: (v: "board" | "timeline") => void }) {
  return (
    <span className="inline-flex overflow-hidden rounded-lg border border-[#E8E2D8]" role="group" aria-label="Console view">
      {(["board", "timeline"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          aria-pressed={view === v}
          className={`cursor-pointer px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
            view === v ? "bg-[#27241F] text-[#F5F1E8]" : "bg-white text-[#777168] hover:text-[#27241F]"
          }`}
        >
          {v}
        </button>
      ))}
    </span>
  );
}

function TaskDrawer({
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
  const [draft, setDraft] = useState("");
  const [showLinker, setShowLinker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div role="dialog" aria-modal="true" aria-label={task.title} className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[#E8E2D8] px-4 py-3">
          <input
            value={task.title}
            onChange={(e) => void onPatch({ title: e.target.value.slice(0, 160) || "Untitled task" })}
            aria-label="Task title"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-[15px] font-semibold text-[#27241F] focus:outline-none focus:ring-1 focus:ring-[#C9A86A]"
          />
          <button type="button" onClick={onClose} aria-label="Close task" className="cursor-pointer rounded p-1.5 text-[#A39B8E] hover:bg-[#F5F1E8] hover:text-[#27241F]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {CONSOLE_STATUSES.filter((s) => s !== task.status).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onMove(s)}
                className="cursor-pointer rounded-lg border border-[#E8E2D8] px-2 py-1 text-[11px] font-semibold text-[#27241F] transition-colors hover:border-[#C9A86A]"
              >
                Move to {STATUS_LABEL[s]}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1 text-[11px] text-[#777168]">
              Priority
              <select
                value={task.priority}
                onChange={(e) => void onPatch({ priority: e.target.value as ConsolePriority })}
                aria-label="Task priority"
                className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-1.5 py-1 text-[11px] text-[#27241F] focus:border-[#C9A86A] focus:outline-none"
              >
                {CONSOLE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[11px] text-[#777168]">
              Due
              <input
                type="date"
                value={task.dueDate ?? ""}
                onChange={(e) => void onPatch({ dueDate: e.target.value || undefined })}
                aria-label="Due date"
                className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-1.5 py-1 text-[11px] text-[#27241F] focus:border-[#C9A86A] focus:outline-none"
              />
            </label>
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[2px] text-[#A39B8E]">Links · two-way with canvas</p>
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
                  <button type="button" onClick={() => void onUnlink(i)} aria-label={`Unlink ${l.label}`} className="shrink-0 cursor-pointer rounded p-1 text-[#C9BFAE] hover:bg-red-500/10 hover:text-red-700">
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
                          {v.status ? STATUS_LABEL[v.status] : "Note"} · {v.recordName}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {views.length === 0 && <li className="px-2 py-2 text-[12px] text-[#A39B8E]">No canvas TODOs yet — add some on a System project.</li>}
              </ul>
            )}
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[2px] text-[#A39B8E]">Notes · sync to linked TODOs</p>
            <ul className="mt-1 space-y-1.5">
              {task.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-[#FBFAF7] px-2.5 py-1.5">
                  <p className="text-[12px] leading-relaxed text-[#3A352D]">{n.text}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#A39B8E]">{fmtDate(n.at)}</p>
                </li>
              ))}
              {task.notes.length === 0 && <li className="text-[12px] text-[#A39B8E]">No notes yet.</li>}
            </ul>
            <div className="mt-1.5 flex gap-1.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) {
                    onNote(draft);
                    setDraft("");
                  }
                }}
                placeholder="Add a note — pushes to linked canvas TODOs"
                aria-label="New note"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[12px] text-[#27241F] placeholder-[#A39B8E] focus:border-[#C9A86A] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (draft.trim()) {
                    onNote(draft);
                    setDraft("");
                  }
                }}
                className="shrink-0 cursor-pointer rounded-lg bg-[#27241F] px-2.5 py-1.5 text-xs font-semibold text-[#F5F1E8] hover:bg-[#3A352D]"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[2px] text-[#A39B8E]">Activity</p>
            <ul className="mt-1 space-y-1">
              {[...task.history].reverse().slice(0, 20).map((h, i) => (
                <li key={`${h.at}-${i}`} className="text-[12px] text-[#777168]">
                  {h.what} <span className="font-mono text-[10px] text-[#A39B8E]">· {fmtDate(h.at)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-[#E8E2D8] pt-3">
            {confirmDelete ? (
              <p className="text-[12px] text-[#3A352D]">
                Delete this task and its notes?{" "}
                <button type="button" onClick={() => void onDelete()} className="cursor-pointer font-semibold text-red-700 hover:underline">Delete</button>{" "}
                <button type="button" onClick={() => setConfirmDelete(false)} className="cursor-pointer underline">Keep</button>
              </p>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="cursor-pointer text-[12px] text-[#A39B8E] hover:text-red-700 hover:underline">
                Delete this task
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
