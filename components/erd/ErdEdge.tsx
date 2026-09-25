"use client";

import { memo } from "react";
import {
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";

const STROKE = "#8A8070";
const STROKE_ACTIVE = "#9A7653";

function dirFor(pos: Position): { x: number; y: number } {
  if (pos === Position.Right) return { x: 1, y: 0 };
  if (pos === Position.Left) return { x: -1, y: 0 };
  if (pos === Position.Top) return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

/**
 * ERD relationship edge: plain geometry, no marker refs.
 * Single bar at the "one" (parent) end, crow's foot at the "many" (child) end.
 */
function ErdEdgeInner({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  selected,
  data,
}: EdgeProps) {
  // Self-lookup: hug the node's own left flank, header-left → footer-left.
  // Stacked loops stagger outward in lanes so they never share one path.
  const isLoop = source === target;
  const lane = (data as { loopLane?: number } | undefined)?.loopLane ?? 0;
  const LOOP = 44 + lane * 26;
  const bezier = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const path = isLoop
    ? `M ${sourceX},${sourceY} C ${sourceX - LOOP},${sourceY} ${targetX - LOOP},${targetY} ${targetX},${targetY}`
    : bezier[0];
  const labelX = isLoop ? sourceX - LOOP * 0.55 : bezier[1];
  // Stacked loop labels step upward per lane so pills never collide.
  const labelY = isLoop ? (sourceY + targetY) / 2 - lane * 30 : bezier[2];

  // Direction of travel at each end (drives the 1-bar / crow's-foot glyphs)
  const sd = isLoop ? { x: -1, y: 0 } : dirFor(sourcePosition);
  const td = isLoop
    ? { x: 1, y: 0 }
    : { x: -dirFor(targetPosition).x, y: -dirFor(targetPosition).y };
  const sp = { x: -sd.y, y: sd.x };
  const tp = { x: -td.y, y: td.x };

  // "One" bar across the line at the source end
  const BAR_HALF = 5;
  const bar = `M ${sourceX + sp.x * BAR_HALF},${sourceY + sp.y * BAR_HALF} L ${sourceX - sp.x * BAR_HALF},${sourceY - sp.y * BAR_HALF}`;

  // Crow's foot fanning back from the target end
  const FAN_LEN = 10;
  const FAN_HALF = 6;
  const apex = { x: targetX, y: targetY };
  const back = (side: number) => ({
    x: targetX - td.x * FAN_LEN + tp.x * side,
    y: targetY - td.y * FAN_LEN + tp.y * side,
  });
  const f1 = back(FAN_HALF);
  const f2 = back(0);
  const f3 = back(-FAN_HALF);
  const fan = `M ${apex.x},${apex.y} L ${f1.x},${f1.y} M ${apex.x},${apex.y} L ${f2.x},${f2.y} M ${apex.x},${apex.y} L ${f3.x},${f3.y}`;

  const stroke = selected ? STROKE_ACTIVE : STROKE;

  return (
    <>
      {/* Wide invisible hit-path so thin curves are easy to click */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: "stroke" }} />
      <path
        id={id}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 2 : 1.5}
      />
      <path d={bar} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      <path d={fan} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      {selected && label != null && String(label) !== "" && (
        <EdgeLabelRenderer>
          <div
            className="rounded border border-[var(--color-line)] bg-white px-1.5 py-px font-mono text-[10px] text-ivory-800 shadow-sm"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ErdEdge = memo(ErdEdgeInner);
