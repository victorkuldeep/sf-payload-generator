"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import Button from "../ui/Button";
import { DraftDialog, type DraftConfirmation } from "../draw/DraftDialog";
import { SYSTEM_DRAFT_KEY, buildSystemProject, type TopologyDraft } from "@/lib/draw/toSystemDraft";
import { formatStatement, parseStatements, printStatements } from "@/lib/sequence/dsl";
import { registerSeqBridge, seqSnapshotOf } from "@/lib/ai/seqBridge";
import { sequenceToDraft } from "@/lib/sequence/systemBridge";
import { seqPngFileName } from "@/lib/sequence/seqExport";
import { SystemImportDialog } from "./SystemImportDialog";
import { findNode } from "@/lib/sequence/edit";
import { patchNode, removeNode } from "@/lib/sequence/edit";
import type { MessageKind, SequenceDocument, SeqNode } from "@/lib/sequence/model";
import { saveSequence } from "@/lib/sequence/store";
import { SequenceDiagram } from "./SequenceDiagram";
import { SequenceInspector } from "./SequenceInspector";

const SAVE_DEBOUNCE_MS = 800;

/** One-click block templates appended to the statements. */
const SNIPPETS: { label: string; title: string; text: string }[] = [
  { label: "Loop", title: "Insert a loop block", text: "loop each \n\nend\n" },
  { label: "If", title: "Insert a condition block", text: "if \n\nend\n" },
  { label: "Parallel", title: "Insert a parallel block", text: "parallel \n\nend\n" },
  { label: "Retry", title: "Insert a retry block", text: "retry 3 times\n\nend\n" },
  { label: "Note", title: "Insert a note", text: "note \n" },
];

/**
 * Sequence canvas (EPIC 03): statement editor + diagram, two-way synced.
 * Text is the input; the parsed model is the truth. Only valid parses
 * persist - errors show per line and the last good model stays live.
 */
