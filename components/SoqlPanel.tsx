"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type {
  SalesforceObject,
  SalesforceDescribeResult,
} from "@/lib/salesforce/types";
import { rankObjects } from "@/lib/search/rank";
import { isSessionExpiredMessage } from "@/lib/salesforce/client";
import { apiFetch, ApiTimeoutError } from "@/lib/api";
import { downloadTextFile } from "@/lib/collection/postman";
import { newItemId } from "@/lib/collection/types";
import {
  listSoqlQueries,
  saveSoqlQuery,
  deleteSoqlQuery,
  type SoqlQuery,
} from "@/lib/soql/historyDb";
import type { QueryPlan } from "@/app/api/salesforce/query-plan/route";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Input from "./ui/Input";

interface SoqlPanelProps {
  objects: SalesforceObject[];
  instanceUrl: string;
  apiVersion: string;
  getToken: () => string;
  onSessionExpired?: () => void;
}

const SOQL_TIMEOUT_MS = 120000;
const RENDER_CAP = 500;

const TEMPLATES: { name: string; soql: string; tooling?: boolean }[] = [
  {
    name: "Accounts (recent)",
    soql: "SELECT Id, Name, Industry, AnnualRevenue FROM Account ORDER BY CreatedDate DESC LIMIT 20",
  },
  {
    name: "Open opportunities",
    soql: "SELECT Id, Name, StageName, Amount FROM Opportunity WHERE IsClosed = false ORDER BY Amount DESC LIMIT 20",
  },
  {
    name: "Contacts + account names",
    soql: "SELECT Id, FirstName, LastName, Email, Account.Name FROM Contact ORDER BY LastName LIMIT 20",
  },
  {
    name: "Cases + recent comments",
    soql: "SELECT Id, CaseNumber, Subject, (SELECT Id, CommentBody FROM CaseComments ORDER BY CreatedDate DESC LIMIT 3) FROM Case ORDER BY CreatedDate DESC LIMIT 20",
  },
  {
    name: "Tooling: custom objects",
    soql: "SELECT Id, DeveloperName, Label FROM CustomObject ORDER BY DeveloperName LIMIT 50",
    tooling: true,
  },
];

const KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "LIKE", "IN",
  "ORDER BY", "ASC", "DESC", "LIMIT", "OFFSET", "GROUP BY", "HAVING",
  "COUNT()", "TODAY", "YESTERDAY", "TOMORROW", "NULL", "TRUE", "FALSE",
];

interface SoqlRow {
  columns: string[];
  rows: string[][];
  totalSize: number;
  truncated: boolean;
  timeMs: number;
}

function flattenValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const parts: string[] = [];
    for (const [k, val] of Object.entries(o)) {
      if (k === "attributes") continue;
      const s = flattenValue(val);
      if (s) parts.push(s);
    }
    return parts.join(" | ");
  }
  return String(v);
}

function toTable(records: unknown[]): { columns: string[]; rows: string[][] } {
  const columns: string[] = [];
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const rec of records) {
    if (typeof rec !== "object" || rec === null) continue;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
      if (k === "attributes") continue;
      flat[k] = flattenValue(v);
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }
    rows.push(columns.map((c) => flat[c] ?? ""));
  }
  return { columns, rows };
}

function toCsv(columns: string[], rows: string[][], sep: string): string {
  const esc = (s: string) =>
    s.includes(sep) || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  return [columns.map(esc).join(sep), ...rows.map((r) => r.map(esc).join(sep))].join("\n");
}

function parseFromObject(soql: string): string | null {
  const m = soql.match(/\bfrom\s+([A-Za-z0-9_]+)/i);
  return m ? m[1] : null;
}

