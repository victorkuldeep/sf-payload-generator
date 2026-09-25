"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { ErdNodeData } from "@/lib/erd/graph";
import { ERD_MAX_ROWS, parentExitHandleId, childEntryHandleId, loopOutHandleId, loopInHandleId } from "@/lib/erd/graph";

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

function ErdTableNodeInner({ data, selected }: NodeProps<Node<ErdNodeData>>) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? data.rows : data.rows.slice(0, ERD_MAX_ROWS);
  const collapsedHidden = data.rows.length - visibleRows.length;
  return (
    <div
      className={`w-[300px] rounded-xl border-2 bg-[var(--color-surface)] shadow-[0_8px_28px_-10px_rgba(24,20,12,0.35)] overflow-hidden transition-all ${
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
      <Handle type="source" id={parentExitHandleId} position={Position.Right} style={{ top: HEADER_H / 2, opacity: 0, width: 2, height: 2, pointerEvents: "none" }} />
      <Handle type="target" id={childEntryHandleId} position={Position.Left} style={{ top: `calc(100% - ${FOOTER_H / 2}px)`, opacity: 0, width: 2, height: 2, pointerEvents: "none" }} />
      <Handle type="source" id={loopOutHandleId} position={Position.Left} style={{ top: HEADER_H / 2, opacity: 0, width: 2, height: 2, pointerEvents: "none" }} />
      <Handle type="target" id={loopInHandleId} position={Position.Left} style={{ top: `calc(100% - ${FOOTER_H / 2}px)`, opacity: 0, width: 2, height: 2, pointerEvents: "none" }} />
      {/* Header */}
      <div className={`h-[62px] flex flex-col justify-center px-3 border-b ${data.isRoot ? "bg-ivory-950 text-ivory-100" : "bg-[var(--color-surface-soft)]"}`}>
        <div className="flex items-center gap-1.5">
          <p className={`flex-1 min-w-0 truncate text-[13px] font-bold ${data.isRoot ? "text-ivory-100" : "text-ivory-950"}`}>
            {data.label}
          </p>
          {data.isJunction && (
            <span className="shrink-0 rounded border px-1 py-px text-[9px] font-bold bg-bronze-100 text-bronze-700 border-bronze-300" title="Two or more required lookups — classic junction object">
              JUNCTION
            </span>
          )}
          {data.custom && (
            <span className={`shrink-0 rounded border px-1 py-px text-[9px] font-semibold ${data.isRoot ? "border-ivory-700 text-ivory-300" : "bg-bronze-100 text-bronze-700 border-bronze-300"}`}>
              Custom
            </span>
          )}
        </div>
        <p className={`truncate font-mono text-[10px] ${data.isRoot ? "text-ivory-300" : "text-ivory-600"}`}>
          {data.apiName} · {data.totalFields} fields · {data.totalChildren} children
        </p>
      </div>
      {/* Rows — scrollable in-node, expandable to all fields */}
      <div
        className="nodrag nowheel overflow-y-auto py-1"
        style={expanded ? { maxHeight: 300 } : undefined}
      >
        {visibleRows.map((r) => (
          <div key={r.name} className="flex items-center gap-1.5 px-3 py-[3px] hover:bg-ivory-200">
            {(r.isId || r.isName) && <KeyIcon />}
            {!(r.isId || r.isName) && r.refs.length > 0 && <LinkIcon />}
            {!(r.isId || r.isName) && r.refs.length === 0 && <span className="w-[11px] shrink-0" aria-hidden="true" />}
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ivory-950" title={r.refs.length > 0 ? `→ ${r.refs.join(", ")}` : r.name}>
              {r.name}
              {r.required && <span className="text-red-600"> *</span>}
            </span>
            <span className="shrink-0 text-[10px] text-ivory-500">{r.type}</span>
          </div>
        ))}
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
      {/* Footer — the landing zone; every join terminates at this height */}
      <div className="h-[30px] flex items-center justify-between gap-2 border-t border-[var(--color-line-soft)] bg-[var(--color-surface-soft)] px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ivory-600">{data.apiName}</span>
        <span className="shrink-0 text-[10px] font-medium text-ivory-600">
          {data.totalChildren} {data.totalChildren === 1 ? "child" : "children"}
        </span>
      </div>
    </div>
  );
}

export const ErdTableNode = memo(ErdTableNodeInner);
