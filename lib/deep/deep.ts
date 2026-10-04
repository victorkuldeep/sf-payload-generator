"use client";

import { useEffect, useState } from "react";

/**
 * Deep links (record-level navigation). Every entry point reads its query
 * param on mount and selects the matching record; unknown or absent values
 * never break the page - the tab opens exactly as before. Links address
 * records by id, with human numbers (ADR-001, REQ-102) accepted anywhere
 * an id works, matched case-insensitively.
 */

/** Read one query param client-side. SSR-safe: null until mounted. */
export function useDeepParam(key: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get(key)?.trim();
      setValue(raw ? raw : null);
    } catch {
      setValue(null);
    }
  }, [key]);
  return value;
}

/** Match a deep value against records by id, or by human number when present. */
export function findDeepRecord<T extends { id: string; number?: string }>(
  items: T[],
  raw: string | null,
): T | null {
  if (!raw) return null;
  const q = raw.trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  return (
    items.find((i) => i.id === q || (typeof i.number === "string" && i.number.toLowerCase() === lower)) ?? null
  );
}
