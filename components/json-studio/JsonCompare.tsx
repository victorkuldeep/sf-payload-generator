"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { parseJsonInput, formatBytes, samplePair, COMPARE_KEY_PRESETS } from "@/lib/json/studio";
import Button from "../ui/Button";

const VirtualizedDiffViewer = dynamic(
  () => import("virtual-react-json-diff").then((m) => m.VirtualDiffViewer),
  { ssr: false, loading: () => <p className="p-6 text-sm text-[#A39B8E]">Loading diff engine…</p> }
);

type ViewerRef = {
  nextChange: () => unknown;
  previousChange: () => unknown;
  expandAll: () => void;
  collapseAll: () => void;
};

/** A/B comparator: paste two payloads, walk every delta node by node. */
export function JsonCompare() {
  const [aText, setAText] = useState("");
  const [bText, setBText] = useState("");
  const [aErr, setAErr] = useState<string | null>(null);
  const [bErr, setBErr] = useState<string | null>(null);
  const [pair, setPair] = useState<{ a: object; b: object } | null>(null);
  const [blocks, setBlocks] = useState<number | null>(null);
  const [compareKey, setCompareKey] = useState<string>("referenceId");
  const [strategy, setStrategy] = useState<"strict" | "loose" | "type-aware">("strict");
  const [ignorePaths, setIgnorePaths] = useState("");
  const [current, setCurrent] = useState(0);
  const viewerRef = useRef<ViewerRef | null>(null);

  const compare = () => {
    const ra = parseJsonInput(aText);
    const rb = parseJsonInput(bText);
    setAErr(ra.ok ? null : (ra as { ok: false; error: string }).error);
    setBErr(rb.ok ? null : (rb as { ok: false; error: string }).error);
    if (!ra.ok || !rb.ok) return;
    setPair({ a: ra.value as object, b: rb.value as object });
    setBlocks(null);
    setCurrent(0);
  };

  const loadSample = () => {
    const s = samplePair();
    setAText(s.a);
    setBText(s.b);
    setAErr(null);
    setBErr(null);
  };

  const sizes = useMemo(() => {
    if (!pair) return null;
    const sa = new Blob([JSON.stringify(pair.a)]).size;
    const sb = new Blob([JSON.stringify(pair.b)]).size;
    return `${formatBytes(sa)} vs ${formatBytes(sb)}`;
  }, [pair]);

  const step = (dir: 1 | -1) => {
    const r = viewerRef.current;
    if (!r) return;
    const c = dir === 1 ? r.nextChange() : r.previousChange();
    if (c) setCurrent((n) => n + dir);
  };

  const inputCls =
    "w-full rounded-lg border border-[#E8E2D8] p-2 font-mono text-xs focus:border-[#A98450] focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {(
          [
            { label: "Payload A", text: aText, set: setAText, err: aErr },
            { label: "Payload B", text: bText, set: setBText, err: bErr },
          ] as const
        ).map((side) => (
          <div key={side.label} className="rounded-xl border border-[#E8E2D8] bg-white p-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">
              {side.label}
            </p>
            <textarea
              value={side.text}
              onChange={(e) => side.set(e.target.value)}
              placeholder={`Paste ${side.label} JSON…`}
              rows={9}
              spellCheck={false}
              className={inputCls}
            />
            {side.err && (
              <p className="mt-1.5 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 font-mono text-[11px] text-red-700" role="alert">
                {side.err}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E8E2D8] bg-white px-3 py-2.5">
        <Button size="sm" onClick={compare} disabled={aText.trim() === "" || bText.trim() === ""}>
          Compare A → B
        </Button>
        <Button variant="ghost" size="sm" onClick={loadSample}>
          Load sample
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAText(bText);
            setBText(aText);
            setPair(null);
          }}
          title="Swap A and B"
        >
          ⇄ Swap
        </Button>
        <span className="mx-1 hidden h-5 w-px bg-[#E8E2D8] sm:inline-block" aria-hidden="true" />
        <label className="flex items-center gap-1.5 text-[11px] text-[#777168]">
          Match arrays by
          <select
            value={compareKey}
            onChange={(e) => setCompareKey(e.target.value)}
            className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-1.5 py-1 font-mono text-[11px]"
            title="Array items match by this key instead of index - referenceId for composite batches"
          >
            <option value="">index</option>
            {COMPARE_KEY_PRESETS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-[#777168]">
          Compare
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as typeof strategy)}
            className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-1.5 py-1 text-[11px]"
          >
            <option value="strict">strict</option>
            <option value="loose">loose</option>
            <option value="type-aware">type-aware</option>
          </select>
        </label>
        <input
          value={ignorePaths}
          onChange={(e) => setIgnorePaths(e.target.value)}
          placeholder="Ignore paths, comma-separated"
          spellCheck={false}
          aria-label="Ignore paths"
          className="min-w-[180px] flex-1 rounded-lg border border-[#E8E2D8] px-2 py-1 font-mono text-[11px] focus:border-[#A98450] focus:outline-none sm:max-w-[260px]"
        />
        {pair && (
          <>
            <span className="mx-1 hidden h-5 w-px bg-[#E8E2D8] sm:inline-block" aria-hidden="true" />
            <Button variant="ghost" size="sm" onClick={() => step(-1)}>← Prev</Button>
            <Button variant="ghost" size="sm" onClick={() => step(1)}>Next →</Button>
            <Button variant="ghost" size="sm" onClick={() => viewerRef.current?.expandAll()}>Expand all</Button>
            <Button variant="ghost" size="sm" onClick={() => viewerRef.current?.collapseAll()}>Collapse all</Button>
          </>
        )}
      </div>

      {!pair ? (
        <div className="rounded-xl border border-dashed border-[#E8E2D8] bg-white p-10 text-center">
          <p className="text-sm font-semibold text-[#27241F]">Nothing compared yet</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-[#777168]">
            Paste two payloads above - or load the sample composite batch - and walk every delta node by node.
          </p>
        </div>
      ) : (
        <>
          <p className="font-mono text-[11px] text-[#A39B8E]">
            {sizes}{blocks !== null ? ` · ${blocks} changed lines` : ""}{current > 0 ? ` · at change ${current}` : ""}
          </p>
          <div className="overflow-hidden rounded-xl border border-[#E8E2D8]">
            <VirtualizedDiffViewer
              ref={viewerRef as never}
              oldValue={pair.a}
              newValue={pair.b}
              height={600}
              leftTitle="Payload A"
              rightTitle="Payload B"
              theme="github-light"
              showLineCount
              differOptions={{
                ...(compareKey !== "" ? { compareKey } : {}),
                arrayDiffMethod: "lcs",
                detectCircular: false,
                showModifications: true,
              }}
              comparisonOptions={{
                compareStrategy: strategy,
                ignorePaths: ignorePaths.split(",").map((s) => s.trim()).filter(Boolean),
              }}
              getDiffData={(d: [unknown[], unknown[]]) => setBlocks(d[0].length + d[1].length)}
            />
          </div>
        </>
      )}
    </div>
  );
}
