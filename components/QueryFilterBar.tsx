"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AggSpec, ValueChip } from "@/lib/queryFilter";
import { recordFields, valueChips } from "@/lib/queryFieldStats";
import Button from "./ui/Button";

type QfModule = typeof import("@/lib/queryFilter");

const CHIPS = ["AND", "OR", "NOT", "( )", "LIKE", "IN", "BETWEEN", "IS NULL", "ORDER BY"];

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

/** Inline funnel icon for the advanced-panel toggle - no emoji, no icon font. */
function FilterGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h12l-4.6 5.4v4.4l-2.8 1.4V8.4L2 3z" />
    </svg>
  );
}

/** Inline magnifier for the scan box - no emoji, no icon font. */
function SearchGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.6 10.6L14 14" />
    </svg>
  );
}

/**
 * JsonQL filter + aggregate bar for pulled SOQL/SOSL rows. Lazy-loads the
 * engine on mount so the Query chunk pays zero cost until results exist.
 * A fresh result set (new records identity) resets everything - the engine
 * reinitializes, never filtering stale rows.
 *
 * Two depths: a plain "type to scan" box (live full-text across all fields,
 * Inspector-style) plus data-driven quick chips, and an advanced panel
 * behind the funnel icon with SQL filtering and GROUP BY aggregation.
 * Exports (CSV / Copy / Excel) always follow the displayed table.
 */
