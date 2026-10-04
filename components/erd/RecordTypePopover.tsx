"use client";

import { useEffect, useRef, useState } from "react";
import type { SalesforceRecordTypeInfo } from "@/lib/salesforce/types";

export interface RecordTypePopoverData {
  apiName: string;
  nodeLabel: string;
  recordTypes: SalesforceRecordTypeInfo[];
  /** Viewport anchor (badge rect) - panel flips to fit. */
  x: number;
  y: number;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : `Copy ${label}`}
      aria-label={copied ? "Copied" : `Copy ${label} ${text}`}
      className="nodrag shrink-0 cursor-pointer rounded p-1 text-ivory-500 transition-colors hover:bg-ivory-200 hover:text-ivory-950"
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <path d="m4 12.5 5 5L20 6.5" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}

/**
 * Record types on an ERD table, popover-style like picklist values: every
 * row shows the label, the developer name and the 18-char id, each with a
 * copy button - the two identifiers integrations actually need.
 */
export function RecordTypePopover({
  pop,
  onClose,
}: {
  pop: RecordTypePopoverData;
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

  const W = 340;
  const left = Math.min(Math.max(8, pop.x), Math.max(8, window.innerWidth - W - 8));
  const top = Math.min(Math.max(8, pop.y), Math.max(8, window.innerHeight - 360));

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`${pop.apiName} record types`}
      className="fixed z-[80] w-[340px] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_16px_48px_-12px_rgba(24,20,12,0.4)]"
      style={{ left, top }}
    >
      <div className="border-b border-[var(--color-line-soft)] bg-[var(--color-surface-soft)] px-3 py-2">
        <p className="truncate text-[11px] font-semibold text-ivory-950">
          {pop.nodeLabel} · <span className="font-mono">{pop.apiName}</span>
        </p>
        <p className="text-[10px] text-ivory-600">
          {pop.recordTypes.length} record type{pop.recordTypes.length === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="max-h-72 overflow-y-auto py-1">
        {pop.recordTypes.map((rt) => (
          <li
            key={rt.recordTypeId}
            className={`border-b border-[var(--color-line-soft)] px-3 py-2 last:border-0 ${rt.active ? "" : "opacity-55"}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ivory-950" title={rt.name}>
                {rt.name}
              </span>
              {rt.defaultRecordTypeMapping && (
                <span className="shrink-0 rounded border border-bronze-300 bg-bronze-100 px-1 py-px text-[9px] font-bold text-bronze-700" title="Default for new records">
                  DEFAULT
                </span>
              )}
              {rt.master && (
                <span className="shrink-0 rounded border border-[var(--color-line)] px-1 py-px text-[9px] font-bold text-ivory-600" title="Master sees every active value automatically">
                  MASTER
                </span>
              )}
              {!rt.active && (
                <span className="shrink-0 rounded border border-[var(--color-line)] px-1 py-px text-[9px] font-bold text-ivory-500">
                  INACTIVE
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ivory-700" title={`Developer name: ${rt.developerName}`}>
                {rt.developerName}
              </span>
              <CopyButton text={rt.developerName} label="developer name" />
            </div>
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ivory-500" title={`Record type id: ${rt.recordTypeId}`}>
                {rt.recordTypeId}
              </span>
              <CopyButton text={rt.recordTypeId} label="record type id" />
            </div>
          </li>
        ))}
        {pop.recordTypes.length === 0 && (
          <li className="px-3 py-4 text-center text-xs text-ivory-600">No record types on this object.</li>
        )}
      </ul>
      <p className="border-t border-[var(--color-line-soft)] px-3 py-1.5 text-[10px] text-ivory-500">
        Esc or click elsewhere to close
      </p>
    </div>
  );
}
