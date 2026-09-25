"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import type { SalesforceObject } from "@/lib/salesforce/types";
import SchemaPanel from "@/components/SchemaPanel";
import { ConnectModal } from "@/components/ConnectModal";
import Button from "@/components/ui/Button";

const DEFAULT_API_VERSION =
  process.env.NEXT_PUBLIC_DEFAULT_SF_API_VERSION ?? "v66.0";

function readSavedCreds() {
  try {
    const saved = sessionStorage.getItem("sf_session");
    if (saved) {
      const parsed = JSON.parse(saved) as {
        instanceUrl?: string;
        token?: string;
        apiVersion?: string;
      };
      return {
        instanceUrl: parsed.instanceUrl ?? "",
        token: parsed.token ?? "",
        apiVersion: parsed.apiVersion ?? DEFAULT_API_VERSION,
      };
    }
  } catch {
    /* ignore */
  }
  return { instanceUrl: "", token: "", apiVersion: DEFAULT_API_VERSION };
}

export default function SchemaRoom() {
  const [connected, setConnected] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState("");
  const [apiVersion, setApiVersion] = useState(DEFAULT_API_VERSION);
  const [objects, setObjects] = useState<SalesforceObject[]>([]);
  const [objectCount, setObjectCount] = useState(0);
  const [showConnect, setShowConnect] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [savedCreds, setSavedCreds] = useState(readSavedCreds);
  const tokenRef = useRef<string>("");

  const loadObjects = useCallback(
    async (url: string, token: string, ver: string) => {
      const response = await fetch("/api/salesforce/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceUrl: url, token, apiVersion: ver }),
      });
      const data = (await response.json()) as {
        objects?: SalesforceObject[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Failed to load objects");
      setObjects(data.objects ?? []);
    },
    []
  );

  const handleConnect = useCallback(
    async (url: string, token: string, ver: string) => {
      setConnecting(true);
      setConnectError(null);
      try {
        const response = await fetch("/api/salesforce/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instanceUrl: url, token, apiVersion: ver }),
        });
        const data = (await response.json()) as {
          success?: boolean;
          objectCount?: number;
          error?: string;
        };
        if (!response.ok || !data.success) {
          setConnectError(data.error ?? "Connection failed");
          return;
        }
        tokenRef.current = token;
        sessionStorage.setItem(
          "sf_session",
          JSON.stringify({ instanceUrl: url, token, apiVersion: ver })
        );
        setSavedCreds({ instanceUrl: url, token, apiVersion: ver });
        setInstanceUrl(url);
        setApiVersion(ver);
        setObjectCount(data.objectCount ?? 0);
        setConnected(true);
        setShowConnect(false);
        await loadObjects(url, token, ver);
      } catch (err) {
        setConnectError(err instanceof Error ? err.message : "Connection failed");
      } finally {
        setConnecting(false);
      }
    },
    [loadObjects]
  );

  // Room entry: (1) pop-out handoff from the studio tab, else (2) tab's own session.
  // Fresh tabs don't inherit sessionStorage, so the opener serves the live
  // session over a same-origin, nonce-matched BroadcastChannel (memory only).
  useEffect(() => {
    setSavedCreds(readSavedCreds());
    const params = new URLSearchParams(window.location.search);
    const nonce = params.get("handoff");

    if (nonce) {
      let settled = false;
      let bc: BroadcastChannel | null = null;
      try {
        bc = new BroadcastChannel("sf-schema-handoff");
      } catch {
        bc = null;
      }
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearInterval(iv);
        window.clearTimeout(to);
        bc?.close();
      };
      const announce = () => {
        if (!settled) bc?.postMessage({ type: "schema-room-ready", nonce });
      };
      if (bc) {
        bc.onmessage = (ev: MessageEvent) => {
          const msg = ev.data as {
            type?: string;
            nonce?: string;
            session?: { instanceUrl: string; token: string; apiVersion: string };
          } | null;
          if (
            msg?.type === "schema-room-session" &&
            msg.nonce === nonce &&
            msg.session?.token
          ) {
            const { instanceUrl: u, token: t, apiVersion: v } = msg.session;
            window.history.replaceState(null, "", "/schema");
            finish();
            void handleConnect(u, t, v);
          }
        };
        announce();
      }
      const iv = window.setInterval(announce, 500);
      const to = window.setTimeout(finish, 8000);
      return () => {
        window.clearInterval(iv);
        window.clearTimeout(to);
        bc?.close();
      };
    }

    try {
      const saved = sessionStorage.getItem("sf_session");
      if (!saved) return;
      const { instanceUrl: url, token, apiVersion: ver } = JSON.parse(saved) as {
        instanceUrl: string;
        token: string;
        apiVersion: string;
      };
      if (url && token && ver) void handleConnect(url, token, ver);
    } catch {
      /* stay disconnected */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const host = (() => {
    try {
      return new URL(instanceUrl).host;
    } catch {
      return instanceUrl;
    }
  })();

  return (
    <div className="relative h-screen overflow-hidden bg-[var(--color-canvas)]">
      {/* Full-bleed canvas area */}
      <div className="absolute inset-0 flex flex-col p-3 pt-16">
        <div className="min-h-0 min-w-0 flex-1">
          {connected ? (
            <SchemaPanel
              objects={objects}
              instanceUrl={instanceUrl}
              apiVersion={apiVersion}
              getToken={() => tokenRef.current}
              fillHeight
            />
          ) : (
            <div className="arch-card flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
                Schema room
              </p>
              <h1 className="hero-title mt-2 text-3xl sm:text-4xl">
                Connect to open <em>the full canvas.</em>
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ivory-700">
                {objectCount > 0 || connecting
                  ? "Restoring your org session…"
                  : "This room is chrome-free on purpose — connect and the entire viewport becomes your ERD."}
              </p>
              {!connecting && (
                <Button size="lg" className="mt-5" onClick={() => setShowConnect(true)}>
                  Connect to Salesforce
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating overlay chrome */}
      <div className="absolute left-3 right-3 top-3 z-30 flex items-center gap-2">
        <Link
          href="/"
          className="bg-[var(--color-surface)]/90 backdrop-blur flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-xs font-medium text-ivory-700 shadow-sm hover:text-ivory-950 hover:border-[var(--color-accent)] transition-colors"
          title="Back to the studio"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="m14 6-6 6 6 6" />
          </svg>
          Studio
        </Link>
        <span className="bg-[var(--color-surface)]/90 backdrop-blur rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-xs font-bold text-ivory-950 shadow-sm">
          Schema Map
          <span className="ml-2 hidden sm:inline font-normal text-ivory-600">
            Full-screen data-model explorer
          </span>
        </span>
        <span className="flex-1" />
        <div
          className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs shadow-sm bg-[var(--color-surface)]/90 backdrop-blur ${
            connected ? "border-green-200 text-green-800" : "border-[var(--color-line)] text-[var(--color-muted)]"
          }`}
          role="status"
        >
          <span
            className={`status-dot ${connected ? "is-live" : ""}`}
            style={{
              backgroundColor: connected ? "#4A7C59" : "#AEA48E",
              color: connected ? "#4A7C59" : "#AEA48E",
            }}
            aria-hidden="true"
          />
          <span className="font-medium max-w-[200px] truncate">
            {connected ? host : connecting ? "Connecting…" : "Offline"}
          </span>
          {!connected && !connecting && (
            <button
              type="button"
              onClick={() => setShowConnect(true)}
              className="px-2 py-0.5 rounded-full bg-ivory-950 text-ivory-100 font-semibold cursor-pointer"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      <ConnectModal
        open={showConnect}
        loading={connecting}
        error={connectError}
        initialInstanceUrl={savedCreds.instanceUrl}
        initialToken={savedCreds.token}
        initialApiVersion={savedCreds.apiVersion}
        onClose={() => {
          if (!connecting) setShowConnect(false);
        }}
        onConnect={handleConnect}
      />
    </div>
  );
}
