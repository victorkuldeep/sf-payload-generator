"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { fetchFootprint, fetchKeyPrefix, type Footprint } from "@/lib/salesforce/footprint";

export interface AutomationModalProps {
  apiName: string;
  label: string;
  keyPrefix: string;
  instanceUrl: string;
  apiVersion: string;
  getToken: () => string;
  onClose: () => void;
  onLoaded?: (apiName: string, total: number) => void;
}

function ActiveDot({ active }: { active: boolean | null }) {
  if (active === null) return <span className="shrink-0 text-[10px] font-bold text-ivory-400">—</span>;
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${
        active ? "bg-emerald-100 text-emerald-800" : "bg-ivory-200 text-ivory-500"
      }`}
      title={active ? "Active" : "Inactive"}
    >
      {active ? "Active" : "Off"}
    </span>
  );
}

export function AutomationModal({ apiName, label, keyPrefix, instanceUrl, apiVersion, getToken, onClose, onLoaded }: AutomationModalProps) {
  const [footprint, setFootprint] = useState<Footprint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("triggers");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFootprint(null);
    setError(null);
    setTab("triggers");
    void (async () => {
      try {
        const token = getToken();
        const run = async (soql: string) => {
          const res = await apiFetch("/api/salesforce/soql", { instanceUrl, token, apiVersion, soql, tooling: true }, 60000);
          let body: { error?: unknown; records?: unknown[] };
          try {
            body = (await res.json()) as typeof body;
          } catch {
            return { ok: false, error: `Request failed (HTTP ${res.status}).` };
          }
          if (!res.ok || typeof body.error === "string") {
            const msg = typeof body.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status}).`;
            if (res.status === 401) return { ok: false, error: "Session expired - reconnect, then reopen this panel." };
            return { ok: false, error: msg };
          }
          return { ok: true, records: (Array.isArray(body.records) ? body.records : []) as Record<string, unknown>[] };
        };
        const prefix = keyPrefix || (await fetchKeyPrefix(apiName, run));
        const fp = await fetchFootprint(apiName, prefix, run);
        if (!cancelled) {
          setFootprint(fp);
          onLoaded?.(apiName, fp.total);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load automation.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiName, keyPrefix, instanceUrl, apiVersion, getToken, onLoaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copyName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(name);
      window.setTimeout(() => setCopied((cur) => (cur === name ? null : cur)), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  const section = footprint?.sections.find((s) => s.key === tab);
  const total = footprint?.total ?? 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Automation on ${label}`}>
      <div className="flex h-full max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl">
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="shrink-0 text-bronze-600">
            <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" strokeLinejoin="round" />
          </svg>
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-bold text-ivory-950">
            Automation · <span className="font-mono">{label}</span>
          </h2>
          {footprint && (
            <span className="shrink-0 rounded-full bg-ivory-950 px-2 py-0.5 text-[11px] font-bold text-ivory-100" title="Total automation records on this object">
              {total}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close automation panel"
            className="shrink-0 cursor-pointer rounded p-1 text-ivory-500 hover:bg-ivory-200 hover:text-ivory-950"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-line)] px-3 pt-2" role="tablist" aria-label="Automation sections">
          {(footprint?.sections ?? []).map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={tab === s.key}
              onClick={() => setTab(s.key)}
              className={`shrink-0 cursor-pointer rounded-t-lg border-b-2 px-2.5 py-1.5 text-[12px] font-bold transition-colors ${
                tab === s.key
                  ? "border-bronze-600 text-ivory-950"
                  : "border-transparent text-ivory-500 hover:text-ivory-950"
              }`}
            >
              {s.label}
              <span className="ml-1 rounded-full bg-ivory-200 px-1.5 py-px text-[10px] font-bold text-ivory-700">
                {s.status === "ok" ? s.rows.length : "n/a"}
              </span>
            </button>
          ))}
          {!footprint && !error && <span className="px-2 py-2 text-[12px] text-ivory-500">Loading automation…</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
          {!footprint && !error && (
            <ul className="space-y-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-10 animate-pulse rounded-lg bg-ivory-200" />
              ))}
            </ul>
          )}
          {section && section.status === "unavailable" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {section.label} could not be read in this org{section.note ? ` - ${section.note}` : "."} Other tabs are unaffected.
            </p>
          )}
          {section && section.status === "ok" && section.rows.length === 0 && (
            <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-soft)] px-3 py-6 text-center text-[12px] text-ivory-500">
              No {section.label.toLowerCase()} on {label}.
            </p>
          )}
          {section && section.rows.length > 0 && (
            <ul className="space-y-1.5">
              {section.rows.map((r) => (
                <li
                  key={r.id || r.name}
                  className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-2.5 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => void copyName(r.name)}
                    title={`Copy ${r.name}`}
                    className="min-w-0 flex-1 cursor-pointer truncate text-left font-mono text-[12px] font-bold text-ivory-950 hover:text-bronze-700"
                  >
                    {r.name}
                    {copied === r.name && <span className="ml-1 text-[10px] font-bold text-emerald-700">copied</span>}
                  </button>
                  {r.detail && (
                    <span className="hidden max-w-[280px] truncate text-[11px] text-ivory-500 sm:inline" title={r.detail}>
                      {r.detail}
                    </span>
                  )}
                  <ActiveDot active={r.active} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-[var(--color-line)] px-4 py-2">
          <p className="text-[11px] text-ivory-500">
            Live Tooling API read - counts reflect this org right now. Flows match the trigger object; each saved version lists separately.
          </p>
        </div>
      </div>
    </div>
  );
}
