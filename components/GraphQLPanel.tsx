"use client";

import { useState, useMemo } from "react";
import type {
  SalesforceObject,
  SalesforceDescribeResult,
  TestRequestResult,
} from "@/lib/salesforce/types";
import {
  getGraphQLFields,
  defaultGraphQLSelection,
  buildGraphQLQuery,
  graphqlEndpoint,
  buildGraphQLCurl,
} from "@/lib/graphql/builder";
import type { NewCollectionItem } from "@/lib/collection/types";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Input from "./ui/Input";
import CodeBlock from "./ui/CodeBlock";

interface GraphQLPanelProps {
  objects: SalesforceObject[];
  instanceUrl: string;
  apiVersion: string;
  getToken: () => string;
  onAddToCollection: (item: NewCollectionItem) => void;
}

type ExportTab = "query" | "curl";

export default function GraphQLPanel({
  objects,
  instanceUrl,
  apiVersion,
  getToken,
  onAddToCollection,
}: GraphQLPanelProps) {
  const [objectSearch, setObjectSearch] = useState("");
  const [objectName, setObjectName] = useState("");
  const [describe, setDescribe] = useState<SalesforceDescribeResult | null>(null);
  const [describeLoading, setDescribeLoading] = useState(false);
  const [describeError, setDescribeError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fieldSearch, setFieldSearch] = useState("");
  const [first, setFirst] = useState("10");
  const [activeTab, setActiveTab] = useState<ExportTab>("query");

  const [runLoading, setRunLoading] = useState(false);
  const [result, setResult] = useState<TestRequestResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const filteredObjects = useMemo(() => {
    const q = objectSearch.toLowerCase().trim();
    const pool = objects.filter((o) => o.queryable !== false);
    if (!q) return pool.slice(0, 100);
    return pool
      .filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.name.toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [objects, objectSearch]);

  const queryableFields = useMemo(
    () => (describe ? getGraphQLFields(describe.fields) : []),
    [describe]
  );

  const filteredFields = useMemo(() => {
    const q = fieldSearch.toLowerCase().trim();
    if (!q) return queryableFields;
    return queryableFields.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.type.toLowerCase().includes(q)
    );
  }, [queryableFields, fieldSearch]);

  const query = useMemo(() => {
    if (!objectName || selected.size === 0) return "";
    try {
      return buildGraphQLQuery({
        objectName,
        fieldNames: [...selected],
        first: parseInt(first, 10) || 10,
      });
    } catch {
      return "";
    }
  }, [objectName, selected, first]);

  const endpoint = graphqlEndpoint(instanceUrl, apiVersion);
  const curl = query ? buildGraphQLCurl(endpoint, query) : "";

  const handlePickObject = async (obj: SalesforceObject) => {
    setObjectName(obj.name);
    setDescribe(null);
    setDescribeError(null);
    setSelected(new Set());
    setResult(null);
    setRunError(null);
    setDescribeLoading(true);

    const token = getToken();
    if (!token) {
      setDescribeError("Session token is no longer available. Please reconnect.");
      setDescribeLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/salesforce/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceUrl, token, apiVersion, objectName: obj.name }),
      });
      const data = (await response.json()) as SalesforceDescribeResult & { error?: string };
      if (!response.ok) {
        setDescribeError(
          typeof (data as unknown as { error?: unknown }).error === "string"
            ? (data as unknown as { error: string }).error
            : "Failed to load fields"
        );
        return;
      }
      setDescribe(data);
      setSelected(new Set(defaultGraphQLSelection(data.fields)));
    } catch (err) {
      setDescribeError(err instanceof Error ? err.message : "Failed to load fields");
    } finally {
      setDescribeLoading(false);
    }
  };

  const toggleField = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setResult(null);
  };

  const handleRun = async () => {
    if (!query) return;
    const token = getToken();
    if (!token) {
      setRunError("Session token is no longer available. Please reconnect.");
      return;
    }
    setRunLoading(true);
    setRunError(null);
    setResult(null);
    try {
      const response = await fetch("/api/salesforce/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceUrl, token, apiVersion, query }),
      });
      const data = (await response.json()) as TestRequestResult & { error?: unknown };
      if (!response.ok || data.error) {
        setRunError(
          typeof data.error === "string" ? data.error : "GraphQL request failed"
        );
      } else {
        setResult(data);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Network error");
    } finally {
      setRunLoading(false);
    }
  };

  return (
    <div className="arch-card overflow-hidden">
      <div className="arch-card__head px-4 py-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-ivory-950">GraphQL Query Builder</h2>
        <Badge variant="info">Read-only</Badge>
        <span className="text-[11px] text-ivory-600">
          Salesforce GraphQL supports queries only — writes stay in REST / Composite.
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-2">
        {/* Left: object + fields */}
        <div className="border-b lg:border-b-0 lg:border-r border-[var(--color-line-soft)]">
          <div className="p-4 border-b border-[var(--color-line-soft)] space-y-3">
            <Input
              label="sObject"
              placeholder="Search queryable objects…"
              value={objectSearch}
              onChange={(e) => setObjectSearch(e.target.value)}
              aria-label="Search objects for GraphQL"
            />
            {objectSearch.trim() && (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line-soft)]" role="listbox" aria-label="Matching objects">
                {filteredObjects.length === 0 ? (
                  <p className="p-3 text-xs text-ivory-600">No objects match.</p>
                ) : (
                  filteredObjects.map((o) => (
                    <button
                      key={o.name}
                      role="option"
                      aria-selected={o.name === objectName}
                      onClick={() => handlePickObject(o)}
                      className={`w-full px-3 py-2 text-left transition-colors cursor-pointer hover:bg-ivory-300 ${
                        o.name === objectName ? "bg-ivory-300" : ""
                      }`}
                    >
                      <span className="block truncate text-xs font-medium text-ivory-950">{o.label}</span>
                      <span className="block truncate text-[11px] font-mono text-ivory-600">{o.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {objectName && (
              <p className="text-xs text-ivory-700">
                Selected: <span className="font-mono font-semibold text-ivory-950">{objectName}</span>
              </p>
            )}
            {describeLoading && <p className="text-xs text-ivory-600">Loading fields…</p>}
            {describeError && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                {describeError}
              </div>
            )}
          </div>

          {describe && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ivory-900">
                  {selected.size} / {queryableFields.length} queryable fields
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(queryableFields.map((f) => f.name)))}>
                    Select all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
                    Clear
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Filter fields…"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                aria-label="Filter fields"
              />
              <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line-soft)]">
                {filteredFields.map((f) => (
                  <label
                    key={f.name}
                    className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-ivory-300 ${
                      selected.has(f.name) ? "bg-ivory-200" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(f.name)}
                      onChange={() => toggleField(f.name)}
                      className="h-4 w-4 shrink-0 rounded border-ivory-400 bg-white text-bronze-600 focus:ring-bronze-500"
                      aria-label={`Select field ${f.label}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ivory-950">{f.label}</span>
                      <span className="block truncate text-[11px] font-mono text-ivory-600">{f.name}</span>
                    </span>
                    <Badge variant="default">{f.type}</Badge>
                  </label>
                ))}
                {filteredFields.length === 0 && (
                  <p className="p-3 text-xs text-ivory-600">No queryable fields match.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="gql-first" className="text-xs font-medium text-ivory-700">
                  Records
                </label>
                <input
                  id="gql-first"
                  type="number"
                  min={1}
                  max={2000}
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  className="w-24 rounded border border-ivory-400 bg-white px-2.5 py-1.5 text-sm font-mono text-ivory-950 focus:border-bronze-500 focus:outline-none focus:ring-1 focus:ring-bronze-500"
                />
                <span className="text-[11px] text-ivory-600">first: N (1–2000)</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: preview + run */}
        <div className="p-4 space-y-4">
          <div className="flex rounded-lg border border-[var(--color-line)] overflow-hidden w-fit text-xs font-medium" role="tablist" aria-label="GraphQL export format">
            {(["query", "curl"] as ExportTab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={activeTab === t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-1.5 transition-colors cursor-pointer ${
                  activeTab === t ? "bg-ivory-950 text-ivory-100" : "bg-[var(--color-surface)] text-ivory-700 hover:text-ivory-950"
                }`}
              >
                {t === "query" ? "Query" : "cURL"}
              </button>
            ))}
          </div>

          {query ? (
            <CodeBlock
              code={activeTab === "query" ? query : curl}
              language={activeTab === "query" ? "graphql" : "bash"}
              maxHeight="320px"
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--color-line)] p-6 text-center text-xs text-ivory-600">
              Pick an sObject and fields to preview the GraphQL query.
            </div>
          )}

          <p className="font-mono text-[11px] text-ivory-600 break-all">
            POST {endpoint}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleRun} loading={runLoading} disabled={!query || runLoading}>
              Run Query
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!query) return;
                onAddToCollection({
                  name: `GraphQL — ${objectName}`,
                  method: "POST",
                  kind: "graphql",
                  url: endpoint,
                  origin: instanceUrl,
                  body: { query },
                });
              }}
              disabled={!query}
              title="Choose a collection to stage this query in"
            >
              + Collection
            </Button>
          </div>

          {runError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700" role="alert">
              {runError}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${result.success ? "text-green-700" : "text-red-600"}`}>
                  {result.status} {result.statusText}
                </span>
                <span className="text-xs text-ivory-600">{result.responseTime}ms</span>
              </div>
              {result.body !== null && result.body !== undefined && (
                <CodeBlock
                  code={typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2)}
                  language="json"
                  maxHeight="320px"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
