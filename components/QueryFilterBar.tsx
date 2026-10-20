"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AggSpec } from "@/lib/queryFilter";
import Button from "./ui/Button";

type QfModule = typeof import("@/lib/queryFilter");

const CHIPS = ["AND", "OR", "NOT", "( )", "LIKE", "IN", "BETWEEN", "IS NULL", "ORDER BY"];

const EXAMPLES = [
  'Industry = "Tech"',
  'AnnualRevenue > 500000 ORDER BY AnnualRevenue DESC',
  'Industry = "Tech" OR (Industry = "Finance" AND AnnualRevenue BETWEEN (100000, 500000))',
];

const AGG_OPS = ["COUNT", "SUM", "AVG", "MIN", "MAX"] as const;

interface AggRow {
  op: (typeof AGG_OPS)[number];
  field: string;
  alias: string;
}

const card = "rounded-lg border border-[var(--color-line)] bg-white px-3 py-2.5";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ivory-600";
const input =
  "w-full rounded-lg border border-[var(--color-line)] bg-white px-2 py-1.5 font-mono text-[12px] text-ivory-950 placeholder:text-ivory-500 focus:border-bronze-500 focus:outline-none";

/**
 * JsonQL filter + aggregate bar for pulled SOQL/SOSL rows. Lazy-loads the
 * engine on mount so the Query chunk pays zero cost until results exist.
 * A fresh result set (new records identity) resets everything - the engine
 * reinitializes, never filtering stale rows.
 */