export function QueryFilterBar({
  records,
  onDisplay,
}: {
  records: unknown[];
  /** null rows = clear back to server results. */
  onDisplay: (rows: unknown[] | null, label: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"filter" | "agg">("filter");
  const [simple, setSimple] = useState("");
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [groupBy, setGroupBy] = useState("");
  const [aggFilter, setAggFilter] = useState("");
  const [aggs, setAggs] = useState<AggRow[]>([{ op: "COUNT", field: "", alias: "n" }]);
  const [aggError, setAggError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const modRef = useRef<QfModule | null>(null);
  const displayRef = useRef(onDisplay);
  displayRef.current = onDisplay;
  const mountedRef = useRef(false);

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
    setSimple("");
    setScanHint(null);
    setQuery("");
    setHint(null);
    setAuto(false);
    setGroupBy("");
    setAggFilter("");
    setAggs([{ op: "COUNT", field: "", alias: "n" }]);
    setAggError(null);
    displayRef.current(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const fields = useMemo(() => recordFields(records), [records]);
  // Quick strips are mined from the rows - never hardcoded examples.
  const chips = useMemo(() => valueChips(records), [records]);

  const against = async (): Promise<QfModule> => {
    if (!modRef.current) modRef.current = await import("@/lib/queryFilter");
    return modRef.current;
  };

  const applyText = async (text: string, tag: "Scan" | "JsonQL filter") => {
    const setErr = tag === "Scan" ? setScanHint : setHint;
    if (!text.trim()) {
      setErr(null);
      displayRef.current(null, null);
      return;
    }
    setBusy(true);
    try {
      const mod = await against();
      const out = mod.filterRecords(records, text);
      if (!out.ok) {
        setErr(out.error);
        return;
      }
      setErr(null);
      displayRef.current(out.rows, `${tag} · ${out.rows.length} of ${records.length}`);
    } finally {
      setBusy(false);
    }
  };

  // Scan box is live: 1s after typing stops the rows narrow. Bare words are
  // full-text terms in the engine, so this needs no query syntax at all.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const s = simple.trim();
    if (!s) {
      setScanHint(null);
      displayRef.current(null, null);
      return;
    }
    const t = setTimeout(() => {
      void applyText(s, "Scan");
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simple]);

  // Auto mode for the advanced box: apply 1s after typing stops, when valid.
  useEffect(() => {
    if (!auto) return;
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(() => {
      void applyText(q, "JsonQL filter");
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, auto]);

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

  const runChip = (c: ValueChip) => {
    const text = `${c.field} = "${c.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    setQuery(text);
    setTab("filter");
    void applyText(text, "JsonQL filter");
  };

  const applyFilter = () => {
    void applyText(query, "JsonQL filter");
  };

  const applyScanNow = () => {
    void applyText(simple.trim(), "Scan");
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
      displayRef.current(out.rows, `Aggregate · ${by ? `by ${by}, ` : ""}${out.rows.length} group${out.rows.length === 1 ? "" : "s"}`);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setSimple("");
    setScanHint(null);
    setQuery("");
    setHint(null);
    setAggError(null);
    displayRef.current(null, null);
  };

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Hide advanced filter" : "Show advanced filter"}
          title={open ? "Hide advanced filter" : "Advanced filter & aggregates"}
          className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition-colors ${
            open
              ? "border-bronze-400 bg-bronze-100 text-bronze-700"
              : "border-[var(--color-line)] text-ivory-600 hover:border-bronze-400 hover:text-bronze-700"
          }`}
        >
          <FilterGlyph />
        </button>
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ivory-500" aria-hidden="true">
            <SearchGlyph />
          </span>
          <input
            value={simple}
            onChange={(e) => setSimple(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyScanNow();
            }}
            placeholder="Type to scan rows - across all fields, no syntax needed"
            spellCheck={false}
            aria-label="Scan rows"
            className={`${input} pl-7 ${simple ? "pr-7" : ""}`}
          />
          {simple && (
            <button
              type="button"
              onClick={() => setSimple("")}
              aria-label="Clear scan"
              title="Clear scan"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded px-1 text-sm leading-none text-ivory-500 hover:text-ivory-950"
            >
              ✕
            </button>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={clear} title="Back to server results">
          Clear
        </Button>
      </div>
      {scanHint && (
        <p className="mt-1 text-[11px] text-amber-700" role="status">{scanHint}</p>
      )}
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.slice(0, 12).map((c) => (
            <button
              key={`${c.field}=${c.value}`}
              type="button"
              onClick={() => runChip(c)}
              title={`${c.count} row${c.count === 1 ? "" : "s"} - filter ${c.field} = ${c.value}`}
              className="max-w-[260px] truncate cursor-pointer rounded-full border border-[var(--color-line-soft)] px-2 py-0.5 font-mono text-[10px] text-ivory-600 hover:border-bronze-400 hover:text-bronze-700"
            >
              {c.field} = &quot;{c.value}&quot;
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-2 border-t border-[var(--color-line-soft)] pt-2">
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
              Exports (CSV / Copy / Excel) follow the displayed table.
            </p>
          </div>

          {tab === "filter" ? (
            <div className="mt-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <label htmlFor="jq-advanced" className="shrink-0 text-[11px] font-semibold text-ivory-700">
                  Filter Query :
                </label>
                <div className="relative min-w-[220px] flex-1">
                  <input
                    id="jq-advanced"
                    value={query}
                    onChange={(e) => void onQueryChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyFilter();
                    }}
                    placeholder='Industry = "Tech" AND AnnualRevenue > 500000 - Enter to apply'
                    spellCheck={false}
                    aria-label="JsonQL filter"
                    className={`${input} ${query ? "pr-7" : ""}`}
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        void onQueryChange("");
                        void applyText("", "JsonQL filter");
                      }}
                      aria-label="Clear filter query"
                      title="Clear filter query"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded px-1 text-sm leading-none text-ivory-500 hover:text-ivory-950"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <Button size="sm" onClick={applyFilter} disabled={busy} title="Run the filter (Enter)">
                  {busy ? "Running…" : "Apply"}
                </Button>
                <label
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--color-line-soft)] px-2 py-1 text-[11px] text-ivory-600"
                  title="Apply automatically 1s after typing stops, when the query is valid"
                >
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => setAuto(e.target.checked)}
                    className="h-3.5 w-3.5 accent-bronze-600"
                  />
                  Auto
                </label>
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
              {hint && (
                <p className="mt-1 text-[11px] text-amber-700" role="status">{hint}</p>
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
      )}
    </div>
  );
}