export function SequenceCanvas({ document, onSaved }: { document: SequenceDocument; onSaved: (doc: SequenceDocument) => void }) {
  const router = useRouter();
  const [doc, setDoc] = useState(document);
  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useState<TopologyDraft | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const diagramRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState(() => printStatements(document.participants, document.nodes));
  const [selId, setSelId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedRef = useRef<string>(printStatements(document.participants, document.nodes));

  // External change (restore, AI apply): re-seed the editor.
  useEffect(() => {
    const printed = printStatements(document.participants, document.nodes);
    if (printed !== committedRef.current) {
      committedRef.current = printed;
      setDoc(document);
      setText(printed);
      setSelId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document]);

  const persist = useCallback(
    (next: SequenceDocument, printed: string) => {
      setDoc(next);
      committedRef.current = printed;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveSequence(next).then((ok) => {
          if (ok) onSaved(next);
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [onSaved],
  );

  const parsed = parseStatements(text);
  const valid = parsed.errors.length === 0;

  // Quick-add bar: build A -> B -> C chains without typing raw DSL.
  const [qaFrom, setQaFrom] = useState("");
  const [qaKind, setQaKind] = useState<MessageKind>("sync");
  const [qaTo, setQaTo] = useState("");
  const [qaLabel, setQaLabel] = useState("");
  const [qaChain, setQaChain] = useState(true);
  const qaLabelRef = useRef<HTMLInputElement | null>(null);

  const qaReady = qaFrom.trim() !== "" && qaTo.trim() !== "" && qaLabel.trim() !== "";

  const quickAdd = () => {
    if (!qaReady) return;
    const line = formatStatement(qaFrom, qaKind, qaTo, qaLabel);
    const base = text.replace(/\s+$/, "");
    onEdit(base ? `${base}\n${line}` : line);
    if (qaChain) {
      setQaFrom(qaTo.trim());
      setQaLabel("");
      window.setTimeout(() => qaLabelRef.current?.focus(), 0);
    } else {
      setQaLabel("");
    }
  };

  const insertSnippet = (snippet: string) => {
    const base = text.replace(/\s+$/, "");
    onEdit(base ? `${base}\n${snippet}` : snippet);
  };

  const onEdit = (next: string) => {
    setText(next);
    const r = parseStatements(next);
    if (r.errors.length > 0) return; // keep the last good model live
    if (next === committedRef.current) return;
    persist(
      { ...doc, participants: r.participants, nodes: r.nodes },
      next,
    );
  };

  const format = () => {
    const canonical = printStatements(doc.participants, doc.nodes);
    setText(canonical);
  };

  /** Inspector edits land on the model, then reprint - text never drifts. */
  const commitNodes = (nodes: SequenceDocument["nodes"]) => {
    const next = { ...doc, nodes };
    const printed = printStatements(next.participants, next.nodes);
    setText(printed);
    persist(next, printed);
  };

  const patchSelected = (node: SeqNode) => {
    if (!selId) return;
    commitNodes(patchNode(doc.nodes, selId, node));
  };

  const deleteSelected = () => {
    if (!selId) return;
    commitNodes(removeNode(doc.nodes, selId));
    setSelId(null);
  };

  const selected = selId ? findNode(doc.nodes, selId) : null;

  /** AI agent bridge: headless tools read/apply through the canvas persist path. */
  useEffect(() => {
    registerSeqBridge({
      getSnapshot: () => seqSnapshotOf(doc),
      getDocument: () => doc,
      apply: (fn) => {
        const next = fn(doc);
        const printed = printStatements(next.participants, next.nodes);
        setText(printed);
        persist(next, printed);
        return { ok: true };
      },
    });
    return () => registerSeqBridge(null);
  }, [doc, persist]);

  const doExport = useCallback(
    async (scale: 2 | 3) => {
      setExporting(true);
      setExportError(null);
      try {
        const el = diagramRef.current;
        if (!el) throw new Error("Diagram not ready");
        const dataUrl = await toPng(el, { backgroundColor: "#FFFFFF", pixelRatio: scale, cacheBust: true });
        const d = globalThis.document;
        const a = d.createElement("a");
        a.href = dataUrl;
        a.download = seqPngFileName(doc.name, scale);
        d.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "PNG export failed");
      } finally {
        setExporting(false);
      }
    },
    [doc.name],
  );

  const handleConfirm = (selection: DraftConfirmation) => {
    if (!draft) return;
    const project = buildSystemProject(draft, selection);
    try {
      sessionStorage.setItem(SYSTEM_DRAFT_KEY, JSON.stringify(project));
    } catch {
      /* private mode etc - the canvas still holds the document */
    }
    setDraft(null);
    router.push("/system");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 lg:flex-row">
      <div className="flex min-h-0 w-full flex-col rounded-xl border border-[#E8E2D8] bg-white lg:max-w-md">
        <div className="flex items-center justify-between gap-1.5 border-b border-[#EFE9DC] px-3 py-2">
          <p className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[2px] text-[#A39B8E]">
            Statements · {valid ? `${parsed.nodes.length} top-level` : "fix errors to save"}
          </p>
          <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)} title="Import a System flow or project">
            ⇄ System
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDraft(sequenceToDraft(doc))} title="Send participants and messages to System Design">
            Send to System
          </Button>
          <Button size="sm" variant="secondary" onClick={format} title="Reprint canonical DSL">
            Format
          </Button>
        </div>
        <p className="shrink-0 border-b border-[#EFE9DC] px-3 py-1 font-mono text-[10px] leading-relaxed text-[#A39B8E]">
          A -&gt; B: label · --&gt; response · -&gt;&gt; async · one message per line
        </p>
        <div className="shrink-0 border-b border-[#EFE9DC] px-3 py-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              quickAdd();
            }}
            className="flex flex-wrap items-center gap-1.5"
          >
            <datalist id="seq-parts">
              {parsed.participants.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
            <input
              value={qaFrom}
              onChange={(e) => setQaFrom(e.target.value)}
              list="seq-parts"
              placeholder="From"
              aria-label="From participant"
              spellCheck={false}
              className="w-24 rounded-lg border border-[#E8E2D8] px-2 py-1 text-[12px] text-[#27241F] placeholder-[#C9BFAE] focus:border-[#C9A86A] focus:outline-none"
            />
            <select
              value={qaKind}
              onChange={(e) => setQaKind(e.target.value as MessageKind)}
              aria-label="Message kind"
              title="call draws solid · return draws dashed · async draws an event arrow"
              className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-1.5 py-1 text-[12px] font-semibold text-[#27241F] focus:border-[#C9A86A] focus:outline-none"
            >
              <option value="sync">call →</option>
              <option value="response">return ⇢</option>
              <option value="async">async »</option>
            </select>
            <input
              value={qaTo}
              onChange={(e) => setQaTo(e.target.value)}
              list="seq-parts"
              placeholder="To"
              aria-label="To participant"
              spellCheck={false}
              className="w-24 rounded-lg border border-[#E8E2D8] px-2 py-1 text-[12px] text-[#27241F] placeholder-[#C9BFAE] focus:border-[#C9A86A] focus:outline-none"
            />
            <input
              ref={qaLabelRef}
              value={qaLabel}
              onChange={(e) => setQaLabel(e.target.value)}
              placeholder="Message label, Enter adds it"
              aria-label="Message label"
              spellCheck={false}
              className="min-w-[8rem] flex-1 rounded-lg border border-[#E8E2D8] px-2 py-1 text-[12px] text-[#27241F] placeholder-[#C9BFAE] focus:border-[#C9A86A] focus:outline-none"
            />
            <label
              className="flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[#777168]"
              title="Chain: the next From starts as this To, so Enter walks A to B to C"
            >
              <input
                type="checkbox"
                checked={qaChain}
                onChange={(e) => setQaChain(e.target.checked)}
                className="cursor-pointer accent-[#722F37]"
              />
              chain
            </label>
            <Button size="sm" type="submit" disabled={!qaReady} title="Append this message to the statements">
              Add
            </Button>
          </form>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {SNIPPETS.map((s) => (
              <Button key={s.label} size="sm" variant="ghost" onClick={() => insertSnippet(s.text)} title={s.title}>
                {s.label}
              </Button>
            ))}
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => onEdit(e.target.value)}
          spellCheck={false}
          aria-label="Sequence statements"
          placeholder={"Salesforce -> Middleware: Create Order\nloop each order.lines\nend"}
          className="min-h-[240px] w-full flex-1 resize-y rounded-b-xl bg-white px-3 py-2 font-mono text-[12px] leading-[1.7] text-[#27241F] placeholder-[#C9BFAE] focus:outline-none [font-variant-ligatures:none] lg:min-h-0"
        />
        {parsed.errors.length > 0 && (
          <ul className="max-h-32 shrink-0 space-y-0.5 overflow-y-auto border-t border-[#EFE9DC] px-3 py-2">
            {parsed.errors.slice(0, 20).map((e, i) => (
              <li key={`${e.line}-${i}`} className="font-mono text-[11px] text-red-700">
                line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#E8E2D8] bg-white">
        <div className="flex shrink-0 items-center justify-between gap-1.5 border-b border-[#EFE9DC] px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-[#A39B8E]">Diagram</p>
          <div className="flex gap-1.5">
            <Button
              size="sm" variant="secondary"
              onClick={() => void doExport(2)}
              disabled={exporting || doc.nodes.length === 0}
              title="Download the diagram as PNG (2x)"
            >
              {exporting ? "Exporting…" : "⤓ Snapshot PNG"}
            </Button>
            <Button
              size="sm" variant="secondary"
              onClick={() => void doExport(3)}
              disabled={exporting || doc.nodes.length === 0}
              title="Download the diagram as hi-res PNG (3x) for decks"
            >
              {exporting ? "Exporting…" : "3x Hi-Res"}
            </Button>
          </div>
        </div>
        {exportError && <p className="px-3 pt-1 text-[11px] text-red-700">{exportError}</p>}
        <div ref={diagramRef} className="min-h-0 flex-1 overflow-auto bg-white p-3">
          <SequenceDiagram doc={doc} selectedId={selId} onSelect={(id) => setSelId(id)} />
        </div>
      </div>

      {selected && (
        <SequenceInspector
          node={selected}
          participants={doc.participants}
          onPatch={patchSelected}
          onDelete={deleteSelected}
          onClose={() => setSelId(null)}
        />
      )}
      {importOpen && (
        <SystemImportDialog
          onClose={() => setImportOpen(false)}
          onImport={(statements) => {
            setImportOpen(false);
            onEdit(text.trim() === "" ? statements : `${text.replace(/\s+$/, "")}\n\n${statements}`);
          }}
        />
      )}
      {draft && (
        <DraftDialog
          draft={draft}
          onCancel={() => setDraft(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
