"use client";

import { useEffect, useRef } from "react";
import type { ErdPickValue } from "@/lib/erd/graph";

export interface PicklistPopoverData {
  apiName: string;
  nodeLabel: string;
  fieldName: string;
  fieldType: string;
  values: ErdPickValue[];
  /** Viewport anchor (row rect) - panel flips to fit. */
  x: number;
  y: number;
}

export function PicklistPopover({
  pop,
  onClose,
}: {
  pop: PicklistPopoverData;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  const W = 300;
  const left = Math.min(Math.max(8, pop.x), Math.max(8, window.innerWidth - W - 8));
  const top = Math.min(Math.max(8, pop.y), Math.max(8, window.innerHeight - 360));

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`${pop.fieldName} picklist values`}
      className="fixed z-[80] w-[300px] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_16px_48px_-12px_rgba(24,20,12,0.4)]"
      style={{ left, top }}
    >
      <div className="border-b border-[var(--color-line-soft)] bg-[var(--color-surface-soft)] px-3 py-2">
        <p className="truncate text-[11px] font-semibold text-ivory-950">
          {pop.nodeLabel} · <span className="font-mono">{pop.fieldName}</span>
        </p>
        <p className="text-[10px] text-ivory-600">
          {pop.fieldType} · {pop.values.length} value{pop.values.length === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="max-h-64 overflow-y-auto py-1">
        {pop.values.map((v) => (
          <li
            key={v.value}
            className={`flex items-center gap-2 px-3 py-1.5 ${v.active ? "" : "opacity-45"}`}
            title={v.active ? v.value : `${v.value} (inactive)`}
          >
            {v.isDefault ? (
              <span className="text-[11px] text-bronze-600" aria-label="Default value" title="Default">★</span>
            ) : (
              <span className="w-[11px] shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-ivory-950">{v.label}</span>
              {v.label !== v.value && (
                <span className="block truncate font-mono text-[10px] text-ivory-600">{v.value}</span>
              )}
            </span>
            {!v.active && (
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-ivory-500">
                off
              </span>
            )}
          </li>
        ))}
        {pop.values.length === 0 && (
          <li className="px-3 py-4 text-center text-xs text-ivory-600">No values defined.</li>
        )}
      </ul>
      <p className="border-t border-[var(--color-line-soft)] px-3 py-1.5 text-[10px] text-ivory-500">
        Esc or click elsewhere to close
      </p>
    </div>
  );
}
