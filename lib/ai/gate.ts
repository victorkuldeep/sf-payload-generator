"use client";

import { getCachedConnection } from "@/lib/session/cache";

/**
 * V1 access gate for the AI module: a live Salesforce connection acts as
 * login. Sources, in order: the module connection cache (survives
 * client-side route trips) and the `gravenx_session` restore record
 * (survives reloads until the tab dies). Pure read - no side effects.
 */

const SESSION_KEY = "gravenx_session";

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
