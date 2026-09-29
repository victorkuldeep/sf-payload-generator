"use client";

import { useMemo, useState } from "react";
import Button from "../ui/Button";
import { renderMarkdownLite } from "../erd/notesMd";
import { firstLine, queryInbox, countInbox } from "@/lib/inbox/normalize";
import { compileActionPack } from "@/lib/inbox/actionPack";
import {
  EMPTY_QUERY,
  type ArchitectureInboxItem,
  type InboxItemKind,
  type InboxStatus,
} from "@/lib/inbox/types";

export interface InboxCanvas {
  id: string;
  name: string;
}

interface ArchitectureInboxProps {
  open: boolean;
  onClose: () => void;
  orgLabel: string;
  items: ArchitectureInboxItem[];
  canvases: InboxCanvas[];
  onEditBody: (id: string, body: string) => void;
  onSetTaskDone: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onNavigate: (item: ArchitectureInboxItem) => void;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function KindPill({ kind }: { kind: InboxItemKind }) {
  const cls =
    kind === "task"
      ? "bg-ivory-950 text-ivory-100"
      : kind === "question"
        ? "bg-amber-100 text-amber-800 border-amber-300"
        : kind === "decision"
          ? "bg-green-100 text-green-800 border-green-300"
          : "bg-[var(--color-canvas)] text-ivory-700 border-[var(--color-line)]";
  return (
    <span className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-bold capitalize ${cls}`}>
      {kind}
    </span>
  );
}

function StatusPill({ status }: { status: InboxStatus }) {
  const cls =
    status === "resolved"
      ? "bg-green-100 text-green-800 border-green-300"
      : status === "in-progress"
        ? "bg-amber-100 text-amber-800 border-amber-300"
        : "bg-[var(--color-canvas)] text-ivory-700 border-[var(--color-line)]";
  return (
    <span className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold capitalize ${cls}`}>
      {status}
    </span>
  );
}

