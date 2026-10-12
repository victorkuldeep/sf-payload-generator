"use client";

import { useEffect, useMemo, useState } from "react";
import { renderJsonLines } from "@/lib/mapping/jsonView";

/**
 * Wide source-JSON viewer: the full sample (or OpenAPI-derived) payload
 * behind a mapping graph's source node. Read-only, copy + close.
 */
export function SourceJsonModal({
  name,
  origin,
  text,
  onClose,
}: {
  name: string;
  origin: string | null;
  text: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { lines, truncated, invalid } = useMemo(() => {
    try {
      const parsed = JSON.parse(text) as unknown;
      const r = renderJsonLines(parsed);
      return { lines: r.lines, truncated: r.truncated, invalid: false };
    } catch {
      return { lines: [], truncated: false, invalid: true };
    }
  }, [text]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Source JSON - ${name}`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_32px_96px_-16px_rgba(24,20,12,0.5)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line-soft)] bg-[var(--color-surface-soft)] px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-bronze-300 bg-bronze-100 font-mono text-[13px] font-bold text-bronze-700" aria-hidden="true">
            {"{}"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-ivory-950" title={name}>
              {name}
            </p>
            <p className="truncate font-mono text-[10px] text-ivory-500">
              {origin ? `derived from ${origin}` : "pasted sample JSON"} · {lines.length} lines{truncated ? " (truncated)" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard unavailable */
                }
              })();
            }}
            title="Copy full JSON"
            className="shrink-0 rounded-lg border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ivory-700 hover:border-bronze-400 hover:text-ivory-950 transition-colors cursor-pointer"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close source viewer"
            title="Close (Esc)"
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-ivory-500 hover:text-ivory-950 hover:bg-ivory-200 transition-colors cursor-pointer"
          >
            ✕ Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-white p-4">
          {invalid ? (
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-ivory-950">{text}</pre>
          ) : (
            <pre className="font-mono text-[11px] leading-relaxed" aria-label="Source JSON">
              {lines.map((l, i) => {
                const m = /^(\s*)("[^"]*": )?([\s\S]*)$/.exec(l.text);
                return (
                  <div key={i} className="whitespace-pre-wrap break-all">
                    {m ? (
                      <>
                        {m[1]}
                        {m[2] && <span className="text-[#722F37]">{m[2]}</span>}
                        <span className="text-[#4E342E]">{m[3]}</span>
                      </>
                    ) : (
                      l.text
                    )}
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
