"use client";

import { useMemo, useState } from "react";
import Button from "../ui/Button";
import { apiFetch } from "@/lib/api";
import { preflightRun } from "@/lib/system-design/runner";
import { compileMapping } from "@/lib/system-design/mapping";
import { resolveChain, CHAIN_MAX_HOPS } from "@/lib/system-design/chain";
import { saveSystemRun } from "@/lib/system-design/runStore";
import { findMissingVars, resolveEnvVars, type CredVault } from "@/lib/system-design/credentials";
import {
  newId,
  type SystemConnection,
  type SystemProject,
  type SystemEnvironment,
} from "@/lib/system-design/model";

interface HopTrace {
  lane: number;
  edgeId: string;
  label: string;
  kind: "call" | "mapping";
  status: "ok" | "failed" | "skipped";
  durationMs: number;
  endpoint: string;
  bodyPreview: string;
  note: string;
}

const CALLABLE = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const hostOf = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "";
  }
};

async function callApi(args: {
  baseUrl: string;
  allowHost: string;
  method: string;
  path: string;
  body: string;
  token: string;
}): Promise<{ status: number; statusText: string; durationMs: number; endpoint: string; bodyPreview: string; truncated: boolean }> {
  const base = args.baseUrl.trim().replace(/\/+$/, "");
  const path = args.path.trim().startsWith("/") ? args.path.trim() : `/${args.path.trim()}`;
  const url = `${base}${path}`;
  const response = await apiFetch(
    "/api/system/run",
    {
      url,
      allowHost: args.allowHost,
      method: args.method,
      headers: [{ key: "Content-Type", value: "application/json" }],
      body: args.method === "GET" ? "" : args.body,
      timeoutMs: 25000,
      authToken: args.token || undefined,
    },
    40000
  );
  const text = await response.text();
  let data: {
    success?: boolean;
    status?: number;
    statusText?: string;
    durationMs?: number;
    endpoint?: string;
    responseBodyPreview?: string;
    truncated?: boolean;
    error?: string;
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error(
      response.ok
        ? "Execution backend returned an unreadable response."
        : `Execution backend failed (HTTP ${response.status}).`
    );
  }
  if (!response.ok || data.error) {
    throw new Error(typeof data.error === "string" ? data.error : `Hop failed (HTTP ${response.status}).`);
  }
  return {
    status: data.status ?? 0,
    statusText: data.statusText ?? "",
    durationMs: data.durationMs ?? 0,
    endpoint: data.endpoint ?? url,
    bodyPreview: data.responseBodyPreview ?? "",
    truncated: !!data.truncated,
  };
}

