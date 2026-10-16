"use client";

import type { NodeProps } from "@xyflow/react";

/**
 * Studio-only flowchart shapes: process, decision, terminator. Static
 * diagram nodes - deliberately no animation, no run state. Labels edit
 * through the studio inspector, not on the node.
 */

function shell(selected: boolean | undefined, extra: string): string {
  return `flex items-center justify-center px-3 py-2 text-center text-[12px] font-semibold leading-snug text-ivory-950 ${extra} ${
    selected ? "ring-2 ring-bronze-500" : ""
  }`;
}

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
}

export function FlowProcessView({ data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  return (
    <div className={shell(selected, "min-h-[56px] w-44 rounded-md border-2 border-[#9A7653] bg-white shadow-sm")}>
      <span className="whitespace-pre-wrap break-words">{d.label}</span>
    </div>
  );
}

export function FlowDecisionView({ data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  return (
    <div className={shell(selected, "min-h-[96px] w-44 border-2 border-[#722F37] bg-white shadow-sm [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]")}>
      <span className="max-w-[90px] whitespace-pre-wrap break-words text-[11px]">{d.label}</span>
    </div>
  );
}

export function FlowTerminatorView({ data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  return (
    <div className={shell(selected, "min-h-[44px] w-40 rounded-full border-2 border-[#4E342E] bg-[#F5F1E8] shadow-sm")}>
      <span className="whitespace-pre-wrap break-words">{d.label}</span>
    </div>
  );
}

export const studioNodeTypes = {
  "flow-process": FlowProcessView,
  "flow-decision": FlowDecisionView,
  "flow-terminator": FlowTerminatorView,
} as const;
