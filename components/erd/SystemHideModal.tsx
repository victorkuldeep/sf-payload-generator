"use client";

import { useEffect, useState } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";

export interface HiddenRow {
  apiName: string;
  label: string;
  reason: string;
  custom: boolean;
}

/**
 * Hide-system review: shows exactly what the sweep would hide, grouped by
 * reason. Uncheck a row to force-show it (allow-list) - the same decision
 * is automatically honored by Neural sweeps.
 */
export function SystemHideModal({
  rows,
  initialAllow,
  onClose,
  onApply,
  onTurnOff,
  active,
}: {
  rows: HiddenRow[];
  initialAllow: Set<string>;
  onClose: () => void;
  onApply: (allow: Set<string>) => void;
  onTurnOff: () => void;
  active: boolean;
}) {
  const [allow, setAllow] = useState<Set<string>>(initialAllow);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = filter.toLowerCase().trim();
  const visible = q
    ? rows.filter((r) => r.apiName.toLowerCase().includes(q) || r.label.toLowerCase().includes(q))
    : rows;

  const groups = new Map<string, HiddenRow[]>();
  for (const r of visible) {
    if (!groups.has(r.reason)) groups.set(r.reason, []);
    groups.get(r.reason)!.push(r);
  }

  const hiddenCount = rows.filter((r) => !allow.has(r.apiName)).length;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Review hidden system objects"
      onClick={onClose}
      style={{ paddingTop: "10vh" }}
    >
      <div className="modal-card max-w-lg flex flex-col" style={{ maxHeight: "76vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-3 border-b border-[var(--color-line-soft)] shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
            Hide system · review
          </p>
          <h2 className="mt-1 text-lg font-bold text-ivory-950">
            {hiddenCount} hidden{allow.size > 0 ? ` · ${allow.size} force-shown` : ""}
          </h2>
          <p className="mt-0.5 text-xs text-ivory-600">
            Checked stays hidden. Uncheck to force-show - Neural sweeps honor the same list automatically.
          </p>
          <div className="mt-3">
            <Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter hidden objects" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
          {[...groups.entries()].map(([reason, list]) => (
            <div key={reason}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[1.6px] text-ivory-600">{reason} · {list.length}</p>
              <div className="rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line-soft)] overflow-hidden">
                {list.map((r) => {
                  const hidden = !allow.has(r.apiName);
                  return (
                    <label key={r.apiName} className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-ivory-300 ${hidden ? "" : "bg-ivory-200"}`}>
                      <input
                        type="checkbox"
                        checked={hidden}
                        onChange={() =>
                          setAllow((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.apiName)) next.delete(r.apiName);
                            else next.add(r.apiName);
                            return next;
                          })
                        }
                        className="h-4 w-4 shrink-0 rounded border-ivory-400 bg-white text-bronze-600 focus:ring-bronze-500"
                        aria-label={`${hidden ? "Keep hidden" : "Force-show"} ${r.label}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-ivory-950">{r.label}</span>
                        <span className="block truncate font-mono text-[11px] text-ivory-600">{r.apiName}</span>
                      </span>
                      {r.custom && <span className="shrink-0 font-mono text-[9px] text-bronze-600">custom</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {visible.length === 0 && <p className="py-6 text-center text-xs text-ivory-600">Nothing hidden - full neighborhood showing.</p>}
        </div>
        <div className="px-6 py-3.5 border-t border-[var(--color-line-soft)] bg-[var(--color-canvas)] flex items-center gap-2 shrink-0">
          {active && (
            <Button variant="ghost" onClick={onTurnOff}>
              Turn off
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => { onApply(allow); onClose(); }}>
            {active ? "Done" : `Hide ${hiddenCount}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
