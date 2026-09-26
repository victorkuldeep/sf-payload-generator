"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { VanillaEditor } from "./VanillaEditor";

const VirtualizedDiffViewer = dynamic(
  () => import("virtual-react-json-diff").then((m) => m.VirtualDiffViewer),
  { ssr: false, loading: () => <p className="p-6 text-sm text-[#A39B8E]">Loading diff engine…</p> }
);

// ── Revenue-Cloud-shaped fixture ────────────────────────────────────────────

function buildContext(seed: number, lineItems: number) {
  let n = seed;
  const rnd = () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const items = [];
  for (let i = 0; i < lineItems; i++) {
    items.push({
      referenceId: `QCS.LINEITEM.${i}.REFERENCE`,
      product: pick(["Ethernet (Point-to-Point)", "DIA", "MPLS", "Voice PRI", "SD-WAN"]),
      term: pick(["12 Months", "24 Months", "36 Months"]),
      mrc: Math.round(rnd() * 90000) / 100 + 100,
      nrc: Math.round(rnd() * 40000) / 100,
      quantity: 1 + Math.floor(rnd() * 8),
      discount: Math.round(rnd() * 2500) / 100,
      attributes: {
        diversity: rnd() > 0.5,
        expedited: rnd() > 0.7,
        country: pick(["US", "US", "US", "CA", "GB"]),
        notes: "Sample description text for the line item under test.",
      },
    });
  }
  return {
    header: {
      quoteId: "0Q0WE000006bZkv0AE",
      accountId: "001WE00001FrgJVYAZ",
      opportunityId: "006WE00000p3YnnYAE",
      status: "Draft",
      allOrNone: true,
      version: "v66.0",
    },
    lineItems: items,
    terms: [
      { referenceId: "QCS.TERM.0", value: "12 Months", floorMrc: 105, floorNrc: 125 },
      { referenceId: "QCS.TERM.1", value: "24 Months", floorMrc: 115, floorNrc: 135 },
    ],
    audit: { createdBy: "005V500000DOCIHIA5", runAt: "2026-09-25T10:00:00.000+0000" },
  };
}

/** Mutant B: value edits + add/remove keys + reordered + added items. */
function mutate(ctx: ReturnType<typeof buildContext>) {
  const b = JSON.parse(JSON.stringify(ctx)) as ReturnType<typeof buildContext>;
  b.header.status = "Approved";
  b.lineItems[0].mrc = 12345.67;
  delete (b.lineItems[1].attributes as Record<string, unknown>).expedited;
  (b.lineItems[2] as Record<string, unknown>).rushFee = 250;
  // Reorder two items (compareKey should track by referenceId, not index)
  const [x, y] = [b.lineItems[3], b.lineItems[4]];
  b.lineItems[3] = y;
  b.lineItems[4] = x;
  b.lineItems.push({
    referenceId: "QCS.LINEITEM.NEW.REFERENCE",
    product: "Dark Fiber",
    term: "60 Months",
    mrc: 999.99,
    nrc: 0,
    quantity: 2,
    discount: 0,
    attributes: { diversity: false, expedited: true, country: "US", notes: "Added line." },
  });
  b.audit.runAt = "2026-09-26T10:00:00.000+0000";
  return b;
}

const SIZES = [
  { label: "≈200 KB", items: 900 },
  { label: "≈1 MB", items: 4500 },
  { label: "≈3 MB", items: 13500 },
];

export function JsonSpike() {
  const [sizeIdx, setSizeIdx] = useState(1);
  const [gen, setGen] = useState(0);
  const [aText, setAText] = useState("");
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [blocks, setBlocks] = useState<number | null>(null);
  const t0 = useRef(0);

  const { a, b, kb } = useMemo(() => {
    const ctx = buildContext(42, SIZES[sizeIdx].items);
    const m = mutate(ctx);
    const s = JSON.stringify(ctx);
    void gen;
    return { a: ctx as object, b: m as object, kb: Math.round(s.length / 1024) };
  }, [sizeIdx, gen]);

  useEffect(() => {
    t0.current = performance.now();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setRenderMs(Math.round(performance.now() - t0.current)));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [a, b]);

  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-4 px-5 py-6">
      <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3">
        <p className="text-sm font-bold text-red-800">SPIKE ONLY - hidden route, deleted after go/no-go.</p>
        <p className="text-xs text-red-700">
          Fixture {kb} KB · painted in {renderMs === null ? "…" : `${renderMs} ms`} · {blocks === null ? "…" : `${blocks} change blocks`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {SIZES.map((s, i) => (
          <button
            key={s.label}
            onClick={() => setSizeIdx(i)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${sizeIdx === i ? "bg-[#211F1B] text-white border-[#211F1B]" : "bg-white border-[#E8E2D8] text-[#777168]"}`}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setGen((g) => g + 1)}
          className="rounded-lg bg-[#211F1B] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
        >
          Regenerate
        </button>
        <span className="text-[11px] text-[#A39B8E]">
          compareKey=referenceId · LCS arrays · strict · theme github-light
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8E2D8]">
        <VirtualizedDiffViewer
          oldValue={a}
          newValue={b}
          height={560}
          leftTitle="Payload A (context v1)"
          rightTitle="Payload B (context v2)"
          theme="github-light"
          showLineCount
          differOptions={{ compareKey: "referenceId", arrayDiffMethod: "lcs", detectCircular: false, showModifications: true }}
          comparisonOptions={{ compareStrategy: "strict" }}
          getDiffData={(d: [unknown[], unknown[]]) => setBlocks(d[0].length + d[1].length)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">
            vanilla-jsoneditor (tree) - paste A here in the real tool
          </p>
          <VanillaEditor value={a} onChange={() => undefined} />
        </div>
        <div className="rounded-xl border border-[#E8E2D8] bg-white p-4 text-[13px] text-[#27241F]">
          <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Spike checklist</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>A/B scroll smooth at 1MB+? (drag minimap, collapse a region, search a refId)</li>
            <li>Reordered items tracked by referenceId, not index?</li>
            <li>Editor tree usable + ivory vars applied? (placeholder text area below)</li>
            <li>Build chunk impact acceptable? (check next build output)</li>
          </ul>
          <textarea
            value={aText}
            onChange={(e) => setAText(e.target.value)}
            placeholder="Paste payload A here for the editor phase…"
            rows={6}
            className="mt-3 w-full rounded-lg border border-[#E8E2D8] p-2 font-mono text-xs"
          />
        </div>
      </div>
    </main>
  );
}
