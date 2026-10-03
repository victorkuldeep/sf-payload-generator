"use client";

import { getCachedConnection } from "@/lib/session/cache";

/**
 * V1 access gate for the AI module: a live Salesforce connection acts as
 * login. Sources, in order: the module connection cache (survives
 * client-side route trips) and the `gravenx_session` restore record
 * (survives reloads until the tab dies). Pure read - no side effects.
 */

const SESSION_KEY = "gravenx_session";

/**
 * Org key scoping AI memory. Prefers the live connection's resolved org
 * key, falls back to the session record's hostname, then "local".
 */
export function aiHistoryKey(): string {
  try {
    const cached = getCachedConnection();
    if (cached?.orgKey) return cached.orgKey;
  } catch {
    /* ignore */
  }
  try {
    if (typeof sessionStorage !== "undefined") {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { instanceUrl?: unknown };
        if (s && typeof s.instanceUrl === "string" && s.instanceUrl) {
          try {
            const host = new URL(s.instanceUrl).hostname;
            if (host) return host;
          } catch {
            return s.instanceUrl;
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return "local";
}

export function isSalesforceConnected(): boolean {
  try {
    if (getCachedConnection()) return true;
  } catch {
    /* non-browser module graph - fall through */
  }
  try {
    if (typeof sessionStorage === "undefined") return false;
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    const s = parsed as { instanceUrl?: unknown; token?: unknown };
    return typeof s.instanceUrl === "string" && s.instanceUrl !== "" && typeof s.token === "string" && s.token !== "";
  } catch {
    return false;
  }
}
