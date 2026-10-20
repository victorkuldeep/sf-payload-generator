"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { isSessionExpiredMessage } from "@/lib/salesforce/client";
import {
  APEX_WARN_CHARS,
  executeAnonymousPath,
  apexLogBodyPath,
  parseApexResult,
  apexSummary,
  type ApexRunResult,
} from "@/lib/salesforce/apex";
import Button from "./ui/Button";

interface ApexPanelProps {
  instanceUrl: string;
  apiVersion: string;
  getToken: () => string;
  onSessionExpired?: () => void;
}

interface ApexHistoryEntry {
  id: number;
  at: number;
  preview: string;
  summary: string;
  ok: boolean;
}

const editorClass =
  "w-full rounded border border-ivory-400 bg-white px-3 py-2 font-mono text-xs text-ivory-950 placeholder-ivory-500 focus:border-bronze-500 focus:outline-none focus:ring-1 focus:ring-bronze-500 resize-y";

/** Anonymous Apex runner: Dev Console "Execute Anonymous" over Tooling REST. */
export function ApexPanel({ instanceUrl, apiVersion, getToken, onSessionExpired }: ApexPanelProps) {
  const [code, setCode] = useState("System.debug('Hello from GRAVENX');");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<ApexRunResult | null>(null);
  const [responseMs, setResponseMs] = useState<number | null>(null);
  const [logBody, setLogBody] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [history, setHistory] = useState<ApexHistoryEntry[]>([]);
  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    const token = getToken();
    if (!token) {
      setRunError("Session token unavailable. Please reconnect.");
      return;
    }
    if (!code.trim()) {
      setRunError("Write some Apex first.");
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setRunError(null);
    setResult(null);
    setLogBody(null);
    setLogError(null);
    const started = Date.now();
    try {
      const response = await apiFetch(
        "/api/salesforce/rest",
        {
          instanceUrl,
          token,
          scope: "org",
          method: "GET",
          path: executeAnonymousPath(apiVersion, code),
        },
        120000,
        ctrl.signal
      );
      const data = (await response.json()) as {
        success?: boolean;
        status?: number;
        statusText?: string;
        body?: unknown;
        error?: string;
      };
      if (!response.ok || data.error) {
        const message = typeof data.error === "string" ? data.error : "Request failed";
        setRunError(message);
        if (isSessionExpiredMessage(message)) onSessionExpired?.();
        return;
      }
      if (data.status === 401) {
        onSessionExpired?.();
        return;
      }
      const parsed = parseApexResult(data.body);
      setResult(parsed);
      setResponseMs(Date.now() - started);
      if (parsed.logId) void fetchLog(parsed.logId, token);
      const firstLine = code.trim().split("\n")[0].slice(0, 80);
      setHistory((p) => [{ id: ++idRef.current, at: Date.now(), preview: firstLine, summary: apexSummary(parsed), ok: parsed.success }, ...p].slice(0, 20));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Run failed";
      setRunError(message);
      if (isSessionExpiredMessage(message)) onSessionExpired?.();
    } finally {
      setRunning(false);
    }
  };

  /** Fetch a debug log body - runs automatically after every execution. */
  const fetchLog = async (logId: string, token: string) => {
    setLogLoading(true);
    setLogError(null);
    setLogBody(null);
    try {
      const response = await apiFetch(
        "/api/salesforce/rest",
        {
          instanceUrl,
          token,
          scope: "org",
          method: "GET",
          path: apexLogBodyPath(apiVersion, logId),
        },
        120000
      );
      const data = (await response.json()) as { success?: boolean; body?: unknown; error?: string };
      if (!response.ok || data.error) {
        throw new Error(typeof data.error === "string" ? data.error : "Log fetch failed");
      }
      setLogBody(typeof data.body === "string" ? data.body : JSON.stringify(data.body ?? "", null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Log fetch failed";
      setLogError(message);
      if (isSessionExpiredMessage(message)) onSessionExpired?.();
    } finally {
      setLogLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#E8E2D8] bg-white px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[#27241F]">Anonymous Apex</h2>
            <p className="text-xs text-[#777168]">Execute Apex without deploying - compile errors and debug logs inline.</p>
          </div>
          <span className="rounded border border-ivory-300 bg-ivory-100 px-1.5 py-0.5 font-mono text-[10px] text-ivory-600">
            GET /tooling/executeAnonymous
          </span>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          rows={8}
          aria-label="Apex code"
          placeholder="System.debug('Hello');"
          className={`${editorClass} mt-3 min-h-[160px]`}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void run()} disabled={running} title="Run against the connected org">
            {running ? "Running…" : "Run"}
          </Button>
          {running && (
            <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          )}
          {code.length > APEX_WARN_CHARS && (
            <span className="text-[11px] font-medium text-amber-700">
              Long script ({code.length} chars) - the URL-encoded GET may hit server limits.
            </span>
          )}
          <span className="flex-1" />
          <span className="font-mono text-[11px] text-ivory-500">{code.length} chars</span>
        </div>
        {runError && (
          <div className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 whitespace-pre-wrap" role="alert">
            {runError}
          </div>
        )}
        {result && (
          <div className={`mt-2 rounded-lg border px-3 py-2 ${result.success ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-bold ${result.success ? "text-green-700" : "text-red-700"}`}>
                {result.success ? "Success" : result.compiled ? "Runtime exception" : "Compile failed"}
              </span>
              {responseMs !== null && <span className="text-xs text-ivory-600">{responseMs}ms</span>}
              <span className="flex-1" />
              {result.logId && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const t = getToken();
                    if (t) void fetchLog(result.logId as string, t);
                  }}
                  disabled={logLoading}
                  title="Re-fetch the debug log"
                >
                  {logLoading ? "Loading log…" : "Reload log"}
                </Button>
              )}
            </div>
            <p className={`mt-1 font-mono text-xs ${result.success ? "text-green-800" : "text-red-700"}`}>{apexSummary(result)}</p>
            {result.exceptionStackTrace && (
              <pre className="mt-1 max-h-[160px] overflow-auto font-mono text-[11px] text-red-700 whitespace-pre-wrap">{result.exceptionStackTrace}</pre>
            )}
          </div>
        )}
        {logError && (
          <div className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {logError}
          </div>
        )}
        {logLoading && logBody === null && !logError && (
          <p className="mt-2 text-[12px] text-[#777168]">Loading debug log…</p>
        )}
        {logBody !== null && (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#777168]">Debug log</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const t = logBody;
                  void navigator.clipboard.writeText(t).catch(() => {});
                }}
                title="Copy the full log"
              >
                Copy log
              </Button>
            </div>
            <pre className="max-h-[320px] overflow-auto rounded-lg border border-[#E8E2D8] bg-white px-3 py-2 font-mono text-[11px] text-[#27241F] whitespace-pre-wrap">{logBody}</pre>
          </div>
        )}
      </div>
      {history.length > 0 && (
        <div className="rounded-xl border border-[#E8E2D8] bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-[#27241F]">This session</h3>
            <Button size="sm" variant="ghost" onClick={() => setHistory([])} title="Clear session history">
              Clear
            </Button>
          </div>
          <ul className="mt-2 space-y-1">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-[12px]">
                <span className={`h-2 w-2 shrink-0 rounded-full ${h.ok ? "bg-green-500" : "bg-red-500"}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-mono text-[#27241F]" title={h.preview}>
                  {h.preview || "(empty)"}
                </span>
                <span className="shrink-0 truncate text-[#777168]" title={h.summary}>{h.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