export function ArchitectureInbox({
  open,
  onClose,
  orgLabel,
  items,
  canvases,
  onEditBody,
  onSetTaskDone,
  onDelete,
  onNavigate,
}: ArchitectureInboxProps) {
  const [text, setText] = useState("");
  const [kinds, setKinds] = useState<InboxItemKind[]>([]);
  const [statuses, setStatuses] = useState<InboxStatus[]>([]);
  const [canvasIds, setCanvasIds] = useState<string[]>([]);
  const [staleOnly, setStaleOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [packScope, setPackScope] = useState<"outstanding" | "all">("outstanding");
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(
    () => queryInbox(items, { text, kinds, statuses, canvases: canvasIds, staleOnly }),
    [items, text, kinds, statuses, canvasIds, staleOnly]
  );
  const counts = useMemo(() => countInbox(items), [items]);
  const selected = filtered.find((i) => i.id === selectedId) ?? items.find((i) => i.id === selectedId) ?? null;

  const grouped = useMemo(() => {
    const map = new Map<string, ArchitectureInboxItem[]>();
    for (const item of filtered) {
      if (!map.has(item.canvasId)) map.set(item.canvasId, []);
      map.get(item.canvasId)!.push(item);
    }
    return [...map.entries()].map(([canvasId, list]) => ({
      canvasId,
      name: canvases.find((c) => c.id === canvasId)?.name ?? list[0]?.canvasName ?? canvasId,
      list,
    }));
  }, [filtered, canvases]);

  const canvasNameOf = (id: string) => canvases.find((c) => c.id === id)?.name ?? id;

  const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const clearFilters = () => {
    setText("");
    setKinds([]);
    setStatuses([]);
    setCanvasIds([]);
    setStaleOnly(false);
  };
  const hasFilters = text.trim() !== "" || kinds.length > 0 || statuses.length > 0 || canvasIds.length > 0 || staleOnly;

  const pack = useMemo(
    () => compileActionPack(filtered, { scope: packScope, orgLabel }),
    [filtered, packScope, orgLabel]
  );

  if (!open) return null;

  const startEdit = () => {
    if (!selected) return;
    setDraft(selected.body);
    setEditing(true);
    setConfirmDelete(false);
  };

  const saveEdit = () => {
    if (!selected) return;
    onEditBody(selected.id, draft);
    setEditing(false);
  };

  const doDelete = () => {
    if (!selected) return;
    onDelete(selected.id);
    setSelectedId(null);
    setEditing(false);
    setConfirmDelete(false);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="inbox-title" onClick={onClose}>
      <div
        className="modal-card max-w-5xl flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-[var(--color-line-soft)] shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
              {orgLabel} · {counts.total} item{counts.total === 1 ? "" : "s"}
            </p>
            <h2 id="inbox-title" className="mt-1 text-lg font-bold text-ivory-950">
              Architecture Inbox
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" onClick={() => setPackOpen(true)} title="Preview and download the Markdown Action Pack">
              Compile Action Pack
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Architecture Inbox"
              className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Summary strip - clickable filters */}
        <div className="flex flex-wrap gap-1.5 px-6 pt-3 shrink-0">
          <button
            type="button"
            onClick={() => setStatuses((s) => (s.length === 1 && s[0] === "open" ? [] : ["open"]))}
            title="Show open items"
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${statuses.length === 1 && statuses[0] === "open" ? "bg-ivory-950 text-ivory-100 border-ivory-950" : "bg-[var(--color-surface)] border-[var(--color-line)] text-ivory-700 hover:border-[var(--color-accent)]"}`}
          >
            Open · {counts.open}
          </button>
          <button
            type="button"
            onClick={() => setKinds((k) => (k.length === 1 && k[0] === "task" ? [] : ["task"]))}
            title="Show tasks"
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${kinds.length === 1 && kinds[0] === "task" ? "bg-ivory-950 text-ivory-100 border-ivory-950" : "bg-[var(--color-surface)] border-[var(--color-line)] text-ivory-700 hover:border-[var(--color-accent)]"}`}
          >
            Tasks · {counts.tasks}
          </button>
          <button
            type="button"
            onClick={() => setStaleOnly((v) => !v)}
            title="Show items whose anchor is missing from the current schema"
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${staleOnly ? "bg-red-700 text-white border-red-700" : "bg-[var(--color-surface)] border-[var(--color-line)] text-ivory-700 hover:border-red-400"}`}
          >
            Stale · {counts.stale}
          </button>
          <button
            type="button"
            onClick={() => setStatuses((s) => (s.length === 1 && s[0] === "resolved" ? [] : ["resolved"]))}
            title="Show resolved items"
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${statuses.length === 1 && statuses[0] === "resolved" ? "bg-ivory-950 text-ivory-100 border-ivory-950" : "bg-[var(--color-surface)] border-[var(--color-line)] text-ivory-700 hover:border-[var(--color-accent)]"}`}
          >
            Resolved · {counts.resolved}
          </button>
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-1.5 px-6 pt-2.5 shrink-0">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search title, body, API name, canvas…"
            aria-label="Search inbox"
            spellCheck={false}
            className="min-w-[180px] flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2.5 py-1.5 text-xs text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
          />
          {(["note", "task"] as InboxItemKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKinds((prev) => toggle(prev, k))}
              aria-pressed={kinds.includes(k)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors cursor-pointer ${kinds.includes(k) ? "bg-ivory-950 text-ivory-100 border-ivory-950" : "bg-[var(--color-surface)] border-[var(--color-line)] text-ivory-600 hover:text-ivory-950"}`}
            >
              {k}s
            </button>
          ))}
          <select
            value={canvasIds[0] ?? ""}
            onChange={(e) => setCanvasIds(e.target.value ? [e.target.value] : [])}
            aria-label="Filter by canvas"
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-[11px] font-medium text-ivory-800 cursor-pointer"
          >
            <option value="">All canvases</option>
            {canvases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-semibold text-bronze-600 hover:text-bronze-700 underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* List + inspector */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden px-6 py-3">
          <div className="min-w-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-ivory-950">
                  {items.length === 0 ? "No architecture notes yet" : "No matches"}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ivory-600">
                  {items.length === 0
                    ? "Notes added on ERD entities and canvases appear here, grouped by source."
                    : "Adjust the search or clear the active filters."}
                </p>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-2 text-xs font-semibold text-bronze-600 hover:text-bronze-700 underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              grouped.map((g) => (
                <div key={g.canvasId} className="mb-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ivory-600">
                    {g.name}
                    <span className="font-mono font-medium text-ivory-500">
                      {g.list.filter((i) => i.status === "open").length}/{g.list.length} open
                    </span>
                  </p>
                  <ul className="space-y-1.5">
                    {g.list.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(item.id);
                            setEditing(false);
                            setConfirmDelete(false);
                          }}
                          aria-current={selectedId === item.id}
                          className={`block w-full rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${selectedId === item.id ? "border-bronze-500 bg-bronze-100/40" : "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-bronze-400"}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <KindPill kind={item.kind} />
                            <StatusPill status={item.status} />
                            {item.stale === "missing" && (
                              <span className="shrink-0 rounded-full border border-red-300 bg-red-50 px-1.5 py-px text-[10px] font-bold text-red-700" title="Anchor missing from the current schema - review required">
                                Stale
                              </span>
                            )}
                            <span className="ml-auto shrink-0 font-mono text-[10px] text-ivory-500">{timeAgo(item.updatedAt)}</span>
                          </span>
                          <span className="mt-1 block truncate text-xs font-bold text-ivory-950">{item.title}</span>
                          <span className="block truncate text-[11px] text-ivory-600">{firstLine(item.body)}</span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-ivory-500">{item.anchor.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          {selected && (
            <div className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)]">
              <div className="border-b border-[var(--color-line-soft)] p-3">
                <div className="flex items-center gap-1.5">
                  <KindPill kind={selected.kind} />
                  <StatusPill status={selected.status} />
                  {selected.stale === "missing" && (
                    <span className="rounded-full border border-red-300 bg-red-50 px-1.5 py-px text-[10px] font-bold text-red-700">
                      Stale anchor
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm font-bold text-ivory-950">{selected.title}</p>
                <p className="mt-0.5 font-mono text-[10px] text-ivory-600">
                  {selected.canvasName} · {selected.anchor.id} · {timeAgo(selected.updatedAt)}
                </p>
                {selected.stale === "missing" && (
                  <p className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] leading-relaxed text-red-800">
                    Anchor <span className="font-mono font-semibold">{selected.anchor.id}</span> is missing
                    from the current schema. Review before acting - never auto-remapped.
                  </p>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {editing ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    spellCheck={false}
                    aria-label="Edit note body"
                    className="min-h-[220px] w-full resize-y rounded-lg border border-[var(--color-line)] bg-white p-2.5 font-mono text-xs leading-relaxed text-ivory-950 focus:border-bronze-500 focus:outline-none"
                  />
                ) : (
                  <div className="rounded-lg border border-[var(--color-line)] bg-white p-2.5">
                    {renderMarkdownLite(selected.body)}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 border-t border-[var(--color-line-soft)] p-3">
                {editing ? (
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={saveEdit} className="flex-1">
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={startEdit} className="flex-1">
                      Edit
                    </Button>
                    {selected.kind === "task" && selected.status !== "resolved" && (
                      <Button size="sm" onClick={() => onSetTaskDone(selected.id, true)} className="flex-1">
                        Resolve
                      </Button>
                    )}
                    {selected.status === "resolved" && selected.kind === "task" && (
                      <Button size="sm" variant="secondary" onClick={() => onSetTaskDone(selected.id, false)} className="flex-1">
                        Reopen
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => onNavigate(selected)} className="flex-1">
                    Open in ERD
                  </Button>
                  {confirmDelete ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={doDelete} className="flex-1 !text-red-700">
                        Confirm delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} className="flex-1">
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Pack dialog */}
        {packOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pack-title" onClick={() => setPackOpen(false)}>
            <div
              className="modal-card max-w-3xl flex flex-col"
              style={{ maxHeight: "88vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-[var(--color-line-soft)] shrink-0">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
                    {pack.manifest.itemCount} items · {pack.manifest.warnings.length} warning{pack.manifest.warnings.length === 1 ? "" : "s"}
                  </p>
                  <h3 id="pack-title" className="mt-1 text-lg font-bold text-ivory-950">
                    Action Pack preview
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPackOpen(false)}
                  aria-label="Close Action Pack preview"
                  className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer shrink-0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-3 px-6 pt-3 shrink-0">
                <div className="flex rounded-lg border border-[var(--color-line)] overflow-hidden" role="radiogroup" aria-label="Export scope">
                  {(["outstanding", "all"] as const).map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={packScope === s}
                      onClick={() => setPackScope(s)}
                      className={`px-3 py-1.5 text-[11px] font-semibold capitalize transition-colors cursor-pointer ${packScope === s ? "bg-ivory-950 text-ivory-100" : "text-ivory-600 hover:text-ivory-950"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <span className="font-mono text-[11px] text-ivory-600">{pack.fileName}</span>
              </div>
              {pack.manifest.warnings.length > 0 && (
                <div className="mx-6 mt-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 shrink-0">
                  {pack.manifest.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}
              <div className="mx-6 mt-2.5 min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-ivory-950 p-4">
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ivory-100">{pack.markdown}</pre>
              </div>
              <div className="flex gap-2 px-6 py-4 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    void (async () => {
                      try {
                        await navigator.clipboard.writeText(pack.markdown);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1600);
                      } catch {
                        setCopied(false);
                      }
                    })();
                  }}
                >
                  {copied ? "Copied" : "Copy Markdown"}
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    const blob = new Blob([pack.markdown], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = pack.fileName;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download .md
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
