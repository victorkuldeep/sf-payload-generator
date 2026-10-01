"use client";

import { useEffect, useRef } from "react";
import Button from "../ui/Button";

export interface RecordSection {
  key: string;
  viaLabel: string;
  rows: Record<string, unknown>[];
  exhausted: boolean;
  loadingMore: boolean;
}

export interface RecordPopData {
  apiName: string;
  nodeLabel: string;
  /** Single-record rows (root / parent pulls). */
  single: { label: string; value: string }[] | null;
  /** 1-many sections, one per loaded parent. */
  sections: RecordSection[];
  /** Unreachable hint + the canvas parent to load first. */
  blockedHint: string | null;
  blockedApi: string | null;
  loading: boolean;
  error: string | null;
  /** Viewport anchor (icon rect) - panel flips to fit. */
  x: number;
  y: number;
}

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
};

export function RecordPopover({
  pop,
  onClose,
  onLoadMore,
  onFetchMissing,
  onClear,
}: {
  pop: RecordPopData;
  onClose: () => void;
  onLoadMore: (sectionKey: string) => void;
  onFetchMissing: (apiName: string) => void;
  onClear: () => void;
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

  const W = 320;
  const left = Math.min(Math.max(8, pop.x), Math.max(8, window.innerWidth - W - 8));
  const top = Math.min(Math.max(8, pop.y), Math.max(8, window.innerHeight - 420));

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`${pop.nodeLabel} record data`}
      className="fixed z-[80] w-[320px] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_16px_48px_-12px_rgba(24,20,12,0.4)]"
      style={{ left, top }}
    >
      <div className="border-b border-[var(--color-line-soft)] bg-[var(--color-surface-soft)] px-3 py-2">
        <p className="truncate text-[11px] font-semibold text-ivory-950">
          {pop.nodeLabel} · <span className="font-mono">{pop.apiName}</span>
        </p>
        <p className="text-[10px] text-ivory-600">Live record data · session only, never stored</p>
      </div>
      <div className="max-h-[300px] overflow-y-auto p-2.5">
        {pop.loading && <p className="px-1 py-2 text-xs text-bronze-600">Pulling record…</p>}
        {pop.error && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-700" role="alert">
            {pop.error}
          </p>
        )}
        {pop.blockedHint && (
          <div className="px-1 py-1">
            <p className="text-[11px] leading-relaxed text-ivory-700">{pop.blockedHint}</p>
            {pop.blockedApi && (
              <Button size="sm" variant="secondary" className="mt-1.5 w-full" onClick={() => onFetchMissing(pop.blockedApi!)}>
                Load {pop.blockedApi} first
              </Button>
            )}
          </div>
        )}
        {pop.single && (
          <dl className="divide-y divide-[var(--color-line-soft)]">
            {pop.single.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-2 px-1 py-1">
                <dt className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ivory-500">{row.label}</dt>
                <dd className="min-w-0 break-all text-right font-mono text-[11px] text-ivory-950">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {pop.sections.map((s) => (
          <div key={s.key} className="mb-2 last:mb-0">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
              {s.viaLabel} · {s.rows.length}{s.exhausted ? "" : "+"}
            </p>
            <ul className="space-y-1">
              {s.rows.map((r, i) => (
                <li
                  key={String(r.Id ?? i)}
                  className="rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-2 py-1.5"
                >
                  {Object.entries(r).map(([k, v]) => (
                    <p key={k} className="flex items-baseline justify-between gap-2">
                      <span className="shrink-0 font-mono text-[10px] text-ivory-500">{k}</span>
                      <span className="min-w-0 break-all text-right font-mono text-[11px] text-ivory-950">{cell(v)}</span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            {!s.exhausted && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 w-full"
                disabled={s.loadingMore}
                onClick={() => onLoadMore(s.key)}
              >
                {s.loadingMore ? "Loading…" : "Load 10 more"}
              </Button>
            )}
          </div>
        ))}
        {!pop.loading && !pop.error && !pop.blockedHint && !pop.single && pop.sections.length === 0 && (
          <p className="px-1 py-2 text-[11px] text-ivory-600">No rows returned for this node.</p>
        )}
      </div>
      <div className="flex gap-1.5 border-t border-[var(--color-line-soft)] p-2">
        <Button size="sm" variant="ghost" className="flex-1" onClick={onClear}>
          Clear record data
        </Button>
      </div>
    </div>
  );
}
