"use client";

import { useMemo, useState } from "react";
import type { CompareResult, Finding, FindingCategory } from "@/lib/json/compare";
import type { ChangeTone } from "@/lib/json/graph";

export const CATEGORY_META: { cat: FindingCategory; label: string; dot: string; text: string }[] = [
  { cat: "added", label: "Added", dot: "bg-[#32815B]", text: "text-[#32815B]" },
  { cat: "removed", label: "Removed", dot: "bg-[#B84C42]", text: "text-[#B84C42]" },
  { cat: "modified", label: "Modified", dot: "bg-[#B98335]", text: "text-[#B98335]" },
  { cat: "type-changed", label: "Type changed", dot: "bg-[#7A5C9E]", text: "text-[#7A5C9E]" },
  { cat: "array-added", label: "Array added", dot: "bg-[#32815B]", text: "text-[#32815B]" },
  { cat: "array-removed", label: "Array removed", dot: "bg-[#B84C42]", text: "text-[#B84C42]" },
  { cat: "array-modified", label: "Array modified", dot: "bg-[#B98335]", text: "text-[#B98335]" },
  { cat: "unmatched", label: "Unmatched", dot: "bg-[#B98335]", text: "text-[#B98335]" },
  { cat: "duplicate-key", label: "Duplicate key", dot: "bg-[#B84C42]", text: "text-[#B84C42]" },
  { cat: "structural", label: "Structural", dot: "bg-[#A39B8E]", text: "text-[#777168]" },
];

const TONE_PRIORITY: Record<FindingCategory, number> = {
  removed: 0,
  "duplicate-key": 1,
  "type-changed": 2,
  modified: 3,
  "array-modified": 4,
  unmatched: 5,
  "array-added": 6,
  "array-removed": 6,
  added: 7,
  structural: 8,
};

const CATEGORY_TONE: Record<FindingCategory, ChangeTone> = {
  added: "added",
  removed: "removed",
  modified: "modified",
  "type-changed": "type",
  "array-added": "added",
  "array-removed": "removed",
  "array-modified": "modified",
  unmatched: "modified",
  "duplicate-key": "removed",
  structural: "neutral",
};

/** Node tones for one side of a dual graph (A uses pathA, B uses pathB). */
export function tonesForSide(findings: Finding[], side: "a" | "b"): Map<string, ChangeTone> {
  const sorted = [...findings].sort(
    (x, y) => TONE_PRIORITY[x.category] - TONE_PRIORITY[y.category]
  );
  const out = new Map<string, ChangeTone>();
  for (const f of sorted) {
    const p = side === "a" ? f.pathA : f.pathB;
    if (p === null || out.has(p)) continue;
    out.set(p, CATEGORY_TONE[f.category]);
  }
  return out;
}