export function ChainRunDialog({
  startEdgeId,
  project,
  environments,
  activeEnvironmentId,
  vault = {},
  onClose,
  onVisUpdate,
}: {
  startEdgeId: string;
  project: SystemProject;
  environments: SystemEnvironment[];
  activeEnvironmentId: string | null;
  vault?: CredVault;
  onClose: () => void;
  onVisUpdate: (edgeId: string, status: "running" | "ok" | "failed" | null) => void;
}) {
  const lanes = useMemo(() => resolveChain(project, startEdgeId), [project, startEdgeId]);
  const startEdge = project.connections.find((c) => c.id === startEdgeId) ?? null;
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId) ?? environments[0] ?? null;

  const involvedSystems = useMemo(() => {
    const ids = new Set<string>();
    for (const lane of lanes) {
      for (const e of lane.edges) {
        ids.add(e.sourceId);
        ids.add(e.targetId);
      }
    }
    return [...ids]
      .map((id) => project.systems.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s);
  }, [lanes, project]);

  const [bases, setBases] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const s of involvedSystems) out[s.id] = s.baseUrl || activeEnv?.baseUrl || "";
    return out;
  });
  const [token, setToken] = useState("");
  const [seedBody, setSeedBody] = useState("{}");
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState<HopTrace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const firstSourceOp = startEdge
    ? (project.operations.find((o) => o.id === startEdge.sourceOperationId) ?? null)
    : null;
  const seedCallable = !!firstSourceOp && CALLABLE.includes(firstSourceOp.method);

  const opOf = (id: string | undefined) => project.operations.find((o) => o.id === id) ?? null;
  const sysOf = (id: string) => project.systems.find((s) => s.id === id) ?? null;

  // Preflight every callable hop URL upfront (bodies resolve at runtime).
  // Any block stops the run before anything fires - fix bases first.
  const blocks: string[] = useMemo(() => {
    const out: string[] = [];
    const checked = new Set<string>();
    const check = (label: string, baseUrl: string, path: string, method: string) => {
      const v = preflightRun({
        baseUrl, path, method,
        allowHost: hostOf(baseUrl),
        timeoutMs: 25000,
        bodyBytes: 0,
      });
      if (!v.ok) out.push(`${label}: ${v.reasons[0]}`);
    };
    if (seedCallable && firstSourceOp && startEdge) {
      check(
        `Seed · ${firstSourceOp.name}`,
        bases[startEdge.sourceId] ?? "", firstSourceOp.path, firstSourceOp.method
      );
    }
    for (const lane of lanes) {
      for (const e of lane.edges) {
        if (checked.has(e.id)) continue;
        checked.add(e.id);
        const top = opOf(e.targetOperationId);
        if (!top) continue;
        check(
          `${sysOf(e.targetId)?.name ?? e.targetId} · ${top.name}`,
          bases[e.targetId] ?? "", top.path, top.method
        );
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, bases, seedCallable]);

  // Session-credential refs ($env.NAME) across seed, token and stored
  // edge templates - missing entries block the run before anything fires.
  const credMissing: string[] = useMemo(() => {
    const texts = [seedBody, token];
    for (const lane of lanes) {
      for (const e of lane.edges) {
        if (e.mapping?.template) texts.push(e.mapping.template);
      }
    }
    return findMissingVars(texts, vault);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, seedBody, token, vault]);

  const run = async () => {
    if (running || lanes.length === 0) return;
    setRunning(true);
    setError(null);
    setTrace([]);
    setDone(false);
    const trail: HopTrace[] = [];
    const push = (t: HopTrace) => {
      trail.push(t);
      setTrace([...trail]);
    };
    const edgeOk = new Map<string, boolean>();
    const markEdge = (edgeId: string, ok: boolean) => {
      const prev = edgeOk.get(edgeId);
      const next = prev === false || !ok ? false : true;
      edgeOk.set(edgeId, next);
      onVisUpdate(edgeId, !ok ? "failed" : "ok");
    };
    try {
      const missingNow = findMissingVars([seedBody, token], vault);
      if (missingNow.length > 0) {
        throw new Error(
          `Missing session credentials: ${missingNow.map((m) => `$env.${m}`).join(", ")}. Add them under Credentials in the project bar.`
        );
      }
      const resolvedSeed = resolveEnvVars(seedBody, vault).text;
      const resolvedToken = resolveEnvVars(token, vault).text;
      let laneNo = 0;
      for (const lane of lanes) {
        laneNo++;
        let inbound = "";
        let first = true;
        for (const e of lane.edges) {
          const top = opOf(e.targetOperationId);
          if (!top) {
            push({
              lane: laneNo, edgeId: e.id,
              label: `Hop: ${sysOf(e.targetId)?.name ?? e.targetId} - no bound target operation, lane stops`,
              kind: "call", status: "failed", durationMs: 0, endpoint: "", bodyPreview: "", note: "stopped",
            });
            markEdge(e.id, false);
            break;
          }
          // Seed: first hop calls the start edge's source op (when callable),
          // otherwise the manual seed body starts the flow.
          if (first) {
            first = false;
            if (seedCallable && firstSourceOp) {
              const sys = sysOf(startEdge!.sourceId);
              onVisUpdate(e.id, "running");
              try {
                const r = await callApi({
                  baseUrl: bases[startEdge!.sourceId] ?? "",
                  allowHost: hostOf(bases[startEdge!.sourceId] ?? ""),
                  method: firstSourceOp.method, path: firstSourceOp.path,
                  body: resolvedSeed, token: resolvedToken,
                });
                inbound = r.bodyPreview;
                push({
                  lane: laneNo, edgeId: e.id,
                  label: `Seed · ${firstSourceOp.method} ${firstSourceOp.name} (${sys?.name ?? "?"})`,
                  kind: "call", status: r.status >= 200 && r.status < 300 ? "ok" : "failed",
                  durationMs: r.durationMs, endpoint: r.endpoint, bodyPreview: r.bodyPreview,
                  note: r.status >= 200 && r.status < 300 ? "" : "stopped",
                });
                if (r.status < 200 || r.status >= 300) {
                  markEdge(e.id, false);
                  break;
                }
              } catch (err) {
                push({
                  lane: laneNo, edgeId: e.id, label: `Seed · ${firstSourceOp.name}`,
                  kind: "call", status: "failed", durationMs: 0, endpoint: "",
                  bodyPreview: "", note: err instanceof Error ? err.message : "failed",
                });
                markEdge(e.id, false);
                break;
              }
            } else {
              inbound = resolvedSeed;
            }
          }
          // Mapping: stored on the edge, passthrough when absent (stated).
          const mapping = e.mapping ?? { mode: "passthrough" as const, template: "" };
          const compiled = compileMapping(mapping.mode, mapping.template, inbound);
          push({
            lane: laneNo, edgeId: e.id,
            label: `Mapping · ${mapping.mode}${e.mapping ? "" : " (default)"}`,
            kind: "mapping",
            status: compiled.ok ? "ok" : "failed",
            durationMs: 0, endpoint: "",
            bodyPreview: compiled.body.slice(0, 2000),
            note: compiled.ok
              ? (compiled.missing.length > 0 ? `nulled: ${compiled.missing.join(", ")}` : "")
              : (compiled.error ?? "mapping failed"),
          });
          if (!compiled.ok) {
            markEdge(e.id, false);
            break;
          }
          // Target call ($env refs in stored templates resolve at send time).
          onVisUpdate(e.id, "running");
          try {
            const r = await callApi({
              baseUrl: bases[e.targetId] ?? "",
              allowHost: hostOf(bases[e.targetId] ?? ""),
              method: top.method, path: top.path,
              body: resolveEnvVars(compiled.body, vault).text,
              token: resolvedToken,
            });
            const ok = r.status >= 200 && r.status < 300;
            push({
              lane: laneNo, edgeId: e.id,
              label: `Call · ${top.method} ${top.name} (${sysOf(e.targetId)?.name ?? "?"})`,
              kind: "call", status: ok ? "ok" : "failed",
              durationMs: r.durationMs, endpoint: r.endpoint, bodyPreview: r.bodyPreview,
              note: ok ? "" : "stopped",
            });
            markEdge(e.id, ok);
            if (!ok) break;
            inbound = r.bodyPreview;
          } catch (err) {
            push({
              lane: laneNo, edgeId: e.id,
              label: `Call · ${top.method} ${top.name}`,
              kind: "call", status: "failed", durationMs: 0, endpoint: "",
              bodyPreview: "", note: err instanceof Error ? err.message : "failed",
            });
            markEdge(e.id, false);
            break;
          }
        }
        if (lane.stopped) {
          push({
            lane: laneNo, edgeId: lane.edges[lane.edges.length - 1]?.id ?? "",
            label: lane.stopped, kind: "mapping", status: "failed",
            durationMs: 0, endpoint: "", bodyPreview: "", note: "stopped",
          });
        }
      }
      setDone(true);
      try {
        await saveSystemRun({
          id: newId("run"),
          createdAt: Date.now(),
          operationName: `Chain from ${sysOf(startEdge?.sourceId ?? "")?.name ?? "?"} (${lanes.length} lane${lanes.length === 1 ? "" : "s"})`,
          systemName: sysOf(startEdge?.sourceId ?? "")?.name ?? "",
          environmentName: activeEnv?.name ?? "(no environment)",
          method: "CHAIN",
          endpoint: "",
          status: trail.some((t) => t.status === "failed") ? 500 : 200,
          statusText: trail.some((t) => t.status === "failed") ? "chain with failures" : "chain complete",
          durationMs: trail.reduce((n, t) => n + t.durationMs, 0),
          truncated: false,
          requestHeaders: {},
          requestBodyPreview: seedBody.slice(0, 10000),
          responseHeaders: {},
          responseBodyPreview: "",
          kind: "chain",
          steps: trail.map((t) => ({
            label: `L${t.lane} · ${t.label}`,
            status: t.status === "ok" ? 200 : 500,
            statusText: t.status,
            durationMs: t.durationMs,
            endpoint: t.endpoint,
          })),
        });
      } catch {
        /* trace display matters more than history persistence */
      }
    } finally {
      setRunning(false);
    }
  };

  const failed = trace.some((t) => t.status === "failed");

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="chain-title" onClick={onClose}>
      <div
        className="modal-card max-w-3xl flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-[var(--color-line-soft)] shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
              Chain run · Test mode · {lanes.length} lane{lanes.length === 1 ? "" : "s"}
            </p>
            <h2 id="chain-title" className="mt-1 truncate text-lg font-bold text-ivory-950">
              Flow from {sysOf(startEdge?.sourceId ?? "")?.name ?? "?"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chain run"
            className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Resolved lanes */}
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-600">
              Resolved path{lanes.length === 1 ? "" : "s"} (max {CHAIN_MAX_HOPS} hops)
            </p>
            {lanes.length === 0 ? (
              <p className="mt-1 text-[11px] text-red-700">Start edge not found - nothing to run.</p>
            ) : (
              <ol className="mt-1.5 space-y-1">
                {lanes.map((lane, i) => (
                  <li key={i} className="font-mono text-[11px] text-ivory-800">
                    <span className="font-bold text-ivory-950">L{i + 1}</span>{" "}
                    {lane.edges.map((e) => sysOf(e.sourceId)?.name ?? "?").join(" → ")} →{" "}
                    {sysOf(lane.edges[lane.edges.length - 1]?.targetId ?? "")?.name ?? "?"}
                    {lane.stopped && <span className="text-amber-700"> · stops: {lane.stopped}</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Per-system bases + token */}
          <div className="grid sm:grid-cols-2 gap-1.5">
            {involvedSystems.map((s) => (
              <label key={s.id} className="block text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
                {s.name} base URL
                <input
                  value={bases[s.id] ?? ""}
                  onChange={(e) => setBases((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  spellCheck={false}
                  placeholder="https://…"
                  aria-label={`${s.name} base URL`}
                  className="mt-0.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 font-mono text-[11px] normal-case tracking-normal text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
                />
              </label>
            ))}
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
              Bearer token, all hops (memory only; $env.NAME works)
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="Token for every hop"
                aria-label="Bearer token for every hop"
                className="mt-0.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 font-mono text-[11px] normal-case tracking-normal text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
              />
            </label>
          </div>

          {/* Seed body */}
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
            {seedCallable ? "First call body" : "Seed payload (first op is an event - you supply the trigger)"}
            <textarea
              value={seedBody}
              onChange={(e) => setSeedBody(e.target.value)}
              spellCheck={false}
              rows={3}
              aria-label="Seed payload"
              className="mt-0.5 w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-2 font-mono text-[11px] leading-relaxed text-ivory-950 focus:border-bronze-500 focus:outline-none"
            />
          </label>

              {error && (
                <p className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-xs text-red-700" role="alert">
                  {error}
                </p>
              )}
              {credMissing.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Missing session credentials
                  </p>
                  <p className="mt-1 text-[11px] text-amber-900">
                    {credMissing.map((m) => `$env.${m}`).join(", ")} - add them under Credentials
                    in the project bar before running.
                  </p>
                </div>
              )}
              {blocks.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Preflight blocked - fix bases to run
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {blocks.map((b) => (
                      <li key={b} className="text-[11px] text-amber-900">· {b}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Button size="sm" onClick={() => void run()} disabled={running || lanes.length === 0 || blocks.length > 0 || credMissing.length > 0} className="w-full">
                {running ? "Running flow…" : done ? "Run again" : "Run full flow (Test mode)"}
              </Button>

          {/* Trace */}
          {trace.length > 0 && (
            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-600">
                Trace · {trace.filter((t) => t.status === "ok").length}/{trace.length} steps ok
                {failed ? " · failures stop their lane" : ""}
              </p>
              <ol className="mt-1.5 space-y-1.5">
                {trace.map((t, i) => (
                  <li key={`${t.lane}-${i}`} className="rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-2.5 py-1.5">
                    <p className="flex items-center gap-1.5 text-[11px]">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${t.status === "ok" ? "bg-green-600" : "bg-red-600"}`}
                      />
                      <span className="font-mono text-[10px] text-ivory-500">L{t.lane}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-ivory-950">{t.label}</span>
                      {t.durationMs > 0 && <span className="shrink-0 font-mono text-[10px] text-ivory-500">{t.durationMs}ms</span>}
                    </p>
                    {t.endpoint && <p className="mt-0.5 break-all font-mono text-[10px] text-ivory-500">{t.endpoint}</p>}
                    {t.note && <p className="mt-0.5 text-[11px] text-amber-800">{t.note}</p>}
                    {t.bodyPreview && (
                      <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ivory-950 p-2 font-mono text-[10px] leading-relaxed text-ivory-100">
                        {t.bodyPreview.slice(0, 2000)}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
