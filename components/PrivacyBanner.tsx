"use client";

import { useEffect, useState } from "react";

const KEY = "sf-privacy-ack";

/**
 * Privacy banner (archtools language): strictly-essential storage only,
 * dismissed persistently. Truthful copy - this app sets no cookies at
 * all; session lives in memory, collections in IndexedDB.
 */
export function PrivacyBanner() {
  // Start acked so server prerender and first paint agree; the effect
  // reveals the banner only for visitors who never dismissed it.
  const [acked, setAcked] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) !== "1") setAcked(false);
    } catch {
      /* storage unavailable - stay dismissed */
    }
  }, []);

  if (acked) return null;

  const ack = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* storage unavailable */
    }
    setAcked(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Privacy and essential storage"
      className="fixed bottom-4 right-4 z-50 w-[min(92vw,380px)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[0_24px_64px_-16px_rgba(24,20,12,0.4)]"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-line)] text-[var(--color-accent-dark)]" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M12 3 5 5.8v5.4c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V5.8L12 3Z" />
            <path d="m9.2 11.8 2 2 3.6-4" />
          </svg>
        </span>
        <p className="flex-1 text-[13px] font-bold text-[var(--color-ink)]">Privacy &amp; Essential Storage</p>
        <button
          type="button"
          onClick={ack}
          aria-label="Dismiss"
          className="rounded p-1 text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
        This toolkit keeps your session in memory (sessionStorage) and your
        collections, snapshots and history in browser-local IndexedDB. Zero
        tracking, zero ad cookies — 100% private.
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--color-line-soft)] pt-2.5">
        <span className="font-mono text-[11px] text-[var(--color-muted)]">◉ Strictly Essential</span>
        <button
          type="button"
          onClick={ack}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-accent)]/90 transition-colors cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
