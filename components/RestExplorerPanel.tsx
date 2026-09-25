"use client";

import { useState, useCallback, useRef } from "react";
import type { NewCollectionItem, CollectionMethod } from "@/lib/collection/types";
import { originOf, downloadTextFile } from "@/lib/collection/postman";
import { isSessionExpiredMessage } from "@/lib/salesforce/client";
import { apiFetch, ApiTimeoutError } from "@/lib/api";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import CodeBlock from "./ui/CodeBlock";

interface RestExplorerPanelProps {
  instanceUrl: string;
  apiVersion: string;
  getToken: () => string;
  onAddToCollection: (item: NewCollectionItem) => void;
  onSessionExpired?: () => void;
}

type RestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const METHODS: RestMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

interface RestResult {
  status: number;
  statusText: string;
  responseTime: number;
  body: unknown;
  truncated: boolean;
  success: boolean;
}

let headerSeq = 0;
const nextHeaderId = () => `hdr-${Date.now()}-${++headerSeq}`;

const METHOD_STYLES: Record<RestMethod, string> = {
  GET: "bg-blue-100 text-blue-800 border-blue-300",
  POST: "bg-green-100 text-green-800 border-green-300",
  PUT: "bg-amber-100 text-amber-800 border-amber-300",
  PATCH: "bg-amber-100 text-amber-800 border-amber-300",
  DELETE: "bg-red-100 text-red-700 border-red-300",
};

