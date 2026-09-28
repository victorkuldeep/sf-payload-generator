"use client";

/**
 * Workspace snapshots: per-org sessionStorage persistence for in-flight work
 * (builder tabs, schema canvas, composite bundles, last mode) so client-side
 * route trips - or a full reload - never wipe progress. Snapshots are keyed
 * by org URL, so switching orgs never restores another org's canvas.
 *
 * Rule: every saver must stay silent until its restore pass has run, otherwise
 * a fresh mount would overwrite the good snapshot with blank state.
 */

export function snapKey(base: string, instanceUrl: string): string {
  return `${base}::${instanceUrl}`;
}

export function loadSnap<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveSnap(key: string, value: unknown): void {
  try {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable - snapshots are best-effort */
  }
}

export function clearSnap(key: string): void {
  try {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
