"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Input from "../ui/Input";
import type { ErdEdgeKind } from "@/lib/erd/graph";

export interface DiscoverCandidate {
  apiName: string;
  label: string;
  custom: boolean;
  group: "parent" | "child";
  /** Lookup field (child side) or relationship name driving the link. */
  via: string;
  kind: ErdEdgeKind;
  onCanvas: boolean;
  system: boolean;
}

interface DiscoverPickerProps {
  open: boolean;
  title: string;
  subtitle: string;
  candidates: DiscoverCandidate[];
  onApply: (selected: string[]) => void;
  onClose: () => void;
}

export function DiscoverPicker({
  open,
  title,
  subtitle,
  candidates,
  onApply,
  onClose,
}: DiscoverPickerProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (open) {
      // Pre-check everything not already on canvas (one click = old behavior)
      setChecked(new Set(candidates.filter((c) => !c.onCanvas).map((c) => c.apiName)));
      setFilter("");
    }
  }, [open, candidates]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const visible = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return candidates;
    return candidates.filter(
      (c) => c.apiName.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
    );
  }, [candidates, filter]);

  if (!open) return null;

  const parents = visible.filter((c) => c.group === "parent");
  const children = visible.filter((c) => c.group === "child");
  const addable = candidates.filter((c) => !c.onCanvas).map((c) => c.apiName);
  const picked = [...checked].filter((n) => addable.includes(n));

  const toggle = (apiName: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(apiName)) next.delete(apiName);
      else next.add(apiName);
      return next;
    });
  };

  const row = (c: DiscoverCandidate) => (
    <label
      key={`${c.group}:${c.apiName}`}
      className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-ivory-300 ${
        c.onCanvas ? "opacity-60" : checked.has(c.apiName) ? "bg-ivory-200" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={c.onCanvas || checked.has(c.apiName)}
        disabled={c.onCanvas}
        onChange={() => toggle(c.apiName)}
        className="h-4 w-4 shrink-0 rounded border-ivory-400 bg-white text-bronze-600 focus:ring-bronze-500 disabled:opacity-60"
        aria-label={c.onCanvas ? `${c.label} (already on canvas)` : `Add ${c.label}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-ivory-950">{c.label}</span>
        <span className="block truncate text-[11px] font-mono text-ivory-600">
          {c.apiName} · via <span className="text-bronze-600">{c.via}</span>
        </span>
      </span>
      <span
        className={`shrink-0 rounded border px-1 py-px font-mono text-[9px] font-bold ${
          c.kind === "md"
            ? "bg-ivory-950 text-ivory-100 border-ivory-950"
            : "bg-white text-ivory-600 border-[var(--color-line)]"
        }`}
        title={c.kind === "md" ? "Master-detail (solid line)" : "Lookup (dotted line)"}
      >
        {c.kind === "md" ? "M-D" : "LKUP"}
      </span>
      {c.custom && <Badge variant="info">Custom</Badge>}
      {c.system && (
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-ivory-500" title="System object">
          sys
        </span>
      )}
      {c.onCanvas && (
        <span className="shrink-0 rounded border border-bronze-300 bg-bronze-100 px-1 py-px text-[9px] font-semibold text-bronze-700">
          On canvas
        </span>
      )}
    </label>
  );

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{ paddingTop: "10vh" }}
    >
      <div
        className="modal-card max-w-lg flex flex-col"
        style={{ maxHeight: "78vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-[var(--color-line-soft)] shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
            Selective discovery
          </p>
          <h2 className="mt-1 text-lg font-bold text-ivory-950">{title}</h2>
          <p className="mt-0.5 text-xs text-ivory-600">{subtitle}</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1">
              <Input
                placeholder="Filter candidates…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filter candidates"
              />
            </div>
            <button
              type="button"
              onClick={() => setChecked(new Set(addable))}
              className="text-[11px] font-medium text-bronze-600 hover:text-bronze-700 underline cursor-pointer shrink-0"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setChecked(new Set())}
              className="text-[11px] text-ivory-600 hover:text-ivory-950 underline cursor-pointer shrink-0"
            >
              None
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
          {parents.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[1.6px] text-ivory-600">
                Parents ({parents.length})
              </p>
              <div className="rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line-soft)] overflow-hidden">
                {parents.map(row)}
              </div>
            </div>
          )}
          {children.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[1.6px] text-ivory-600">
                Children ({children.length})
              </p>
              <div className="rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line-soft)] overflow-hidden">
                {children.map(row)}
              </div>
            </div>
          )}
          {visible.length === 0 && (
            <p className="py-6 text-center text-xs text-ivory-600">No candidates match.</p>
          )}
        </div>

        <div className="px-6 py-3.5 border-t border-[var(--color-line-soft)] bg-[var(--color-canvas)] flex items-center gap-2 shrink-0">
          <p className="flex-1 text-[11px] text-ivory-600">
            {picked.length} selected · solid = master-detail, dotted = lookup
          </p>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onApply(picked)} disabled={picked.length === 0}>
            Add{picked.length > 0 ? ` ${picked.length}` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