export function formatValue(v: unknown, max = 80): string {
  if (v === undefined) return "— missing —";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function displayPath(f: Finding): string {
  return f.pathA ?? f.pathB ?? "$";
}

// ── Summary ─────────────────────────────────────────────────────────────────

export function CompareSummary({
  result,
  onFilterCategory,
}: {
  result: CompareResult;
  onFilterCategory: (cat: FindingCategory) => void;
}) {
  const total = result.findings.length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CATEGORY_META.filter((c) =>
          ["added", "removed", "modified", "type-changed", "structural"].includes(c.cat)
        ).map((c) => {
          const n =
            c.cat === "modified"
              ? result.counts.modified + result.counts["array-modified"]
              : c.cat === "added"
                ? result.counts.added + result.counts["array-added"]
                : c.cat === "removed"
                  ? result.counts.removed + result.counts["array-removed"]
                  : result.counts[c.cat];
          return (
            <button
              key={c.cat}
              onClick={() => onFilterCategory(c.cat)}
              title={`Show ${c.label} findings`}
              className="rounded-xl border border-[#E8E2D8] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#A98450] cursor-pointer"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#777168]">
                <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden="true" />
                {c.label}
              </span>
              <span className="mt-0.5 block font-mono text-xl font-extrabold text-[#27241F]">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="rounded-xl border border-[#E8E2D8] bg-white px-4 py-2.5 font-mono text-[11px] text-[#777168]">
        strategy {result.config.strategy} · arrays {result.config.arrayMode}
        {result.config.matchKey !== "" ? ` by ${result.config.matchKey}` : ""} ·
        ignored {result.config.ignorePaths.length === 0 ? "none" : result.config.ignorePaths.join(", ")} ·
        {" "}{total} finding{total === 1 ? "" : "s"}
      </div>
      {result.warnings.length > 0 && (
        <div className="space-y-1">
          {result.warnings.map((w, k) => (
            <p key={k} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tree Diff ───────────────────────────────────────────────────────────────

interface TreeRow {
  path: string;
  depth: number;
  finding: Finding | null;
  children: TreeRow[];
}

function buildFindingTree(findings: Finding[]): TreeRow[] {
  const byPath = new Map<string, TreeRow>();
  const roots: TreeRow[] = [];
  const ensure = (path: string, depth: number): TreeRow => {
    const hit = byPath.get(path);
    if (hit) return hit;
    const row: TreeRow = { path, depth, finding: null, children: [] };
    byPath.set(path, row);
    if (depth === 0) {
      roots.push(row);
    } else {
      const parentPath = path.includes("[")
        ? path.slice(0, Math.max(path.lastIndexOf("."), path.lastIndexOf("[")))
        : "$";
      const parent = ensure(parentPath === "" ? "$" : parentPath, depth - 1);
      parent.children.push(row);
    }
    return row;
  };
  const sorted = [...findings].sort((a, b) =>
    displayPath(a) < displayPath(b) ? -1 : 1
  );
  for (const f of sorted) {
    const path = displayPath(f);
    const depth = (path.match(/[.\[]/g) ?? []).length;
    const row = ensure(path, depth);
    if (!row.finding) row.finding = f;
  }
  const sortRows = (rows: TreeRow[]) => {
    rows.sort((a, b) => (a.path < b.path ? -1 : 1));
    for (const r of rows) sortRows(r.children);
  };
  sortRows(roots);
  return roots;
}

export function TreeDiff({
  result,
  filter,
  selectedId,
  onSelect,
}: {
  result: CompareResult;
  filter: Set<FindingCategory> | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => {
    const list =
      filter === null ? result.findings : result.findings.filter((f) => filter.has(f.category));
    return buildFindingTree(list);
  }, [result, filter]);

  // Keep ancestors of the selection expanded.
  useMemo(() => {
    if (!selectedId) return;
    const f = result.findings.find((x) => x.id === selectedId);
    if (!f) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      let p = displayPath(f);
      while (p !== "$") {
        p = p.includes("[")
          ? p.slice(0, Math.max(p.lastIndexOf("."), p.lastIndexOf("[")))
          : "$";
        if (p === "") p = "$";
        next.delete(p);
        if (p === "$") break;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const renderRow = (row: TreeRow): React.ReactNode => {
    const meta = CATEGORY_META.find((c) => c.cat === row.finding?.category);
    const isCollapsed = collapsed.has(row.path);
    const isSel = row.finding?.id === selectedId;
    return (
      <div key={row.path}>
        <div
          className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
            isSel ? "bg-[#211F1B] text-white" : "hover:bg-[#F5F1E8]"
          }`}
          style={{ marginLeft: Math.min(row.depth, 8) * 16 }}
          onClick={() => onSelect(row.finding ? (isSel ? null : row.finding.id) : null)}
          role={row.finding ? "button" : undefined}
          tabIndex={row.finding ? 0 : undefined}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && row.finding) {
              e.preventDefault();
              onSelect(isSel ? null : (row.finding?.id ?? null));
            }
          }}
          title={row.finding ? row.finding.explanation : "Context"}
        >
          {row.children.length > 0 ? (
            <button
              type="button"
              aria-label={isCollapsed ? "Expand" : "Collapse"}
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(row.path)) next.delete(row.path);
                  else next.add(row.path);
                  return next;
                });
              }}
              className={`shrink-0 rounded p-0.5 text-[10px] leading-none cursor-pointer ${isSel ? "text-white/70" : "text-[#A39B8E]"}`}
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="w-[14px] shrink-0" aria-hidden="true" />
          )}
          {meta ? (
            <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} title={meta.label} aria-label={meta.label} />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#E8E2D8]" title="Context" aria-label="Context" />
          )}
          <span className={`min-w-0 flex-1 truncate font-mono text-[12px] ${isSel ? "text-white" : "text-[#27241F]"}`} title={row.path}>
            {row.path}
          </span>
          {row.finding && (
            <span className={`hidden shrink-0 truncate text-[11px] sm:inline ${isSel ? "text-white/70" : "text-[#A39B8E]"}`}>
              {formatValue(row.finding.newValue ?? row.finding.oldValue, 40)}
            </span>
          )}
        </div>
        {!isCollapsed && row.children.map(renderRow)}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-[#E8E2D8] bg-white p-1.5">
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <span className="font-mono text-[11px] text-[#A39B8E]">
          {rows.length === 0 ? "No findings match the filter." : `${result.findings.length} findings`}
        </span>
        <span className="flex-1" />
        <button
          onClick={() => {
            const all: string[] = [];
            const walk = (rs: TreeRow[]) => {
              for (const r of rs) {
                if (r.children.length > 0) all.push(r.path);
                walk(r.children);
              }
            };
            walk(rows);
            setCollapsed(new Set(all));
          }}
          className="rounded-md px-2 py-0.5 text-[11px] text-[#777168] hover:bg-[#F5F1E8] cursor-pointer"
        >
          Collapse all
        </button>
        <button
          onClick={() => setCollapsed(new Set())}
          className="rounded-md px-2 py-0.5 text-[11px] text-[#777168] hover:bg-[#F5F1E8] cursor-pointer"
        >
          Expand all
        </button>
      </div>
      <div className="max-h-[480px] overflow-y-auto">{rows.map(renderRow)}</div>
    </div>
  );
}

// ── Engineering table ───────────────────────────────────────────────────────

export function EngineeringTable({
  result,
  filter,
  selectedId,
  onSelect,
}: {
  result: CompareResult;
  filter: Set<FindingCategory> | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"path" | "category">("path");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list =
      filter === null ? [...result.findings] : result.findings.filter((f) => filter.has(f.category));
    if (q !== "") {
      list = list.filter(
        (f) =>
          displayPath(f).toLowerCase().includes(q) ||
          f.explanation.toLowerCase().includes(q) ||
          (f.matchKey ?? "").toLowerCase().includes(q) ||
          JSON.stringify(f.newValue ?? f.oldValue ?? "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) =>
      sort === "path"
        ? displayPath(a) < displayPath(b)
          ? -1
          : 1
        : a.category < b.category
          ? -1
          : 1
    );
    return list;
  }, [result, filter, search, sort]);

  const selected = result.findings.find((f) => f.id === selectedId) ?? null;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E8E2D8] bg-white px-3 py-2">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="shrink-0 text-[#A39B8E]">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search paths, values, explanations…"
          aria-label="Search findings"
          spellCheck={false}
          className="min-w-[160px] flex-1 rounded-md border border-[#E8E2D8] px-2 py-1 font-mono text-[12px] focus:border-[#A98450] focus:outline-none"
        />
        <button
          onClick={() => setSort(sort === "path" ? "category" : "path")}
          title="Toggle sort"
          className="rounded-md border border-[#E8E2D8] px-2 py-1 font-mono text-[11px] text-[#777168] hover:text-[#27241F] cursor-pointer"
        >
          sort: {sort}
        </button>
        <span className="font-mono text-[11px] text-[#A39B8E]">{rows.length}/{result.findings.length}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8E2D8] bg-white">
        <div className="max-h-[420px] overflow-y-auto">
          {rows.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-[#A39B8E]">
              {result.findings.length === 0 ? "No differences - documents match." : "No findings match."}
            </p>
          )}
          {rows.map((f) => {
            const meta = CATEGORY_META.find((c) => c.cat === f.category);
            const isSel = f.id === selectedId;
            return (
              <button
                key={f.id}
                onClick={() => onSelect(isSel ? null : f.id)}
                className={`grid w-full cursor-pointer grid-cols-[110px_minmax(0,1fr)] items-start gap-2 border-b border-[#E8E2D8] px-3 py-2 text-left transition-colors last:border-b-0 sm:grid-cols-[130px_minmax(0,1.4fr)_minmax(0,1fr)] ${
                  isSel ? "bg-[#211F1B] text-white" : "hover:bg-[#F5F1E8]"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta?.dot ?? ""}`} aria-hidden="true" />
                  <span className={isSel ? "text-white" : meta?.text ?? ""}>{meta?.label}</span>
                </span>
                <span className={`min-w-0 truncate font-mono text-[11px] ${isSel ? "text-white/80" : "text-[#27241F]"}`} title={displayPath(f)}>
                  {displayPath(f)}
                </span>
                <span className={`hidden min-w-0 truncate font-mono text-[11px] sm:block ${isSel ? "text-white/60" : "text-[#A39B8E]"}`} title={f.explanation}>
                  {f.oldValue !== undefined && f.newValue !== undefined
                    ? `${formatValue(f.oldValue, 30)} → ${formatValue(f.newValue, 30)}`
                    : formatValue(f.newValue ?? f.oldValue, 60)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-[#D8C7A9] bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] font-bold text-[#27241F]">{displayPath(selected)}</span>
            <span className="flex-1" />
            <button onClick={() => void copyText(displayPath(selected))} className="rounded-md border border-[#E8E2D8] px-2 py-1 text-[11px] hover:border-[#A98450] cursor-pointer">Copy path</button>
            {selected.oldValue !== undefined && (
              <button onClick={() => void copyText(JSON.stringify(selected.oldValue, null, 2) ?? "")} className="rounded-md border border-[#E8E2D8] px-2 py-1 text-[11px] hover:border-[#A98450] cursor-pointer">Copy A</button>
            )}
            {selected.newValue !== undefined && (
              <button onClick={() => void copyText(JSON.stringify(selected.newValue, null, 2) ?? "")} className="rounded-md border border-[#E8E2D8] px-2 py-1 text-[11px] hover:border-[#A98450] cursor-pointer">Copy B</button>
            )}
          </div>
          <p className="mt-1.5 text-[13px] text-[#27241F]">{selected.explanation}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-[#F8F6F0] p-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#A39B8E]">
                A {selected.oldType ? `· ${selected.oldType}` : "· missing"}
              </p>
              <pre className="mt-1 max-h-40 overflow-auto font-mono text-[11px] text-[#27241F]">
                {selected.oldValue === undefined ? "— missing —" : JSON.stringify(selected.oldValue, null, 2)}
              </pre>
            </div>
            <div className="rounded-lg bg-[#F8F6F0] p-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#A39B8E]">
                B {selected.newType ? `· ${selected.newType}` : "· missing"}
              </p>
              <pre className="mt-1 max-h-40 overflow-auto font-mono text-[11px] text-[#27241F]">
                {selected.newValue === undefined ? "— missing —" : JSON.stringify(selected.newValue, null, 2)}
              </pre>
            </div>
          </div>
          {selected.matchKey && (
            <p className="mt-1.5 font-mono text-[11px] text-[#A39B8E]">
              match {selected.matchKey} · {selected.matchStatus}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
