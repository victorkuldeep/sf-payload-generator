"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "../ui/Button";
import { ConfirmDialog } from "../wireframe/ConfirmDialog";
import {
  canTransition,
  messageCount,
  newSequence,
  renameSequence,
  validateSequence,
  type SequenceDocument,
  type SeqStatus,
} from "@/lib/sequence/model";
import { deleteSequence, listSequences, saveSequence } from "@/lib/sequence/store";

const STATUS_STYLE: Record<SeqStatus, string> = {
  draft: "bg-[#F5F1E8] text-[#777168] border-[#E3D9C6]",
  "in-review": "bg-[#F5EEDF] text-[#8A6A2F] border-[#E5C98F]",
  approved: "bg-[#EAF3ED] text-[#2F7D4F] border-[#BFDCC9]",
};

const STATUS_LABEL: Record<SeqStatus, string> = {
  draft: "Draft",
  "in-review": "In review",
  approved: "Approved",
};

/**
 * Sequence Studio route (EPIC 01): library with the approval workflow.
 * The statement editor + renderer arrive in EPIC 02/03; this shell owns
 * identity, version, status - the model, not the pixels.
 */
export function SequenceRoute() {
  const [items, setItems] = useState<SequenceDocument[]>([]);
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setItems(await listSequences().catch(() => []));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    const doc = newSequence(name);
    if (await saveSequence(doc).catch(() => false)) {
      setName("");
      setActiveId(doc.id);
      await refresh();
    }
  };

  const remove = async (id: string) => {
    setPendingDelete(null);
    await deleteSequence(id).catch(() => {});
    if (activeId === id) setActiveId(null);
    await refresh();
  };

  const transition = async (doc: SequenceDocument, to: SeqStatus) => {
    if (!canTransition(doc.status, to)) return;
    if (await saveSequence({ ...doc, status: to }).catch(() => false)) {
      await refresh();
    }
  };

  const commitRename = async (doc: SequenceDocument) => {
    const next = renameSequence(doc, renameDraft);
    setRenaming(false);
    if (!next) return;
    if (await saveSequence(next).catch(() => false)) {
      await refresh();
    }
  };

  const active = items.find((i) => i.id === activeId) ?? null;
  const problems = active ? validateSequence(active) : [];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        {!active ? (
          <>
            <svg width="430" height="150" viewBox="0 0 430 150" fill="none" aria-hidden="true" className="mx-auto mt-1 h-auto w-full max-w-[400px]">
              <line x1="90" y1="18" x2="90" y2="132" stroke="#9A7653" strokeWidth="1.5" />
              <line x1="215" y1="18" x2="215" y2="132" stroke="#9A7653" strokeWidth="1.5" />
              <line x1="340" y1="18" x2="340" y2="132" stroke="#9A7653" strokeWidth="1.5" />
              <rect x="58" y="8" width="64" height="18" rx="9" fill="#27241F" />
              <rect x="183" y="8" width="64" height="18" rx="9" fill="#27241F" />
              <rect x="308" y="8" width="64" height="18" rx="9" fill="#27241F" />
              <line x1="90" y1="48" x2="208" y2="48" stroke="#C9A86A" strokeWidth="1.5" />
              <path d="M202 43 L210 48 L202 53" stroke="#C9A86A" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="215" y1="76" x2="333" y2="76" stroke="#C9A86A" strokeWidth="1.5" strokeDasharray="5 3" />
              <path d="M327 71 L335 76 L327 81" stroke="#C9A86A" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="340" y1="104" x2="222" y2="104" stroke="#C9A86A" strokeWidth="1.5" />
              <path d="M228 99 L220 104 L228 109" stroke="#C9A86A" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <text x="215" y="148" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10" fontWeight="700" fill="#A39B8E">DESCRIBE · SEE · PROVE</text>
            </svg>
            <h2 className="mt-1 text-center text-[15px] font-semibold text-[#27241F]">Sequence Studio</h2>
            <p className="mx-auto mt-1 max-w-xl text-center text-xs text-[#777168]">
              Describe the interaction, see the architecture: sync, response and async messages with
              loop, condition, parallel, retry and note blocks. The diagram is a projection; the model is the truth.
            </p>
            <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[2px] text-[#A39B8E]">
              Interaction · System bridge · Build
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setActiveId(null)} title="Back to the library">
              ← Library
            </Button>
            {renaming ? (
              <input
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => void commitRename(active)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename(active);
                  if (e.key === "Escape") setRenaming(false);
                }}
                autoFocus
                maxLength={160}
                spellCheck={false}
                aria-label="Sequence name"
                className="min-w-0 flex-1 rounded-lg border border-[#C9A86A] bg-white px-2 py-1 text-[15px] font-semibold text-[#27241F] focus:outline-none"
              />
            ) : (
              <h2
                className="min-w-0 flex-1 cursor-text truncate text-[15px] font-semibold text-[#27241F]"
                title="Double-click to rename"
                onDoubleClick={() => {
                  setRenameDraft(active.name);
                  setRenaming(true);
                }}
              >
                {active.name}
              </h2>
            )}
            {!renaming && (
              <button
                type="button"
                onClick={() => {
                  setRenameDraft(active.name);
                  setRenaming(true);
                }}
                title="Rename sequence"
                aria-label="Rename sequence"
                className="shrink-0 rounded p-1 text-[#A39B8E] transition-colors cursor-pointer hover:bg-[#F5F1E8] hover:text-[#27241F]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
            )}
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[active.status]}`}>
              {STATUS_LABEL[active.status]} · v{active.version}
            </span>
            {active.status === "draft" && (
              <Button size="sm" variant="secondary" onClick={() => void transition(active, "in-review")}>
                Submit for review
              </Button>
            )}
            {active.status === "in-review" && (
              <>
                <Button size="sm" variant="secondary" onClick={() => void transition(active, "draft")}>
                  Request changes
                </Button>
                <Button size="sm" onClick={() => void transition(active, "approved")}>
                  Approve
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {!active && (
        <>
          <div className="flex gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
              }}
              placeholder="New sequence - e.g. Order to fulfillment"
              aria-label="New sequence name"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl border border-[#E8E2D8] bg-white px-3 py-2 text-[13px] text-[#27241F] placeholder-[#A39B8E] focus:border-[#C9A86A] focus:outline-none"
            />
            <Button onClick={() => void create()}>New sequence</Button>
          </div>

          {loaded && items.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((doc) => (
                <li key={doc.id} className="group flex items-center gap-2 rounded-xl border border-[#E8E2D8] bg-white px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveId(doc.id)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    title={`Open ${doc.name}`}
                  >
                    <span className="block truncate text-[13px] font-semibold text-[#27241F]">{doc.name}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-[#A39B8E]">
                      v{doc.version} · {doc.participants.length} participant{doc.participants.length === 1 ? "" : "s"} ·{" "}
                      {messageCount(doc.nodes)} message{messageCount(doc.nodes) === 1 ? "" : "s"} ·{" "}
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[doc.status]}`}>
                    {STATUS_LABEL[doc.status]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(doc.id)}
                    title={`Delete ${doc.name}`}
                    aria-label={`Delete ${doc.name}`}
                    className="shrink-0 rounded p-1 text-[#C9BFAE] opacity-0 transition-colors cursor-pointer hover:bg-red-500/10 hover:text-red-700 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {loaded && items.length === 0 && (
            <p className="rounded-xl border border-dashed border-[#E3D9C6] px-4 py-6 text-center text-xs text-[#777168]">
              No sequences yet - name one above and start modeling. The statement editor arrives in EPIC 03.
            </p>
          )}
        </>
      )}

      {active && (
        <div className="rounded-xl border border-[#E8E2D8] bg-white px-4 py-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-[#A39B8E]">
            {active.participants.length} participant{active.participants.length === 1 ? "" : "s"} · {messageCount(active.nodes)} messages
          </p>
          {problems.length > 0 ? (
            <ul className="mx-auto mt-2 max-w-lg space-y-1 text-left">
              {problems.slice(0, 8).map((p) => (
                <li key={p} className="text-[11px] text-red-700">⚠ {p}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-[#777168]">The renderer (EPIC 02) and statement editor (EPIC 03) land next.</p>
          )}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this sequence?"
          message={`"${items.find((i) => i.id === pendingDelete)?.name ?? "Sequence"}" and all of its interactions will be removed. Snapshots stay in history. This cannot be undone.`}
          confirmLabel="Delete sequence"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove(pendingDelete)}
        />
      )}
    </div>
  );
}