export default function RestExplorerPanel({
  instanceUrl,
  apiVersion,
  getToken,
  onAddToCollection,
  onSessionExpired,
}: RestExplorerPanelProps) {
  const ver = apiVersion.startsWith("v") ? apiVersion : `v${apiVersion}`;
  const origin = originOf(instanceUrl);

  const [method, setMethod] = useState<RestMethod>("GET");
  const [path, setPath] = useState(`/services/data/${ver}/`);
  const [headers, setHeaders] = useState<HeaderRow[]>([
    { id: nextHeaderId(), key: "", value: "" },
  ]);
  const [bodyText, setBodyText] = useState("{\n  \n}");
  const [showConfirm, setShowConfirm] = useState(false);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RestResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  const quickPaths = [
    { label: "API root", path: `/services/data/${ver}/` },
    { label: "Objects", path: `/services/data/${ver}/sobjects/` },
    { label: "Sample query", path: `/services/data/${ver}/query?q=SELECT Id,Name FROM Account LIMIT 5` },
    { label: "Composite", path: `/services/data/${ver}/composite` },
    { label: "Tooling objects", path: `/services/data/${ver}/tooling/sobjects/` },
  ];

  const updateHeader = useCallback((id: string, patch: Partial<HeaderRow>) => {
    setHeaders((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }, []);

  const removeHeader = useCallback((id: string) => {
    setHeaders((prev) => (prev.length <= 1 ? prev.map((h) => (h.id === id ? { ...h, key: "", value: "" } : h)) : prev.filter((h) => h.id !== id)));
  }, []);

  const send = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setRunError("Session token is no longer available. Please reconnect.");
      return;
    }
    if (!path.trim().startsWith("/services/")) {
      setRunError("Path must start with /services/ (locked to this org).");
      return;
    }
    stoppedRef.current = false;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setRunError(null);
    setResult(null);
    setShowConfirm(false);
    try {
      const response = await apiFetch(
        "/api/salesforce/rest",
        {
          instanceUrl,
          token,
          method,
          path: path.trim(),
          headers: headers
            .filter((h) => h.key.trim() !== "")
            .map((h) => ({ key: h.key.trim(), value: h.value })),
          body: method === "GET" ? "" : bodyText,
        },
        120000,
        ctrl.signal
      );
      const data = (await response.json()) as RestResult & { error?: string };
      if (!response.ok || data.error) {
        const message = typeof data.error === "string" ? data.error : "Request failed";
        setRunError(message);
        if (isSessionExpiredMessage(message)) onSessionExpired?.();
        return;
      }
      if (data.status === 401) onSessionExpired?.();
      setResult(data);
    } catch (err) {
      if (stoppedRef.current) {
        setRunError("Stopped - partial response (if any) was discarded.");
      } else if (err instanceof ApiTimeoutError) {
        setRunError(err.message);
      } else {
        const message = err instanceof Error ? err.message : "Network error";
        setRunError(message);
        if (isSessionExpiredMessage(message)) onSessionExpired?.();
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [instanceUrl, method, path, headers, bodyText, getToken, onSessionExpired]);

  const needsConfirm = method !== "GET";

  const responseText =
    result == null
      ? ""
      : typeof result.body === "string"
        ? result.body
        : JSON.stringify(result.body, null, 2);

  const shortPath = path.trim().split("?")[0].split("/").filter(Boolean).slice(-2).join("/") || "root";

  return (
    <div className="arch-card overflow-hidden">
      <div className="arch-card__head px-4 py-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-ivory-950">REST API Explorer</h2>
        <Badge variant="info">Any method</Badge>
        <span className="text-[11px] text-ivory-600">
          Path locked to this org under /services/ - writes ask first.
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Method + URL */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex rounded-lg border border-[var(--color-line)] overflow-hidden shrink-0" role="tablist" aria-label="HTTP method">
            {METHODS.map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={method === m}
                onClick={() => {
                  setMethod(m);
                  setResult(null);
                  setShowConfirm(false);
                }}
                className={`px-3 py-2 font-mono text-xs font-bold tracking-wide transition-colors cursor-pointer ${
                  method === m ? "bg-ivory-950 text-ivory-100" : "bg-[var(--color-surface)] text-ivory-700 hover:text-ivory-950"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex flex-1 min-w-0 items-stretch rounded-lg border border-[var(--color-line)] overflow-hidden focus-within:border-bronze-500">
            <span className="hidden md:flex items-center px-3 font-mono text-[11px] text-ivory-500 bg-[var(--color-canvas)] border-r border-[var(--color-line)] truncate max-w-[280px]" title={origin}>
              {origin || "https://…"}
            </span>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !running) {
                  if (needsConfirm) setShowConfirm(true);
                  else void send();
                }
              }}
              spellCheck={false}
              autoComplete="off"
              aria-label="Request path"
              placeholder={`/services/data/${ver}/sobjects/Account`}
              className="flex-1 min-w-0 bg-white px-3 py-2 font-mono text-xs text-ivory-950 placeholder-ivory-500 focus:outline-none"
            />
          </div>
          {!running ? (
            <Button
              onClick={() => {
                if (needsConfirm) setShowConfirm(true);
                else void send();
              }}
              className="shrink-0"
            >
              Send
            </Button>
          ) : (
            <Button variant="danger" onClick={() => { stoppedRef.current = true; abortRef.current?.abort(); }} className="shrink-0">
              Stop
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ivory-600">Try:</span>
          {quickPaths.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => {
                setPath(q.path);
                setResult(null);
              }}
              className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 font-mono text-[11px] text-bronze-600 hover:border-bronze-500 hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
            >
              {q.label}
            </button>
          ))}
        </div>

        {!showConfirm ? (
          <>
            {/* Headers */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold text-ivory-900">
                  Headers <span className="font-normal text-ivory-500">(Authorization is automatic)</span>
                </p>
                <button
                  type="button"
                  onClick={() => setHeaders((p) => [...p, { id: nextHeaderId(), key: "", value: "" }])}
                  className="text-[11px] font-medium text-bronze-600 hover:text-bronze-700 cursor-pointer"
                >
                  + Add header
                </button>
              </div>
              <div className="space-y-1.5">
                {headers.map((h) => (
                  <div key={h.id} className="flex gap-1.5">
                    <input
                      value={h.key}
                      onChange={(e) => updateHeader(h.id, { key: e.target.value })}
                      placeholder="Header name"
                      aria-label="Header name"
                      spellCheck={false}
                      className="w-40 shrink-0 rounded border border-ivory-400 bg-white px-2.5 py-1.5 font-mono text-xs text-ivory-950 placeholder-ivory-500 focus:border-bronze-500 focus:outline-none"
                    />
                    <input
                      value={h.value}
                      onChange={(e) => updateHeader(h.id, { value: e.target.value })}
                      placeholder="Value"
                      aria-label="Header value"
                      spellCheck={false}
                      className="flex-1 min-w-0 rounded border border-ivory-400 bg-white px-2.5 py-1.5 font-mono text-xs text-ivory-950 placeholder-ivory-500 focus:border-bronze-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeHeader(h.id)}
                      aria-label="Remove header"
                      className="shrink-0 rounded px-2 text-xs text-ivory-500 hover:text-red-700 hover:bg-red-500/10 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            {method !== "GET" && (
              <div>
                <label className="block text-xs font-medium text-ivory-700 mb-1" htmlFor="rest-body">
                  Request body (JSON)
                </label>
                <textarea
                  id="rest-body"
                  rows={6}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  spellCheck={false}
                  aria-label="Request body"
                  className="w-full rounded border border-ivory-400 bg-white px-3 py-2 font-mono text-xs text-ivory-950 placeholder-ivory-500 focus:border-bronze-500 focus:outline-none focus:ring-1 focus:ring-bronze-500 resize-y"
                />
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-3">
            <p className="text-sm text-amber-800">
              This will send a real <strong className="font-mono">{method}</strong> request to{" "}
              <span className="font-mono text-xs break-all">{origin}{path}</span>. Writes can change data — sure?
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => void send()} loading={running}>
                Confirm Send
              </Button>
              <Button variant="ghost" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {runError && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 whitespace-pre-wrap" role="alert">
            {runError}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded border px-1.5 py-0.5 font-mono text-xs font-bold ${METHOD_STYLES[method]}`}>
                {method}
              </span>
              <span className={`text-sm font-bold ${result.success ? "text-green-700" : "text-red-600"}`}>
                {result.status} {result.statusText}
              </span>
              <span className="text-xs text-ivory-600">{result.responseTime}ms</span>
              {result.truncated && (
                <span className="text-[11px] font-medium text-amber-700">Truncated at size cap</span>
              )}
              <span className="flex-1" />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  let parsed: unknown = responseText;
                  try {
                    parsed = JSON.parse(responseText);
                  } catch {
                    /* keep raw text */
                  }
                  onAddToCollection({
                    name: `${method} ${shortPath}`,
                    method: method as CollectionMethod,
                    kind: "rest",
                    url: `${origin}${path.trim()}`,
                    origin,
                    body: parsed,
                  });
                }}
                title="Stage this request in a collection"
              >
                + Collection
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const blob = new Blob([responseText], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `rest-response-${result.status}-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download
              </Button>
            </div>
            <CodeBlock code={responseText} language="json" maxHeight="420px" />
          </div>
        )}
      </div>
    </div>
  );
}