export function QueryFilterBar({
  records,
  onDisplay,
}: {
  records: unknown[];
  /** null rows = clear back to server results. */
  onDisplay: (rows: unknown[] | null, label: string | null) => void;
}) {
  const [tab, setTab] = useState<"filter" | "agg">("filter");
  const [query, setQuery] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState("");
  const [aggFilter, setAggFilter] = useState("");
  const [aggs, setAggs] = useState<AggRow[]>([{ op: "COUNT", field: "", alias: "n" }]);
  const [aggError, setAggError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const modRef = useRef<QfModule | null>(null);

  // Preload the engine the moment results exist; still outside the base bundle.
  useEffect(() => {
    let live = true;
    void import("@/lib/queryFilter").then((m) => {
      if (live) modRef.current = m;
    });
    return () => {
      live = false;
    };
  }, []);

  // Fresh run, fresh engine: reset all local + displayed state.
  useEffect(() => {
    setQuery("");
    setHint(null);
    setGroupBy("");
    setAggFilter("");
    setAggs([{ op: "COUNT", field: "", alias: "n" }]);
    setAggError(null);
    onDisplay(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const fields = useMemo(() => {
    const seen = new Set<string>();
    for (const r of records) {
      if (r !== null && typeof r === "object" && !Array.isArray(r)) {
        for (const k of Object.keys(r as Record<string, unknown>)) {
          if (k !== "attributes" && !seen.has(k)) seen.add(k);
        }
      }
    }
    return [...seen].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [records]);

  const against = async (): Promise<QfModule> => {
    if (!modRef.current) modRef.current = await import("@/lib/queryFilter");
    return modRef.current;
  };

  const onQueryChange = async (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setHint(null);
      return;
    }
    try {
      const mod = await against();
      setHint(mod.checkQuery(text));
    } catch {
      setHint(null);
    }
  };

  const applyFilter = async () => {
    setBusy(true);
    try {
      const mod = await against();
      const out = mod.filterRecords(records, query);
      if (!out.ok) {
        setHint(out.error);
        return;
      }
      setHint(null);
      onDisplay(
        out.rows,
        query.trim() ? `JsonQL filter · ${out.rows.length} of ${records.length}` : null
      );
    } finally {
      setBusy(false);
    }
  };

  const applyAgg = async () => {
    setAggError(null);
    const cleanAggs = aggs
      .map((a) => ({ op: a.op, field: a.field.trim() || undefined, alias: a.alias.trim() || undefined }))
      .filter((a) => a.op === "COUNT" || a.field);
    if (cleanAggs.length === 0) {
      setAggError("Add at least one aggregation (COUNT needs no field).");
      return;
    }
    setBusy(true);
    try {
      const mod = await against();
      const spec: AggSpec = {
        groupBy: groupBy.trim() ? [groupBy.trim()] : undefined,
        aggs: cleanAggs,
        filter: aggFilter.trim() || undefined,
      };
      const out = mod.aggregateRecords(records, spec);
      if (!out.ok) {
        setAggError(out.error);
        return;
      }
      const by = spec.groupBy?.[0];
      onDisplay(out.rows, `Aggregate · ${by ? `by ${by}, ` : ""}${out.rows.length} group${out.rows.length === 1 ? "" : "s"}`);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setQuery("");
    setHint(null);
    setAggError(null);
    onDisplay(null, null);
  };

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[var(--color-line)] p-0.5" role="tablist" aria-label="JsonQL mode">
          {(["filter", "agg"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold cursor-pointer transition-colors ${
                tab === t ? "bg-[var(--color-surface)] text-ivory-950 shadow-sm" : "text-ivory-500 hover:text-ivory-950"
              }`}
            >
              {t === "filter" ? "Filter" : "Aggregate"}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-ivory-600">
          SQL-style search on the pulled rows - AND/OR, parens, LIKE, IN, BETWEEN, ORDER BY.
        </p>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={clear} title="Back to server results">
          Clear
        </Button>
      </div>

      {tab === "filter" ? (
        <div className="mt-2">
          <div className="flex flex-wrap gap-1.5">
            <input
              value={query}
              onChange={(e) => void onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyFilter();
              }}
              placeholder='Industry = "Tech" AND AnnualRevenue > 500000 — or just type words to fuzzy-find'
              spellCheck={false}
              aria-label="JsonQL filter"
              className={`${input} min-w-[220px] flex-1`}
            />
            <Button size="sm" onClick={() => void applyFilter()} disabled={busy} title="Run the filter (Enter)">
              {busy ? "Running…" : "Apply"}
            </Button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => void onQueryChange(query ? `${query} ${c}` : c === "( )" ? "( )" : `${c} `)}
                title={`Insert ${c}`}
                className="cursor-pointer rounded border border-[var(--color-line-soft)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ivory-600 hover:border-bronze-400 hover:text-bronze-700"
              >
                {c}
              </button>
            ))}
          </div>
          {hint ? (
            <p className="mt-1 text-[11px] text-amber-700" role="status">{hint}</p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void onQueryChange(ex)}
                  title={ex}
                  className="max-w-[320px] truncate cursor-pointer rounded-full border border-[var(--color-line-soft)] px-2 py-0.5 font-mono text-[10px] text-ivory-600 hover:border-bronze-400 hover:text-bronze-700"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            <div className="min-w-[160px] flex-1">
              <label className={label} htmlFor="jq-group">Group by (empty = whole set)</label>
              <input
                id="jq-group"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                placeholder="Industry"
                spellCheck={false}
                list="jq-fields"
                className={input}
              />
            </div>
            <div className="min-w-[220px] flex-[2]">
              <label className={label} htmlFor="jq-prefilter">Pre-filter (optional)</label>
              <input
                id="jq-prefilter"
                value={aggFilter}
                onChange={(e) => setAggFilter(e.target.value)}
                placeholder='AnnualRevenue > 0'
                spellCheck={false}
                className={input}
              />
            </div>
            <datalist id="jq-fields">
              {fields.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          {aggs.map((a, i) => (
            <div key={i} className="flex flex-wrap items-end gap-1.5">
              <div>
                <label className={label} htmlFor={`jq-op-${i}`}>Fn</label>
                <select
                  id={`jq-op-${i}`}
                  value={a.op}
                  onChange={(e) => setAggs((p) => p.map((x, j) => (j === i ? { ...x, op: e.target.value as AggRow["op"] } : x)))}
                  className="cursor-pointer rounded-lg border border-[var(--color-line)] bg-white px-2 py-1.5 font-mono text-[12px] text-ivory-950"
                >
                  {AGG_OPS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[140px] flex-1">
                <label className={label} htmlFor={`jq-field-${i}`}>Field</label>
                <input
                  id={`jq-field-${i}`}
                  value={a.field}
                  onChange={(e) => setAggs((p) => p.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                  placeholder={a.op === "COUNT" ? "(all rows)" : "AnnualRevenue"}
                  spellCheck={false}
                  list="jq-fields"
                  className={input}
                />
              </div>
              <div>
                <label className={label} htmlFor={`jq-alias-${i}`}>As</label>
                <input
                  id={`jq-alias-${i}`}
                  value={a.alias}
                  onChange={(e) => setAggs((p) => p.map((x, j) => (j === i ? { ...x, alias: e.target.value } : x)))}
                  placeholder="n"
                  spellCheck={false}
                  className={`${input} w-24`}
                />
              </div>
              <button
                type="button"
                onClick={() => setAggs((p) => p.filter((_, j) => j !== i))}
                disabled={aggs.length === 1}
                aria-label={`Remove aggregation ${i + 1}`}
                className="cursor-pointer rounded px-1.5 py-1.5 text-ivory-500 hover:text-red-700 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAggs((p) => [...p, { op: "COUNT", field: "", alias: "" }])}
              title="Add another aggregation"
            >
              + Agg
            </Button>
            <Button size="sm" onClick={() => void applyAgg()} disabled={busy} title="Run the aggregation">
              {busy ? "Running…" : "Aggregate"}
            </Button>
            {aggError && (
              <p className="text-[11px] text-red-700" role="alert">{aggError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