export default function SoqlPanel({
  objects,
  instanceUrl,
  apiVersion,
  getToken,
  onSessionExpired,
}: SoqlPanelProps) {
  const [soql, setSoql] = useState("SELECT Id, Name FROM Account LIMIT 20");
  const [tooling, setTooling] = useState(false);
  const [allRows, setAllRows] = useState(false);
  const [caretKey, setCaretKey] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const [descCache, setDescCache] = useState<Map<string, SalesforceDescribeResult>>(new Map());
  const descRef = useRef<Map<string, SalesforceDescribeResult>>(new Map());

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<SoqlRow | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  const [planOpen, setPlanOpen] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [plans, setPlans] = useState<QueryPlan[] | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const [history, setHistory] = useState<SoqlQuery[]>([]);
  const [saveLabel, setSaveLabel] = useState("");
  const [fieldInfoOpen, setFieldInfoOpen] = useState(false);

  useEffect(() => {
    listSoqlQueries()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  const mergeDescribe = useCallback((d: SalesforceDescribeResult) => {
    descRef.current.set(d.name, d);
    setDescCache((prev) => {
      if (prev.has(d.name)) return prev;
      const next = new Map(prev);
      next.set(d.name, d);
      return next;
    });
  }, []);

  const ensureDescribe = useCallback(
    async (objectName: string): Promise<SalesforceDescribeResult> => {
      const hit = descRef.current.get(objectName);
      if (hit) return hit;
      const token = getToken();
      if (!token) throw new Error("Session token is no longer available. Please reconnect.");
      const response = await apiFetch("/api/salesforce/describe", {
        instanceUrl,
        token,
        apiVersion,
        objectName,
      });
      const data = (await response.json()) as SalesforceDescribeResult & { error?: string };
      if (!response.ok) {
        const message =
          typeof (data as unknown as { error?: unknown }).error === "string"
            ? (data as unknown as { error: string }).error
            : `Describe failed for ${objectName}`;
        if (isSessionExpiredMessage(message)) onSessionExpired?.();
        throw new Error(message);
      }
      mergeDescribe(data);
      return data;
    },
    [instanceUrl, apiVersion, getToken, onSessionExpired, mergeDescribe]
  );

  const fromObject = useMemo(() => parseFromObject(soql), [soql]);
  const fromDescribe = fromObject ? descCache.get(fromObject) ?? null : null;

  // Ensure the FROM object's describe is cached for suggestions + field info
  useEffect(() => {
    if (!fromObject || descRef.current.has(fromObject)) return;
    ensureDescribe(fromObject).catch(() => {
      /* suggestions stay keyword-only until it loads */
    });
  }, [fromObject, ensureDescribe]);

  const caretToken = useMemo(() => {
    void caretKey;
    const el = taRef.current;
    if (!el || document.activeElement !== el) return "";
    const m = el.value.slice(0, el.selectionStart).match(/[A-Za-z0-9_.]*$/);
    return m ? m[0] : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soql, caretKey]);

  const suggestions = useMemo(() => {
    const items: { label: string; insert: string; hint: string }[] = [];
    const seen = new Set<string>();
    const push = (label: string, insert: string, hint: string) => {
      if (seen.has(label)) return;
      seen.add(label);
      items.push({ label, insert, hint });
    };

    const token = caretToken;
    const dot = token.lastIndexOf(".");
    if (dot > 0 && fromDescribe) {
      // Relationship drill-down: Account.Na -> Account.Name
      const rel = token.slice(0, dot);
      const tail = token.slice(dot + 1).toLowerCase();
      const parentField = fromDescribe.fields.find(
        (f) => f.relationshipName === rel && (f.referenceTo ?? []).length > 0
      );
      if (parentField) {
        const target = descRef.current.get((parentField.referenceTo ?? [])[0]);
        if (target) {
          for (const f of target.fields) {
            if (!tail || f.name.toLowerCase().startsWith(tail) || f.label.toLowerCase().includes(tail)) {
              push(`${rel}.${f.name}`, `${rel}.${f.name}`, f.type);
            }
            if (items.length >= 24) break;
          }
        } else {
          push(`Load ${rel} fields`, `__load:${(parentField.referenceTo ?? [])[0]}`, "fetch metadata");
        }
        return items;
      }
      const childRel = (fromDescribe.childRelationships ?? []).find((r) => r.relationshipName === rel);
      if (childRel) {
        const target = descRef.current.get(childRel.childSObject);
        if (target) {
          for (const f of target.fields) {
            if (!tail || f.name.toLowerCase().startsWith(tail)) push(`${rel}.${f.name}`, `${rel}.${f.name}`, f.type);
            if (items.length >= 24) break;
          }
        } else {
          push(`Load ${rel} fields`, `__load:${childRel.childSObject}`, "fetch metadata");
        }
        return items;
      }
    }

    const tail = (dot > 0 ? token.slice(dot + 1) : token).toLowerCase();
    for (const kw of KEYWORDS) {
      if (!tail || kw.startsWith(tail.toUpperCase())) push(kw, tail && /[a-z]/.test(token) ? kw : kw + " ", "keyword");
      if (items.length >= 8) break;
    }
    if (fromDescribe) {
      for (const f of fromDescribe.fields) {
        if (!tail || f.name.toLowerCase().startsWith(tail) || f.label.toLowerCase().includes(tail)) {
          push(f.name, f.name, f.type);
        }
        if (items.length >= 32) break;
      }
    } else {
      for (const o of rankObjects(objects, token, 12)) {
        push(o.name, o.name, o.label);
      }
    }
    return items;
  }, [caretToken, fromDescribe, objects]);

  const bumpCaret = useCallback(() => setCaretKey((k) => k + 1), []);

  const applySuggestion = useCallback(
    (insert: string) => {
      if (insert.startsWith("__load:")) {
        void ensureDescribe(insert.slice("__load:".length)).then(() => bumpCaret());
        return;
      }
      const el = taRef.current;
      if (!el) {
        setSoql((s) => s + (s.endsWith(" ") || s === "" ? "" : " ") + insert);
        return;
      }
      const pos = el.selectionStart;
      const before = el.value.slice(0, pos).match(/[A-Za-z0-9_.]*$/)?.[0] ?? "";
      const next = el.value.slice(0, pos - before.length) + insert + el.value.slice(el.selectionEnd);
      setSoql(next);
      const caret = pos - before.length + insert.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
        bumpCaret();
      });
    },
    [ensureDescribe, bumpCaret]
  );

  const handleRun = useCallback(async () => {
    const q = soql.trim();
    if (!q) {
      setRunError("Write a query first - or pick a template above.");
      return;
    }
    if (!/\bselect\b/i.test(q) || !/\bfrom\b/i.test(q)) {
      setRunError("That doesn't look like SOQL - it needs SELECT … FROM ….");
      return;
    }
    const token = getToken();
    if (!token) {
      setRunError("Session token is no longer available. Please reconnect.");
      return;
    }
    stoppedRef.current = false;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setRunError(null);
    setResult(null);
    const started = Date.now();
    try {
      const response = await apiFetch(
        "/api/salesforce/soql",
        { instanceUrl, token, apiVersion, soql: q, tooling, allRows },
        SOQL_TIMEOUT_MS,
        ctrl.signal
      );
      const data = (await response.json()) as {
        records?: unknown[];
        totalSize?: number;
        truncated?: boolean;
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !data.success) {
        const message = typeof data.error === "string" ? data.error : "Query failed";
        setRunError(message);
        if (isSessionExpiredMessage(message)) onSessionExpired?.();
        return;
      }
      const table = toTable(data.records ?? []);
      setResult({
        columns: table.columns,
        rows: table.rows,
        totalSize: data.totalSize ?? table.rows.length,
        truncated: !!data.truncated,
        timeMs: Date.now() - started,
      });
      // Auto-history (dedupe identical query+mode)
      const now = Date.now();
      setHistory((prev) => {
        const dup = prev.find((h) => !h.saved && h.soql === q && h.tooling === tooling);
        const entry: SoqlQuery = dup
          ? { ...dup, lastRun: now, rowCount: data.records?.length ?? 0 }
          : {
              id: newItemId(),
              soql: q,
              label: "",
              saved: false,
              tooling,
              rowCount: data.records?.length ?? 0,
              createdAt: now,
              lastRun: now,
            };
        void saveSoqlQuery(entry).catch(() => {});
        const rest = prev.filter((h) => h.id !== entry.id);
        return [entry, ...rest].slice(0, 60);
      });
    } catch (err) {
      if (stoppedRef.current) {
        setRunError("Stopped - partial results (if any) were discarded.");
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
  }, [soql, tooling, allRows, instanceUrl, apiVersion, getToken, onSessionExpired]);

  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
  }, []);

  const handlePlan = useCallback(async () => {
    const q = soql.trim();
    if (!q) {
      setPlanError("Write a query first.");
      setPlanOpen(true);
      return;
    }
    const token = getToken();
    if (!token) {
      setPlanError("Session token is no longer available. Please reconnect.");
      setPlanOpen(true);
      return;
    }
    setPlanOpen(true);
    setPlanLoading(true);
    setPlanError(null);
    setPlans(null);
    try {
      const response = await apiFetch("/api/salesforce/query-plan", {
        instanceUrl,
        token,
        apiVersion,
        soql: q,
      });
      const data = (await response.json()) as {
        plans?: QueryPlan[];
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !data.success) {
        const message = typeof data.error === "string" ? data.error : "Query plan failed";
        setPlanError(message);
        if (isSessionExpiredMessage(message)) onSessionExpired?.();
        return;
      }
      setPlans(data.plans ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setPlanError(message);
      if (isSessionExpiredMessage(message)) onSessionExpired?.();
    } finally {
      setPlanLoading(false);
    }
  }, [soql, instanceUrl, apiVersion, getToken, onSessionExpired]);

  const exportText = useCallback(
    (format: "csv" | "tsv" | "json") => {
      if (!result) return null;
      if (format === "json") {
        return JSON.stringify(
          result.rows.map((r) => Object.fromEntries(result.columns.map((c, i) => [c, r[i]]))),
          null,
          2
        );
      }
      return toCsv(result.columns, result.rows, format === "tsv" ? "\t" : ",");
    },
    [result]
  );

  const copyExport = useCallback(
    async (format: "csv" | "tsv" | "json") => {
      const text = exportText(format);
      if (text == null) return;
      try {
        await navigator.clipboard.writeText(text);
        setNotice(`Copied ${format === "tsv" ? "Excel" : format.toUpperCase()} (${result?.rows.length ?? 0} rows) to clipboard.`);
      } catch {
        setNotice("Clipboard unavailable in this browser.");
      }
    },
    [exportText, result]
  );

  const downloadExport = useCallback(
    (format: "csv" | "json") => {
      const text = exportText(format);
      if (text == null) return;
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      downloadTextFile(
        `soql-export-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${format}`,
        text,
        format === "json" ? "application/json" : "text/csv"
      );
    },
    [exportText]
  );

  const [notice, setNotice] = useState<string | null>(null);

  const historyItems = useMemo(() => history.filter((h) => !h.saved), [history]);
  const savedItems = useMemo(() => history.filter((h) => h.saved), [history]);

  const loadQuery = useCallback(
    (q: string, useTooling: boolean) => {
      setSoql(q);
      setTooling(useTooling);
      setResult(null);
      setRunError(null);
      setPlanOpen(false);
    },
    []
  );

  const handleSave = useCallback(async () => {
    const label = saveLabel.trim() || soql.slice(0, 48);
    const entry: SoqlQuery = {
      id: newItemId(),
      soql: soql.trim(),
      label,
      saved: true,
      tooling,
      rowCount: null,
      createdAt: Date.now(),
      lastRun: Date.now(),
    };
    try {
      await saveSoqlQuery(entry);
      setHistory((prev) => [entry, ...prev]);
      setSaveLabel("");
      setNotice(`Saved “${label}”.`);
    } catch {
      setNotice("Couldn't save (IndexedDB unavailable).");
    }
  }, [saveLabel, soql, tooling]);

  const handleDeleteSaved = useCallback(async (id: string) => {
    try {
      await deleteSoqlQuery(id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } catch {
      /* ignore */
    }
  }, []);

  const cheapest =
    plans && plans.length > 0
      ? plans.reduce((a, b) => (a.relativeCost <= b.relativeCost ? a : b))
      : null;

  return (
    <div className="arch-card overflow-hidden">
      <div className="arch-card__head px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold text-ivory-950">SOQL Query Builder</h2>
        <label className="flex items-center gap-1.5 text-xs text-ivory-700 cursor-pointer select-none" title="Include deleted and archived records (queryAll)">
          <input
            type="checkbox"
            checked={allRows}
            disabled={tooling}
            onChange={(e) => setAllRows(e.target.checked)}
            className="h-4 w-4 rounded border-ivory-400 text-bronze-600 focus:ring-bronze-500 disabled:opacity-40"
          />
          Deleted/Archived
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ivory-700 cursor-pointer select-none" title="Run against the Tooling API (ApexClass, CustomObject, …)">
          <input
            type="checkbox"
            checked={tooling}
            onChange={(e) => {
              setTooling(e.target.checked);
              if (e.target.checked) setAllRows(false);
            }}
            className="h-4 w-4 rounded border-ivory-400 text-bronze-600 focus:ring-bronze-500"
          />
          Tooling API
        </label>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFieldInfoOpen(true)}
          disabled={!fromObject}
          title={fromObject ? `Field reference for ${fromObject}` : "Write a FROM clause first"}
        >
          {fromObject ? `${fromObject} Field Info` : "Field Info"}
        </Button>
      </div>

      <div className="p-4 space-y-3">
        {/* Templates / history / saved */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Load a template"
            defaultValue=""
            onChange={(e) => {
              const t = TEMPLATES.find((x) => x.name === e.target.value);
              if (t) loadQuery(t.soql, !!t.tooling);
              e.target.value = "";
            }}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-ivory-900 focus:outline-none focus:border-bronze-500 cursor-pointer"
          >
            <option value="" disabled>Templates…</option>
            {TEMPLATES.map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
          <select
            aria-label="Load from history"
            defaultValue=""
            onChange={(e) => {
              const h = historyItems.find((x) => x.id === e.target.value);
              if (h) loadQuery(h.soql, h.tooling);
              e.target.value = "";
            }}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-ivory-900 focus:outline-none focus:border-bronze-500 cursor-pointer max-w-[220px]"
          >
            <option value="" disabled>History ({historyItems.length})…</option>
            {historyItems.slice(0, 30).map((h) => (
              <option key={h.id} value={h.id}>
                {(h.rowCount ?? "?") + " rows · "}{h.soql.slice(0, 60)}
              </option>
            ))}
          </select>
          <select
            aria-label="Load a saved query"
            defaultValue=""
            onChange={(e) => {
              const h = savedItems.find((x) => x.id === e.target.value);
              if (h) loadQuery(h.soql, h.tooling);
              e.target.value = "";
            }}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-ivory-900 focus:outline-none focus:border-bronze-500 cursor-pointer max-w-[220px]"
          >
            <option value="" disabled>Saved ({savedItems.length})…</option>
            {savedItems.map((h) => (
              <option key={h.id} value={h.id}>{h.label}</option>
            ))}
          </select>
          {savedItems.length > 0 && (
            <select
              aria-label="Delete a saved query"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void handleDeleteSaved(e.target.value);
                e.target.value = "";
              }}
              className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-red-700 focus:outline-none cursor-pointer max-w-[160px]"
            >
              <option value="" disabled>Delete saved…</option>
              {savedItems.map((h) => (
                <option key={h.id} value={h.id}>{h.label}</option>
              ))}
            </select>
          )}
          <div className="flex gap-1.5 flex-1 min-w-[200px]">
            <div className="flex-1">
              <Input
                placeholder="Name this query…"
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                aria-label="Saved query name"
              />
            </div>
            <Button size="sm" variant="secondary" onClick={handleSave} disabled={!soql.trim()}>
              Save
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { setSoql(""); setResult(null); }}>
            Clear
          </Button>
        </div>

        {/* Editor */}
        <div>
          <textarea
            ref={taRef}
            value={soql}
            onChange={(e) => {
              setSoql(e.target.value);
              bumpCaret();
            }}
            onKeyUp={bumpCaret}
            onClick={bumpCaret}
            onSelect={bumpCaret}
            spellCheck={false}
            rows={5}
            aria-label="SOQL query editor"
            placeholder="SELECT Id, Name FROM Account LIMIT 20"
            className="w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ivory-950 placeholder-ivory-500 focus:border-bronze-500 focus:outline-none focus:ring-1 focus:ring-bronze-500 resize-y"
          />
          {suggestions.length > 0 && (
            <div className="mt-1.5">
              <p className="mb-1 text-[11px] text-ivory-600">
                {fromObject ? `${fromObject} suggestions` : "Suggestions"} - click to insert at caret:
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => applySuggestion(s.insert)}
                    title={`${s.insert} (${s.hint})`}
                    className="shrink-0 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 font-mono text-[11px] text-bronze-600 hover:border-bronze-500 hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {!running ? (
            <Button onClick={handleRun} disabled={!soql.trim()}>
              Run Query
            </Button>
          ) : (
            <Button variant="danger" onClick={handleStop}>
              Stop
            </Button>
          )}
          <Button variant="secondary" onClick={handlePlan} disabled={!soql.trim() || running}>
            Query Plan
          </Button>
          <span className="flex-1" />
          <Button variant="secondary" size="sm" onClick={() => void copyExport("csv")} disabled={!result}>
            Copy CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void copyExport("tsv")} disabled={!result} title="Tab-separated - pastes straight into Excel">
            Copy Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void copyExport("json")} disabled={!result}>
            Copy JSON
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadExport("csv")} disabled={!result}>
            Download
          </Button>
        </div>

        {runError && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 whitespace-pre-wrap" role="alert">
            {runError}
          </div>
        )}
        {notice && <p className="text-xs text-ivory-700">{notice}</p>}

        {result && (
          <div className="rounded-lg border border-[var(--color-line)] overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-line-soft)] bg-[var(--color-surface-soft)] px-3 py-2 text-xs">
              <span className="font-semibold text-ivory-950">
                {result.totalSize.toLocaleString()} row{result.totalSize === 1 ? "" : "s"}
              </span>
              <span className="text-ivory-600">{result.timeMs}ms</span>
              {result.truncated && (
                <span className="font-medium text-amber-700">Truncated at fetch cap - add LIMIT to page deliberately.</span>
              )}
              {tooling && <Badge variant="info">Tooling</Badge>}
              {allRows && <Badge variant="warning">queryAll</Badge>}
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0">
                  <tr>
                    {result.columns.map((c) => (
                      <th
                        key={c}
                        className="border-b border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-left font-mono font-semibold text-ivory-900 whitespace-nowrap"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, RENDER_CAP).map((r, i) => (
                    <tr key={i} className="odd:bg-[var(--color-surface)] even:bg-[var(--color-canvas)] hover:bg-ivory-300">
                      {r.map((cell, j) => (
                        <td
                          key={j}
                          className="border-b border-[var(--color-line-soft)] px-2.5 py-1.5 text-ivory-800 whitespace-nowrap max-w-[320px] overflow-hidden text-ellipsis"
                          title={cell}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > RENDER_CAP && (
                <p className="px-3 py-2 text-[11px] text-ivory-600">
                  Showing first {RENDER_CAP} of {result.rows.length} fetched rows - export for the rest.
                </p>
              )}
              {result.rows.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-ivory-600">Query ran clean - zero rows matched.</p>
              )}
            </div>
          </div>
        )}

        {/* Query plan */}
        {planOpen && (
          <div className="rounded-lg border border-[var(--color-line)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-line-soft)] bg-[var(--color-surface-soft)] px-3 py-2">
              <p className="text-xs font-semibold text-ivory-950">Query Plan (explain)</p>
              <button
                type="button"
                onClick={() => setPlanOpen(false)}
                className="text-[11px] text-ivory-600 hover:text-ivory-950 underline cursor-pointer"
              >
                Hide
              </button>
            </div>
            <div className="p-3">
              {planLoading && <p className="text-xs text-bronze-600">Explaining query…</p>}
              {planError && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap" role="alert">
                  {planError}
                </div>
              )}
              {plans && plans.length === 0 && !planLoading && (
                <p className="text-xs text-ivory-600">No plans returned - the query may not be explainable.</p>
              )}
              {plans && plans.length > 0 && (
                <div className="space-y-2">
                  {plans.map((p, i) => {
                    const isBest = cheapest === p;
                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-2.5 ${isBest ? "border-bronze-500 bg-[var(--color-accent-bg)]" : "border-[var(--color-line)] bg-[var(--color-surface)]"}`}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-bold tracking-tight text-ivory-950">{p.leadingOperationType}</span>
                          {isBest && (
                            <span className="rounded bg-ivory-950 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ivory-100">
                              CHOSEN
                            </span>
                          )}
                          <span className="font-medium text-ivory-600">{p.sobjectType}</span>
                          <span className="flex-1" />
                          <span className="font-mono font-semibold text-ivory-950">cost {p.relativeCost}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ivory-300">
                          <div
                            className="h-full rounded-full bg-bronze-500"
                            style={{ width: `${Math.min(100, Math.max(2, p.relativeCost * 100))}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] font-medium text-ivory-800">
                          <span>cardinality: {p.cardinality ?? "unknown - consider a custom index"}</span>
                          <span>sobject: {p.sobjectCardinality?.toLocaleString?.() ?? p.sobjectCardinality}</span>
                          {(p.fields ?? []).length > 0 && <span>fields: {p.fields!.join(", ")}</span>}
                        </div>
                        {(p.notes ?? []).length > 0 && (
                          <ul className="mt-2 space-y-1.5">
                            {p.notes!.map((n, j) => {
                              const body = n.description ?? n.text ?? "";
                              return (
                                <li key={j} className="text-xs leading-relaxed text-ivory-800">
                                  <span className="font-semibold text-ivory-950">Note: </span>
                                  {body || "No detail provided."}
                                  {n.tableEnumOrId && (
                                    <span className="ml-1.5 font-mono text-[11px] text-ivory-500">
                                      [{n.tableEnumOrId}]
                                    </span>
                                  )}
                                  {n.fields && n.fields.length > 0 && (
                                    <span className="mt-1 flex flex-wrap gap-1">
                                      {n.fields.map((f) => (
                                        <code
                                          key={f}
                                          className="rounded border border-[var(--color-line)] bg-[var(--color-canvas)] px-1.5 py-px font-mono text-[11px] font-medium text-bronze-600"
                                        >
                                          {f}
                                        </code>
                                      ))}
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Field info modal */}
      {fieldInfoOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${fromObject ?? ""} field reference`}
          onClick={() => setFieldInfoOpen(false)}
        >
          <div className="modal-card max-w-2xl flex flex-col" style={{ maxHeight: "84vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[var(--color-line-soft)] shrink-0">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
                  Field reference
                </p>
                <h2 className="mt-1 text-lg font-bold text-ivory-950">{fromObject ?? "No object"}</h2>
              </div>
              <button
                type="button"
                onClick={() => setFieldInfoOpen(false)}
                aria-label="Close field reference"
                className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {!fromDescribe ? (
                <p className="text-xs text-ivory-600">Loading field metadata…</p>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0">
                    <tr>
                      {["Field", "Label", "Type", "Custom", "Req", "Pick"].map((h) => (
                        <th key={h} className="border-b border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-left font-semibold text-ivory-900">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fromDescribe.fields.map((f) => (
                      <tr key={f.name} className="odd:bg-[var(--color-surface)] even:bg-[var(--color-canvas)]">
                        <td className="border-b border-[var(--color-line-soft)] px-2 py-1 font-mono text-ivory-950">{f.name}</td>
                        <td className="border-b border-[var(--color-line-soft)] px-2 py-1 text-ivory-700">{f.label}</td>
                        <td className="border-b border-[var(--color-line-soft)] px-2 py-1 font-mono text-ivory-600">{f.type}</td>
                        <td className="border-b border-[var(--color-line-soft)] px-2 py-1 text-ivory-700">{f.name.includes("__") ? "yes" : ""}</td>
                        <td className="border-b border-[var(--color-line-soft)] px-2 py-1 text-ivory-700">{!f.nillable ? "yes" : ""}</td>
                        <td className="border-b border-[var(--color-line-soft)] px-2 py-1 font-mono text-ivory-600">
                          {(f.type === "picklist" || f.type === "multipicklist") ? (f.picklistValues ?? []).length : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
