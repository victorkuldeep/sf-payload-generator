"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { ErdNodeData } from "@/lib/erd/graph";
import { ERD_MAX_ROWS, ERD_HEADER_H, ERD_FOOTER_H, parentExitHandleId, childEntryHandleId, loopOutHandleId, loopInHandleId } from "@/lib/erd/graph";

// Fixed chrome heights so edge docks sit exactly at header/footer mid-height.
const HEADER_H = 62;
const FOOTER_H = 30;

function KeyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="shrink-0 text-bronze-600">
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9m-4 4 3 3" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="shrink-0 text-bronze-500">
      <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  if (spinning) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" />
      <path d="M18 4v4h-4M6 20v-4h4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true" className="text-green-600">
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  );
}

function ErdTableNodeInner({ data, selected }: NodeProps<Node<ErdNodeData>>) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [sortAZ, setSortAZ] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const searched = q
    ? data.rows.filter(
        (r) => r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q)
      )
    : null;
  const MATCH_CAP = 100;
  const capped = searched && searched.length > MATCH_CAP;
  let visibleRows = searched
    ? searched.slice(0, MATCH_CAP)
    : expanded
      ? data.rows
      : data.rows.slice(0, ERD_MAX_ROWS);
  if (sortAZ) {
    visibleRows = [...visibleRows].sort((a, b) => a.name.localeCompare(b.name));
  }
  const collapsedHidden = !q && !expanded ? data.rows.length - visibleRows.length : 0;

  const copyField = (e: React.SyntheticEvent, name: string) => {
    e.stopPropagation();
    e.preventDefault();
    void (async () => {
      try {
        await navigator.clipboard.writeText(name);
        setCopiedField(name);
        window.setTimeout(() => setCopiedField((cur) => (cur === name ? null : cur)), 1200);
      } catch {
        /* clipboard unavailable */
      }
    })();
  };

  const copyApiName = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(data.apiName);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div
      className={`group w-[300px] rounded-xl border-2 bg-[var(--color-surface)] shadow-[0_8px_28px_-10px_rgba(24,20,12,0.35)] overflow-hidden transition-all ${
        data.spotlight
          ? "border-bronze-500 shadow-[0_0_0_4px_rgba(154,118,83,0.35),0_8px_28px_-10px_rgba(24,20,12,0.35)]"
          : selected
            ? "border-bronze-500"
            : data.isRoot
              ? "border-ivory-950"
              : "border-[var(--color-line)]"
      } ${data.dimmed ? "opacity-40" : ""}`}
    >
      {/* Side-edge docks: exits at header height, entries at footer height */}
      <Handle type="source" id={parentExitHandleId} position={Position.Right} style={{ top: ERD_HEADER_H / 2, opacity: 0, width: 2, height: 2, pointerEvents: "none" }} />
      <Handle type="target" id={childEntryHandleId} position={Position.Left} style={{ top: `calc(100% - ${ERD_FOOTER_H / 2}px)`, opacity: 0, width: 2, height: 2, pointerEvents: "none" }} />
      <Handle type="source" id={loopOutHandleId} position={Position.Left} style={{ top: ERD_HEADER_H / 2, opacity: 0, width: 2, height: 2, pointerEvents: "none" }} />
      <Handle type="target" id={loopInHandleId} position={Position.Left} style={{ top: `calc(100% - ${ERD_FOOTER_H / 2}px)`, opacity: 0, width: 2, height: 2, pointerEvents: "none" }} />
      {/* Header */}
      <div className={`flex flex-col justify-center px-3 border-b ${data.isRoot ? "bg-ivory-950 text-ivory-100" : "bg-[var(--color-surface-soft)]"}`} style={{ height: ERD_HEADER_H }}>
        <div className="flex items-center gap-1.5">
          <p className={`flex-1 min-w-0 truncate text-[13px] font-bold ${data.isRoot ? "text-ivory-100" : "text-ivory-950"}`}>
            {data.label}
          </p>
          {data.isJunction && (
            <span className="shrink-0 rounded border px-1 py-px text-[9px] font-bold bg-bronze-100 text-bronze-700 border-bronze-300" title="Two or more required lookups - classic junction object">
              JUNCTION
            </span>
          )}
          {data.custom && (
            <span className={`shrink-0 rounded border px-1 py-px text-[9px] font-semibold ${data.isRoot ? "border-ivory-700 text-ivory-300" : "bg-bronze-100 text-bronze-700 border-bronze-300"}`}>
              Custom
            </span>
          )}
          <button
            type="button"
            onClick={copyApiName}
            title={`Copy API name (${data.apiName})`}
            aria-label={`Copy API name ${data.apiName}`}
            className={`nodrag shrink-0 rounded p-1 transition-colors cursor-pointer ${data.isRoot ? "text-ivory-300 hover:text-white hover:bg-ivory-800" : "text-ivory-950 hover:text-bronze-600 hover:bg-ivory-200"}`}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          {data.onRefreshNode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onRefreshNode?.(data.apiName);
              }}
              title={data.refreshing ? "Refreshing metadata…" : `Refresh ${data.apiName} metadata`}
              aria-label={data.refreshing ? `Refreshing ${data.apiName}` : `Refresh ${data.apiName} metadata`}
              className={`nodrag shrink-0 rounded p-1 transition-colors cursor-pointer ${
                data.refreshing
                  ? "text-bronze-600"
                  : data.isRoot
                    ? "text-white/85 hover:text-white hover:bg-ivory-800"
                    : "text-ivory-700 hover:text-ivory-950 hover:bg-ivory-200"
              }`}
            >
              <RefreshIcon spinning={data.refreshing} />
            </button>
          )}
        </div>
        <p className={`truncate font-mono text-[10px] ${data.isRoot ? "text-ivory-300" : "text-ivory-600"}`}>
          {data.apiName} · {data.totalFields} fields · {data.totalChildren} children
        </p>
      </div>
      {/* Rows - scrollable in-node, expandable to all fields.
          Search results scroll inside a fixed box so the node never outgrows
          its dagre-planned footprint. */}
      <div
        className="nodrag nowheel overflow-y-auto py-1"
        style={q || expanded ? { maxHeight: 300 } : undefined}
      >
        {visibleRows.map((r) => {
          const pickable = r.pickValues.length > 0 && data.onPicklistClick;
          const shortType = r.type === "reference" ? "ref" : r.type;
          const inner = (
            <>
              {(r.isId || r.isName) && <KeyIcon />}
              {!(r.isId || r.isName) && r.refs.length > 0 && <LinkIcon />}
              {!(r.isId || r.isName) && r.refs.length === 0 && <span className="w-[11px] shrink-0" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ivory-950" title={r.refs.length > 0 ? `→ ${r.refs.join(", ")}` : r.name}>
                {r.name}
                {r.required && <span className="text-red-600"> *</span>}
              </span>
              {pickable ? (
                <span className="shrink-0 rounded-full border border-bronze-300 bg-bronze-100 px-1.5 py-px text-[9px] font-bold text-bronze-700" title={`${r.pickValues.length} picklist values - click to view`}>
                  {r.pickValues.length}
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-ivory-500" title={r.type}>{shortType}</span>
              )}
              <span
                role="button"
                tabIndex={0}
                title={`Copy ${r.name}`}
                aria-label={`Copy API name ${r.name}`}
                onClick={(e) => copyField(e, r.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") copyField(e, r.name);
                }}
                className="shrink-0 rounded p-0.5 text-ivory-400 opacity-0 group-hover:opacity-100 hover:text-bronze-600 hover:bg-ivory-200 transition-all cursor-pointer"
              >
                {copiedField === r.name ? <CheckIcon /> : <CopyIcon />}
              </span>
            </>
          );
          return pickable ? (
            <button
              key={r.name}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                data.onPicklistClick?.(data.apiName, r.name, {
                  x: rect.right + 8,
                  y: rect.top,
                  width: rect.width,
                  height: rect.height,
                });
              }}
              title={`${r.name} - click to view ${r.pickValues.length} picklist values`}
              className="nodrag group flex w-full cursor-pointer items-center gap-1.5 px-3 py-[3px] text-left transition-colors hover:bg-bronze-100"
            >
              {inner}
            </button>
          ) : (
            <div key={r.name} className="group flex items-center gap-1.5 px-3 py-[3px] hover:bg-ivory-200">
              {inner}
            </div>
          );
        })}
        {(!expanded && collapsedHidden > 0) || expanded ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="nodrag block w-full px-3 py-1 text-left text-[10px] font-semibold text-bronze-600 hover:text-bronze-700 hover:bg-ivory-200 cursor-pointer"
          >
            {expanded ? "Show less" : `+${collapsedHidden} more fields`}
          </button>
        ) : null}
      </div>
      {/* Footer - field search + sort on top, meta landing zone below */}
      <div
        className="nodrag nowheel border-t border-[var(--color-line-soft)] bg-[var(--color-surface-soft)] px-2.5 py-1.5 space-y-1"
        style={{ height: ERD_FOOTER_H }}
      >
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true" className="absolute left-1.5 top-1/2 -translate-y-1/2 text-ivory-500">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter fields…"
              aria-label={`Filter ${data.apiName} fields`}
              spellCheck={false}
              autoComplete="off"
              className="h-6 w-full rounded-md border border-ivory-300 bg-white pl-6 pr-5 font-mono text-[10px] text-ivory-950 placeholder-ivory-500 focus:border-bronze-500 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear field filter"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-ivory-500 hover:text-ivory-950 cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSortAZ((v) => !v)}
            aria-pressed={sortAZ}
            title={sortAZ ? "Reset to default field order" : "Sort fields A-Z"}
            aria-label={sortAZ ? "Reset to default field order" : "Sort fields A-Z"}
            className={`h-6 w-7 shrink-0 rounded-md border font-mono text-[10px] font-bold transition-colors cursor-pointer ${
              sortAZ
                ? "bg-bronze-600 border-bronze-600 text-white"
                : "border-ivory-300 bg-white text-ivory-600 hover:text-ivory-950 hover:border-ivory-500"
            }`}
          >
            A-Z
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ivory-600">{data.apiName}</span>
          <span className="shrink-0 text-[10px] font-medium text-ivory-600">
            {q
              ? `${searched!.length} match${searched!.length === 1 ? "" : "es"}${capped ? " (top 100)" : ""}`
              : `${data.totalChildren} ${data.totalChildren === 1 ? "child" : "children"}`}
          </span>
        </div>
      </div>
    </div>
  );
}

export const ErdTableNode = memo(ErdTableNodeInner);
