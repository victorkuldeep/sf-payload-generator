"use client";

import { useSyncExternalStore } from "react";

/**
 * Agent bridge settings: enabled toggle, pairing code entry, bridge port,
 * and live connection status. Shared between Setup (controls) and the
 * inbox dock (connection owner + approval modal).
 */

export type BridgeStatus = "off" | "connecting" | "live" | "error";

export interface BridgeSettings {
  enabled: boolean;
  code: string;
  port: number;
  status: BridgeStatus;
  tabId: string | null;
  error: string | null;
}

const PORT_KEY = "gravenx-bridge-port";
const ENABLED_KEY = "gravenx-bridge-enabled";
const TAB_KEY = "gravenx-bridge-tab";

function readTabId(): string {
  try {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id = `tab_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  } catch {
    return "tab_fallback";
  }
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function readPort(): number {
  try {
    const n = Number(localStorage.getItem(PORT_KEY));
    if (Number.isFinite(n) && n > 0 && n < 65536) return n;
  } catch {
    /* fall through */
  }
  return 49321;
}

let state: BridgeSettings = {
  enabled: readEnabled(),
  code: "",
  port: readPort(),
  status: "off",
  tabId: null,
  error: null,
};

const listeners = new Set<() => void>();
function emit(): void {
  for (const fn of listeners) fn();
}

export function getBridgeSettings(): BridgeSettings {
  return state;
}

export function setBridgeSettings(patch: Partial<BridgeSettings>): void {
  state = { ...state, ...patch };
  try {
    if (patch.enabled !== undefined) {
      localStorage.setItem(ENABLED_KEY, patch.enabled ? "1" : "0");
    }
    if (patch.port !== undefined) localStorage.setItem(PORT_KEY, String(patch.port));
  } catch {
    /* private mode - session only */
  }
  emit();
}

export function ensureTabId(): string {
  if (!state.tabId) setBridgeSettings({ tabId: readTabId() });
  return (state.tabId ?? readTabId()) as string;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useBridgeSettings(): BridgeSettings {
  return useSyncExternalStore(subscribe, getBridgeSettings, getBridgeSettings);
}
