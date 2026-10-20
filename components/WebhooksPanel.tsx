"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface WebhooksPanelProps {
  instanceUrl: string;
  apiVersion: string;
  getToken: () => string;
  onSessionExpired?: () => void;
  /** True while this mode is visible - drives feed polling. */
  active?: boolean;
}

interface OwnerEntry {
  uuid: string;
  name: string;
  active: boolean;
  expiresAt: number;
  lastAt: number;
}

interface WebhookCapture {
  reqId: string;
  at: number;
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  bodyText: string;
  size: number;
  truncated: boolean;
}

const POLL_MS = 2500;
const FEED_CAP = 100;

function fmtTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString();
  } catch {
    return "";
  }
}

function fmtExpiry(expiresAt: number): string {
  if (!expiresAt) return "—";
  const days = Math.max(0, Math.round((expiresAt - Date.now()) / 86400000));
  return `${new Date(expiresAt).toLocaleDateString()} (${days}d left)`;
}

function prettyBody(bodyText: string): string {
  const t = bodyText.trim();
  if (!t) return "(empty body)";
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return bodyText;
  }
}

async function copyText(text: string, done: () => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    done();
  } catch {
    /* clipboard unavailable - selection still works */
  }
}

function sessionExpired(data: unknown, status: number): boolean {
  return status === 401 && (data as { error?: string } | null)?.error === "session expired";
}

