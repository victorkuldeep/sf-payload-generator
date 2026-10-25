"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STORES, withStore, DB_NAME } from "@/lib/db";
import { getCachedConnection, type CachedConnection } from "@/lib/session/cache";
import { PROVIDER_PRESETS } from "@/lib/ai/providers";
import { hasProviderKey } from "@/lib/ai/keyVault";
import { getPolicy, savePolicy } from "@/lib/setup/policy";

/** Mirrors package.json - bump together on release. */
const APP_NAME = "gravenx";
const APP_VERSION = "0.1.0";

function Card({ title, hint, right, children }: { title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="arch-card overflow-hidden">
      <div className="arch-card__head flex items-center gap-2 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ivory-950">{title}</p>
          {hint ? <p className="mt-0.5 text-[11px] text-ivory-600">{hint}</p> : null}
        </div>
        {right}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

export function ConnectionsPanel() {
  const [conn, setConn] = useState<CachedConnection | null>(null);
  const [keyed, setKeyed] = useState<string[]>([]);
  const refresh = () => {
    try {
      setConn(getCachedConnection());
    } catch {
      setConn(null);
    }
    setKeyed(PROVIDER_PRESETS.filter((p) => {
      try {
        return hasProviderKey(p.id);
      } catch {
        return false;
      }
    }).map((p) => p.id));
  };
  useEffect(() => {
    refresh();
  }, []);
  return (
    <div className="space-y-3">
      <Card
        title="Salesforce session"
        hint="Live connection the agent and panels share. The token lives in this tab's memory - never on disk."
        right={
          <button
            type="button"
            onClick={refresh}
            className="cursor-pointer rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] font-semibold text-ivory-700 hover:text-ivory-950"
          >
            Refresh
          </button>
        }
      >
        {!conn ? (
          <p className="text-xs text-ivory-600">
            Not connected - connect from the Studio home, then the agent unlocks everywhere.
          </p>
        ) : (
          <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
            {(
              [
                ["Org host", (() => { try { return new URL(conn.instanceUrl).hostname; } catch { return conn.instanceUrl; } })()],
                ["API version", conn.apiVersion],
                ["Objects cached", String(conn.objectCount)],
                ["Org key", conn.orgKey],
                ["Token", "present in this tab (never shown, never stored)"],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="shrink-0 font-semibold text-ivory-600">{k}</dt>
                <dd className="min-w-0 truncate font-mono text-[11px] text-ivory-950">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
      <Card
        title="AI providers"
        hint="Keys live in this browser's vault (localStorage). Models are picked in Model Studio."
        right={
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("gravenx:model-studio"))}
            className="cursor-pointer rounded-full border border-ivory-950 bg-ivory-950 px-3 py-1.5 text-[11px] font-semibold text-ivory-100 hover:bg-ivory-800"
          >
            Open Model Studio
          </button>
        }
      >
        <ul className="space-y-1.5">
          {PROVIDER_PRESETS.map((p) => {
            const on = keyed.includes(p.id);
            return (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-[#2F5D3A]" : "bg-ivory-300"}`} aria-hidden="true" />
                <span className="font-semibold text-ivory-950">{p.label}</span>
                <span className="font-mono text-[10px] text-ivory-500">{on ? "key saved" : "no key"}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

export function WorkspacePanel() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState<unknown | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const out: Record<string, number> = {};
    await Promise.all(
      Object.values(STORES).map(async (name) => {
        try {
          const rows = await withStore<unknown[]>(name, "readonly", (s) => s.getAll());
          out[name] = rows.length;
        } catch {
          out[name] = -1;
        }
      })
    );
    setCounts(out);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const onExport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const stores: Record<string, unknown[]> = {};
      for (const name of Object.values(STORES)) {
        try {
          stores[name] = await withStore<unknown[]>(name, "readonly", (s) => s.getAll());
        } catch {
          stores[name] = [];
        }
      }
      let policy: unknown = null;
      try {
        policy = getPolicy();
      } catch {
        /* ignore */
      }
      const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), stores, policy }, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `gravenx-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMessage("Workspace exported - keep the file; import restores every store.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      const parsed = JSON.parse(await file.text()) as { stores?: Record<string, unknown[]>; policy?: unknown };
      if (!parsed || typeof parsed !== "object" || !parsed.stores || typeof parsed.stores !== "object") {
        setMessage("That file is not a GRAVENX workspace export.");
        return;
      }
      setConfirmImport(parsed);
    } catch {
      setMessage("Could not read that file as JSON.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doImport = async () => {
    const parsed = confirmImport as { stores: Record<string, { id?: unknown }[]>; policy?: unknown };
    setConfirmImport(null);
    setBusy(true);
    try {
      for (const [name, rows] of Object.entries(parsed.stores)) {
        if (!(Object.values(STORES) as string[]).includes(name) || !Array.isArray(rows)) continue;
        const store = name as (typeof STORES)[keyof typeof STORES];
        await withStore(store, "readwrite", (s) => s.clear());
        for (const row of rows) {
          if (!row || typeof row !== "object" || (row as { id?: unknown }).id === undefined) continue;
          await withStore(store, "readwrite", (s) => s.put(row));
        }
      }
      if (parsed.policy && typeof parsed.policy === "object") {
        try {
          savePolicy(parsed.policy as never);
        } catch {
          /* policy import is best-effort */
        }
      }
      await refresh();
      setMessage("Workspace restored from file.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card
        title="Local data"
        hint="Everything lives in this browser's IndexedDB - canvases, runs, history, wireframes. Counts refresh on open."
        right={
          <button
            type="button"
            onClick={() => void refresh()}
            className="cursor-pointer rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] font-semibold text-ivory-700 hover:text-ivory-950"
          >
            Refresh
          </button>
        }
      >
        {!counts ? (
          <p className="text-xs text-ivory-600">Reading stores…</p>
        ) : (
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .map(([name, n]) => (
                <li key={name} className="flex items-center gap-2 rounded-lg border border-[var(--color-line-soft)] px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ivory-800">{name}</span>
                  <span className="font-mono text-[11px] font-bold text-ivory-950">{n < 0 ? "n/a" : n}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>
      <Card title="Export / import" hint="One file carries every store plus the agent policy. Import replaces matching stores.">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={busy}
            className="cursor-pointer rounded-full border border-ivory-950 bg-ivory-950 px-3 py-1.5 text-[11px] font-semibold text-ivory-100 hover:bg-ivory-800 disabled:opacity-50"
          >
            {busy ? "Working…" : "Export workspace"}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="cursor-pointer rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px] font-semibold text-ivory-700 hover:text-ivory-950 disabled:opacity-50"
          >
            Import workspace…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            aria-label="Workspace export file"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
        </div>
        {message ? <p className="mt-2 text-xs text-ivory-700">{message}</p> : null}
        {confirmImport ? (
          <div className="mt-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-red-800">Replace this workspace with the file&apos;s contents?</p>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => void doImport()}
                disabled={busy}
                className="cursor-pointer rounded-full bg-red-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busy ? "Restoring…" : "Replace everything"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmImport(null)}
                className="cursor-pointer rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-[11px] font-semibold text-ivory-700 hover:text-ivory-950"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export function CompliancePanel() {
  const [banner, setBanner] = useState<string | null>(null);
  const resetBanner = () => {
    try {
      window.localStorage.removeItem("sf-privacy-ack");
      setBanner("Banner will show again on the next home visit.");
    } catch {
      setBanner("Storage unavailable in this browser.");
    }
  };
  return (
    <div className="space-y-3">
      <Card title="Privacy posture" hint="GDPR-ready: essential storage only, no tracking, no ad cookies.">
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-ivory-800">
          <li>Salesforce token lives in this tab&apos;s session memory - proxied server-side, never written to disk.</li>
          <li>AI keys live in this browser&apos;s vault - forwarded per request, never stored server-side, never logged.</li>
          <li>Canvases, runs, history and the agent policy live in this browser (IndexedDB + localStorage).</li>
          <li>Connecting or running AI never sends your org data anywhere except the model provider you chose.</li>
        </ul>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Link href="/privacy" className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px] font-semibold text-ivory-700 hover:text-ivory-950">
            Privacy Policy
          </Link>
          <Link href="/terms" className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px] font-semibold text-ivory-700 hover:text-ivory-950">
            Terms
          </Link>
          <Link href="/security" className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px] font-semibold text-ivory-700 hover:text-ivory-950">
            Security
          </Link>
          <button
            type="button"
            onClick={resetBanner}
            title="Clear the dismissal flag so the home banner shows again"
            className="cursor-pointer rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px] font-semibold text-ivory-700 hover:text-ivory-950"
          >
            Show banner again
          </button>
        </div>
        {banner ? <p className="mt-2 text-xs text-ivory-700">{banner}</p> : null}
      </Card>
    </div>
  );
}

export function AboutPanel() {
  const [usage, setUsage] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  useEffect(() => {
    try {
      if (navigator.storage?.estimate) {
        void navigator.storage.estimate().then((e) => {
          const mb = (v?: number) => (typeof v === "number" ? `${(v / 1048576).toFixed(1)} MB` : "unknown");
          setUsage(`${mb(e.usage)} of ${mb(e.quota)}`);
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const wipe = () => {
    try {
      window.localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => window.location.reload();
      req.onerror = () => window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="space-y-3">
      <Card title="GRAVENX" hint="Architecture engineering studio - designed by an architect, for architects.">
        <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
          {(
            [
              ["App", `${APP_NAME} ${APP_VERSION}`],
              ["Next.js", "15.x (OpenNext Cloudflare worker)"],
              ["Browser storage", usage ?? "measuring…"],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="shrink-0 font-semibold text-ivory-600">{k}</dt>
              <dd className="min-w-0 truncate font-mono text-[11px] text-ivory-950">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="Danger zone" hint="Irreversible. Export a workspace backup first if anything matters.">
        {!confirmWipe ? (
          <button
            type="button"
            onClick={() => setConfirmWipe(true)}
            className="cursor-pointer rounded-full border border-red-400 px-3 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
          >
            Clear all local data…
          </button>
        ) : (
          <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-red-800">Wipe every store, key, flag and the agent policy in this browser?</p>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={wipe}
                className="cursor-pointer rounded-full bg-red-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-800"
              >
                Wipe everything
              </button>
              <button
                type="button"
                onClick={() => setConfirmWipe(false)}
                className="cursor-pointer rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-[11px] font-semibold text-ivory-700 hover:text-ivory-950"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