/** Webhooks console: register inboxes, watch live traffic, inspect everything. */
export function WebhooksPanel({ instanceUrl, getToken, onSessionExpired, active = true }: WebhooksPanelProps) {
  const [entries, setEntries] = useState<OwnerEntry[]>([]);
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [selUuid, setSelUuid] = useState<string | null>(null);
  const [feed, setFeed] = useState<WebhookCapture[]>([]);
  const [feedBusy, setFeedBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [selReqId, setSelReqId] = useState<string | null>(null);
  const [opBusy, setOpBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const activeRef = useRef(active);
  activeRef.current = active;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const selRef = useRef<string | null>(null);
  selRef.current = selUuid;
  const sinceRef = useRef<string | undefined>(undefined);
  const entriesRef = useRef<OwnerEntry[]>([]);
  entriesRef.current = entries;

  const session = useCallback(
    () => ({ token: getToken(), instanceUrl }),
    [getToken, instanceUrl]
  );

  const loadMine = useCallback(async () => {
    setRegBusy(true);
    setRegError(null);
    try {
      const res = await fetch("/api/webhooks/mine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(session()),
      });
      const data = (await res.json()) as { ok?: boolean; entries?: OwnerEntry[]; error?: string };
      if (sessionExpired(data, res.status)) {
        onSessionExpired?.();
        return;
      }
      if (!res.ok || data.ok !== true) throw new Error(data.error ?? `mine failed (${res.status})`);
      const list = Array.isArray(data.entries) ? data.entries : [];
      setEntries(list);
      if (!selRef.current && list.length > 0) {
        setSelUuid(list.find((e) => e.active)?.uuid ?? list[0].uuid);
      }
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "could not load webhooks");
    } finally {
      setRegBusy(false);
    }
  }, [session, onSessionExpired]);

  const loadFeed = useCallback(
    async (reset: boolean) => {
      const uuid = selRef.current;
      if (!uuid) return;
      setFeedBusy(true);
      setFeedError(null);
      try {
        const res = await fetch(`/api/webhooks/${uuid}/feed`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...session(), since: reset ? undefined : sinceRef.current, limit: 50 }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          requests?: WebhookCapture[];
          error?: string;
        };
        if (sessionExpired(data, res.status)) {
          onSessionExpired?.();
          return;
        }
        if (!res.ok || data.ok !== true) throw new Error(data.error ?? `feed failed (${res.status})`);
        const rows = Array.isArray(data.requests) ? data.requests : [];
        if (reset) {
          setFeed(rows.slice(-FEED_CAP));
          sinceRef.current = rows.length > 0 ? rows[rows.length - 1].reqId : undefined;
        } else if (rows.length > 0) {
          setFeed((prev) => {
            const seen = new Set(prev.map((r) => r.reqId));
            const next = [...prev, ...rows.filter((r) => !seen.has(r.reqId))];
            return next.slice(-FEED_CAP);
          });
          sinceRef.current = rows[rows.length - 1].reqId;
        }
      } catch (err) {
        setFeedError(err instanceof Error ? err.message : "feed failed");
      } finally {
        setFeedBusy(false);
      }
    },
    [session, onSessionExpired]
  );

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  useEffect(() => {
    sinceRef.current = undefined;
    setFeed([]);
    setSelReqId(null);
    if (selUuid) void loadFeed(true);
  }, [selUuid, loadFeed]);

  useEffect(() => {
    if (!active || paused || !selUuid) return;
    const t = window.setInterval(() => {
      if (activeRef.current && !pausedRef.current && selRef.current) void loadFeed(false);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [active, paused, selUuid, loadFeed]);

  const register = async () => {
    setRegBusy(true);
    setRegError(null);
    try {
      const res = await fetch("/api/webhooks/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...session(), name: newName.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; uuid?: string; expiresAt?: number; error?: string };
      if (sessionExpired(data, res.status)) {
        onSessionExpired?.();
        return;
      }
      if (!res.ok || data.ok !== true || !data.uuid) throw new Error(data.error ?? `register failed (${res.status})`);
      const entry: OwnerEntry = {
        uuid: data.uuid,
        name: newName.trim() || data.uuid,
        active: true,
        expiresAt: data.expiresAt ?? 0,
        lastAt: Date.now(),
      };
      setEntries((prev) => [entry, ...prev]);
      setNewName("");
      setSelUuid(data.uuid);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "register failed");
    } finally {
      setRegBusy(false);
    }
  };

  const setActive = async (uuid: string, wantActive: boolean) => {
    setOpBusy(true);
    try {
      const res = await fetch("/api/webhooks/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...session(), uuids: [{ uuid, active: wantActive }] }),
      });
      const data = (await res.json()) as { ok?: boolean; entries?: OwnerEntry[]; error?: string };
      if (sessionExpired(data, res.status)) {
        onSessionExpired?.();
        return;
      }
      if (!res.ok || data.ok !== true) throw new Error(data.error ?? `update failed (${res.status})`);
      if (Array.isArray(data.entries)) setEntries(data.entries);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "update failed");
    } finally {
      setOpBusy(false);
    }
  };

  const release = async (uuid: string) => {
    if (!window.confirm(`Release webhook ${uuid}? Captured requests are purged.`)) return;
    setOpBusy(true);
    try {
      const res = await fetch(`/api/webhooks/${uuid}/release`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(session()),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (sessionExpired(data, res.status)) {
        onSessionExpired?.();
        return;
      }
      if (!res.ok || data.ok !== true) throw new Error(data.error ?? `release failed (${res.status})`);
      setEntries((prev) => prev.filter((e) => e.uuid !== uuid));
      if (selRef.current === uuid) {
        setSelUuid(null);
        setFeed([]);
      }
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "release failed");
    } finally {
      setOpBusy(false);
    }
  };

  const heartbeat = async (uuid: string) => {
    setOpBusy(true);
    try {
      const res = await fetch(`/api/webhooks/${uuid}/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(session()),
      });
      const data = (await res.json()) as { ok?: boolean; expiresAt?: number; error?: string };
      if (sessionExpired(data, res.status)) {
        onSessionExpired?.();
        return;
      }
      if (!res.ok || data.ok !== true) throw new Error(data.error ?? `extend failed (${res.status})`);
      setEntries((prev) => prev.map((e) => (e.uuid === uuid ? { ...e, expiresAt: data.expiresAt ?? e.expiresAt } : e)));
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "extend failed");
    } finally {
      setOpBusy(false);
    }
  };

  const selected = entries.find((e) => e.uuid === selUuid) ?? null;
  const inspected = feed.find((r) => r.reqId === selReqId) ?? null;
  const liveCount = entries.filter((e) => e.active).length;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const copiedTimer = useRef(0);

  const markCopied = (key: string) => {
    setCopied(key);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold">Webhooks</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Live inbound traffic for this org + user · keeps the last {FEED_CAP} requests per inbox
          </p>
        </div>
        <span className="ml-auto rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1 text-xs">
          {liveCount}/10 live · {entries.length} registered
        </span>
        <button
          type="button"
          onClick={() => void loadMine()}
          disabled={regBusy}
          className="rounded-md border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-xs hover:bg-ivory-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Inbox name, e.g. order-events"
          maxLength={80}
          className="min-w-52 flex-1 rounded-md border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => void register()}
          disabled={regBusy || liveCount >= 10}
          className="rounded-md bg-burgundy-600 px-3 py-1.5 text-sm text-white hover:bg-burgundy-700 disabled:opacity-50"
        >
          {regBusy ? "Creating…" : "New webhook"}
        </button>
      </div>
      {regError && <p className="text-sm text-red-700">{regError}</p>}

      {entries.length === 0 && !regBusy ? (
        <p className="rounded-md border border-dashed border-[var(--color-line)] bg-white px-3 py-6 text-center text-sm text-[var(--color-muted)]">
          No webhooks yet. Name one above - its URL appears here, ready to paste into Salesforce remote site settings or
          an outbound integration.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)] rounded-md border border-[var(--color-line)] bg-white">
          {entries.map((e) => (
            <li key={e.uuid} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setSelUuid(e.uuid)}
                className={`min-w-0 flex-1 text-left ${selUuid === e.uuid ? "font-semibold" : ""}`}
              >
                <span className="block truncate text-sm">{e.name}</span>
                <span className="block truncate font-mono text-xs text-[var(--color-muted)]">
                  {origin}/api/webhooks/{e.uuid}
                </span>
              </button>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  e.active
                    ? "border-green-300 bg-green-50 text-green-700"
                    : "border-[var(--color-line)] bg-ivory-50 text-[var(--color-muted)]"
                }`}
              >
                {e.active ? "live" : "paused"}
              </span>
              <span className="hidden text-xs text-[var(--color-muted)] sm:inline">expires {fmtExpiry(e.expiresAt)}</span>
              <button
                type="button"
                onClick={() => void copyText(`${origin}/api/webhooks/${e.uuid}`, () => markCopied(`url-${e.uuid}`))}
                className="rounded-md border border-[var(--color-line)] px-2 py-1 text-xs hover:bg-ivory-50"
              >
                {copied === `url-${e.uuid}` ? "Copied" : "Copy URL"}
              </button>
              <button
                type="button"
                onClick={() => void setActive(e.uuid, !e.active)}
                disabled={opBusy}
                className="rounded-md border border-[var(--color-line)] px-2 py-1 text-xs hover:bg-ivory-50 disabled:opacity-50"
              >
                {e.active ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                onClick={() => void heartbeat(e.uuid)}
                disabled={opBusy}
                title="Extend expiry by 7 days"
                className="rounded-md border border-[var(--color-line)] px-2 py-1 text-xs hover:bg-ivory-50 disabled:opacity-50"
              >
                Extend
              </button>
              <button
                type="button"
                onClick={() => void release(e.uuid)}
                disabled={opBusy}
                className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Release
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="space-y-3 rounded-md border border-[var(--color-line)] bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              Live traffic · <span className="font-mono font-normal">{selected.name}</span>
            </h3>
            {feedBusy && <span className="text-xs text-[var(--color-muted)]">syncing…</span>}
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaused((p) => !p);
                }}
                className="rounded-md border border-[var(--color-line)] px-2 py-1 text-xs hover:bg-ivory-50"
              >
                {paused ? "Resume live" : "Pause live"}
              </button>
              <button
                type="button"
                onClick={() => void loadFeed(true)}
                disabled={feedBusy}
                className="rounded-md border border-[var(--color-line)] px-2 py-1 text-xs hover:bg-ivory-50 disabled:opacity-50"
              >
                Reload last {FEED_CAP}
              </button>
            </span>
          </div>
          {feedError && <p className="text-sm text-red-700">{feedError}</p>}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div>
              {feed.length === 0 ? (
                <p className="rounded-md border border-dashed border-[var(--color-line)] px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                  No requests captured yet. POST anything to the inbox URL above - traffic streams in here live.
                </p>
              ) : (
                <ul className="max-h-96 divide-y divide-[var(--color-line)] overflow-y-auto rounded-md border border-[var(--color-line)]">
                  {[...feed].reverse().map((r) => (
                    <li key={r.reqId}>
                      <button
                        type="button"
                        onClick={() => setSelReqId(r.reqId)}
                        className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-ivory-50 ${
                          selReqId === r.reqId ? "bg-ivory-100" : ""
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="rounded bg-ivory-100 px-1.5 py-0.5 font-mono font-semibold">{r.method}</span>
                          <span className="min-w-0 flex-1 truncate font-mono">{r.path}</span>
                          <span className="shrink-0 text-[var(--color-muted)]">{fmtTime(r.at)}</span>
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[var(--color-muted)]">
                          {r.reqId} · {(r.size / 1024).toFixed(1)} KB
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              {!inspected ? (
                <p className="rounded-md border border-dashed border-[var(--color-line)] px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                  Pick a request to inspect its headers, query and payload.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h4 className="font-mono text-xs text-[var(--color-muted)]">{inspected.reqId}</h4>
                    <button
                      type="button"
                      onClick={() => void copyText(prettyBody(inspected.bodyText), () => markCopied("body"))}
                      className="ml-auto rounded-md border border-[var(--color-line)] px-2 py-1 text-xs hover:bg-ivory-50"
                    >
                      {copied === "body" ? "Copied" : "Copy payload"}
                    </button>
                  </div>
                  <div>
                    <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      Headers ({Object.keys(inspected.headers).length})
                    </h5>
                    {Object.keys(inspected.headers).length === 0 ? (
                      <p className="text-xs text-[var(--color-muted)]">No headers captured.</p>
                    ) : (
                      <dl className="overflow-hidden rounded-md border border-[var(--color-line)] text-xs">
                        {Object.entries(inspected.headers).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 border-b border-[var(--color-line)] px-2 py-1 last:border-0">
                            <dt className="truncate font-mono">{k}</dt>
                            <dd className="break-all font-mono text-[var(--color-muted)]">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  <div>
                    <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      Query ({Object.keys(inspected.query).length})
                    </h5>
                    {Object.keys(inspected.query).length === 0 ? (
                      <p className="text-xs text-[var(--color-muted)]">No query string.</p>
                    ) : (
                      <dl className="overflow-hidden rounded-md border border-[var(--color-line)] text-xs">
                        {Object.entries(inspected.query).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 border-b border-[var(--color-line)] px-2 py-1 last:border-0">
                            <dt className="truncate font-mono">{k}</dt>
                            <dd className="break-all font-mono text-[var(--color-muted)]">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  <div>
                    <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      Payload · {(inspected.size / 1024).toFixed(1)} KB{inspected.truncated ? " · truncated" : ""}
                    </h5>
                    <pre className="max-h-80 overflow-auto rounded-md border border-[var(--color-line)] bg-ivory-50 p-2 font-mono text-xs whitespace-pre-wrap break-all">
                      {prettyBody(inspected.bodyText)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
