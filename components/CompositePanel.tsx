"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import {
  CompositeSubRequest,
  SalesforceObject,
  SalesforceDescribeResult,
  CompositePayload,
} from "@/lib/salesforce/types";
import {
  generateCompositePayload,
  deriveReferenceId,
  uniqueReferenceId,
} from "@/lib/payload/generator";
import { isSessionExpiredMessage } from "@/lib/salesforce/client";
import { apiFetch } from "@/lib/api";
import type { NewCollectionItem } from "@/lib/collection/types";
import CompositeTree from "./CompositeTree";
import CompositeRequestEditor from "./CompositeRequestEditor";
import CodeBlock from "./ui/CodeBlock";
import Button from "./ui/Button";

interface CompositePanelProps {
  objects: SalesforceObject[];
  instanceUrl: string;
  apiVersion: string;
  getToken: () => string;
  onAddToCollection: (item: NewCollectionItem) => void;
  onSessionExpired?: () => void;
}

type ExportTab = "json" | "curl";

const MAX_REQUESTS = 25;

function buildEmptySubRequest(id: string): CompositeSubRequest {
  return {
    id,
    referenceId: "",
    method: "POST",
    objectName: "",
    describe: null,
    selectedFieldNames: new Set(),
    fieldValues: {},
    recordId: "",
  };
}

/**
 * Composite workbench: tree on the left (one row per request, nested by
 * @{ref} parentage), single-request editor on the right, payload + test
 * below. No card stack, no reorder arrows - order is execution order.
 */
export default function CompositePanel({
  objects,
  instanceUrl,
  apiVersion,
  getToken,
  onAddToCollection,
  onSessionExpired,
}: CompositePanelProps) {
  const counter = useRef(0);
  const nextId = () => String(++counter.current);
  const payloadRef = useRef<HTMLDivElement>(null);

  const [subRequests, setSubRequests] = useState<CompositeSubRequest[]>([buildEmptySubRequest(nextId())]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [allOrNone, setAllOrNone] = useState(true);
  const [generatedPayload, setGeneratedPayload] = useState<CompositePayload | null>(null);
  const [activeTab, setActiveTab] = useState<ExportTab>("json");

  // Test request state
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ status: number; statusText: string; responseTime: number; body: unknown; success: boolean } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const selected = useMemo(
    () => subRequests.find((sr) => sr.id === selectedId) ?? subRequests[0] ?? null,
    [subRequests, selectedId]
  );
  const selectedIndex = useMemo(
    () => (selected ? subRequests.findIndex((sr) => sr.id === selected.id) : -1),
    [subRequests, selected]
  );
  const refIdCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const sr of subRequests) {
      if (!sr.referenceId) continue;
      m.set(sr.referenceId, (m.get(sr.referenceId) ?? 0) + 1);
    }
    return m;
  }, [subRequests]);

  const updateSubRequest = useCallback((id: string, patch: Partial<CompositeSubRequest>) => {
    setSubRequests((prev) =>
      prev.map((sr) => (sr.id === id ? { ...sr, ...patch } : sr))
    );
    setGeneratedPayload(null);
  }, []);

  const removeSubRequest = useCallback(
    (id: string) => {
      setSubRequests((prev) => {
        const idx = prev.findIndex((sr) => sr.id === id);
        const next = prev.filter((sr) => sr.id !== id);
        // Keep a selection: neighbour first, so the editor never blanks
        // while requests remain.
        if (id === (selected?.id ?? selectedId)) {
          const fallback = next[Math.min(idx, next.length - 1)] ?? null;
          setSelectedId(fallback ? fallback.id : null);
        }
        return next.length > 0 ? next : [buildEmptySubRequest(nextId())];
      });
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setGeneratedPayload(null);
    },
    [selected, selectedId]
  );

  const fetchDescribeFor = useCallback(
    async (subReqId: string, objectName: string) => {
      const token = getToken();
      if (!token) return;
      try {
        const response = await apiFetch("/api/salesforce/describe", { instanceUrl, token, apiVersion, objectName });
        const data = (await response.json()) as SalesforceDescribeResult & { error?: string };
        if (response.ok) {
          setSubRequests((prev) =>
            prev.map((sr) => (sr.id === subReqId ? { ...sr, describe: data } : sr))
          );
        } else if (typeof data.error === "string" && isSessionExpiredMessage(data.error)) {
          onSessionExpired?.();
        }
      } catch (err) {
        if (isSessionExpiredMessage(err instanceof Error ? err.message : "")) {
          onSessionExpired?.();
        }
        // describe failed - leave describe: null, user can retry by re-picking
      }
    },
    [instanceUrl, apiVersion, getToken, onSessionExpired]
  );

  const handleDescribeObject = useCallback(
    async (subReqId: string, objectName: string) => {
      // Assign a unique referenceId (first use keeps the bare base).
      setSubRequests((prev) => {
        const taken = new Set(
          prev.filter((sr) => sr.id !== subReqId).map((sr) => sr.referenceId).filter(Boolean)
        );
        const refId = uniqueReferenceId(deriveReferenceId(objectName), taken);
        return prev.map((sr) =>
          sr.id === subReqId
            ? { ...sr, objectName, referenceId: refId, describe: null, selectedFieldNames: new Set(), fieldValues: {} }
            : sr
        );
      });
      await fetchDescribeFor(subReqId, objectName);
    },
    [fetchDescribeFor]
  );

  const addSubRequest = useCallback(
    (objectName: string) => {
      if (subRequests.length >= MAX_REQUESTS) return;
      const id = nextId();
      setSubRequests((prev) => [...prev, buildEmptySubRequest(id)]);
      setSelectedId(id);
      setGeneratedPayload(null);
      void handleDescribeObject(id, objectName);
    },
    [subRequests.length, handleDescribeObject]
  );

  const duplicateSubRequest = useCallback(
    (id: string) => {
      if (subRequests.length >= MAX_REQUESTS) return;
      const src = subRequests.find((sr) => sr.id === id);
      if (!src) return;
      const taken = new Set(subRequests.map((sr) => sr.referenceId).filter(Boolean));
      const refId = uniqueReferenceId(deriveReferenceId(src.objectName || "request"), taken);
      const clone: CompositeSubRequest = {
        ...src,
        id: nextId(),
        referenceId: src.objectName ? refId : "",
        selectedFieldNames: new Set(src.selectedFieldNames),
        fieldValues: { ...src.fieldValues },
      };
      setSubRequests((prev) => [...prev, clone]);
      setSelectedId(clone.id);
      setGeneratedPayload(null);
    },
    [subRequests]
  );

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleGenerate = () => {
    const payload = generateCompositePayload(subRequests, apiVersion, allOrNone);
    setGeneratedPayload(payload);
    setTestResult(null);
    setTestError(null);
    window.setTimeout(() => {
      payloadRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
  };

  const handleSendTest = async () => {
    setShowConfirm(false);
    setTestLoading(true);
    setTestError(null);
    setTestResult(null);

    const token = getToken();
    if (!token) {
      setTestError("Session token unavailable. Please reconnect.");
      setTestLoading(false);
      return;
    }
    if (!generatedPayload) return;

    try {
      const response = await apiFetch("/api/salesforce/composite", {
        instanceUrl,
        token,
        apiVersion,
        allOrNone: generatedPayload.allOrNone,
        compositeRequest: generatedPayload.compositeRequest,
      });
      const data = (await response.json()) as typeof testResult & { error?: string };
      if (!response.ok || data?.error) {
        const message = typeof data?.error === "string" ? data.error : "Request failed";
        setTestError(message);
        if (isSessionExpiredMessage(message)) onSessionExpired?.();
      } else {
        setTestResult(data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setTestError(message);
      if (isSessionExpiredMessage(message)) onSessionExpired?.();
    } finally {
      setTestLoading(false);
    }
  };

  const ver = apiVersion.startsWith("v") ? apiVersion : `v${apiVersion}`;
  const compositeEndpoint = `${instanceUrl}/services/data/${ver}/composite`;

  const jsonOutput = generatedPayload
    ? JSON.stringify(generatedPayload, null, 2)
    : "";

  const curlOutput = generatedPayload
    ? `curl -X POST \\\n  '${compositeEndpoint}' \\\n  -H 'Authorization: Bearer $SF_ACCESS_TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(generatedPayload, null, 2)}'`
    : "";

  const handleDownload = () => {
    if (!generatedPayload) return;
    const blob = new Blob([jsonOutput], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `composite_payload.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-ivory-950">Composite API Builder</h2>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allOrNone}
                onChange={(e) => setAllOrNone(e.target.checked)}
                className="h-4 w-4 rounded border-ivory-400 bg-white text-ivory-950"
              />
              <span className="text-sm text-ivory-800">allOrNone</span>
            </label>
          </div>
          <Button size="sm" onClick={handleGenerate} disabled={subRequests.length === 0}>
            Generate Composite Payload
          </Button>
        </div>
        <p className="mt-1 text-xs text-ivory-600">
          Endpoint: <span className="font-mono">{compositeEndpoint}</span>
          <span className="ml-3">·</span>
          <span className="ml-3">Up to 25 sub-requests · reference earlier records with <code className="font-mono text-ivory-800">@&#123;referenceId.id&#125;</code></span>
        </p>
      </div>

      {/* Workbench: tree + single-request editor */}
      <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <CompositeTree
          subRequests={subRequests}
          selectedId={selected?.id ?? null}
          collapsed={collapsed}
          onSelect={setSelectedId}
          onToggleCollapse={toggleCollapse}
          onDuplicate={duplicateSubRequest}
          onRemove={removeSubRequest}
          onAddObject={addSubRequest}
          allObjects={objects}
        />
        {selected && (
          <CompositeRequestEditor
            key={selected.id}
            subRequest={selected}
            index={selectedIndex}
            allObjects={objects}
            priorSubRequests={selectedIndex > 0 ? subRequests.slice(0, selectedIndex) : []}
            refIdTaken={(refIdCounts.get(selected.referenceId) ?? 0) > 1}
            onUpdate={updateSubRequest}
            onRemove={removeSubRequest}
            onDescribeObject={handleDescribeObject}
          />
        )}
      </div>

      {/* Generated payload */}
      {generatedPayload && (
        <div ref={payloadRef} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] scroll-mt-20">
          <div className="border-b border-ivory-400 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-ivory-900">Composite Payload</h3>
                <span className="text-xs text-ivory-600">
                  {generatedPayload.compositeRequest.length} sub-requests · allOrNone: {String(generatedPayload.allOrNone)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleDownload}>Download JSON</Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!generatedPayload) return;
                    const n = generatedPayload.compositeRequest.length;
                    onAddToCollection({
                      name: `Composite - ${n} sub-request${n === 1 ? "" : "s"}`,
                      method: "POST",
                      kind: "composite",
                      url: compositeEndpoint,
                      origin: instanceUrl,
                      body: generatedPayload,
                    });
                  }}
                  title="Choose a collection to stage this batch in"
                >
                  + Collection
                </Button>
              </div>
            </div>

            <div className="mt-3 flex border-b border-ivory-400 -mb-4">
              {(["json", "curl"] as ExportTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-xs font-medium tracking-wide border-b-2 transition-colors cursor-pointer -mb-px ${
                    activeTab === tab
                      ? "border-ivory-950 text-ivory-950"
                      : "border-transparent text-ivory-600 hover:text-ivory-950"
                  }`}
                >
                  {tab === "json" ? "JSON" : "cURL"}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 space-y-4">
            <CodeBlock code={activeTab === "json" ? jsonOutput : curlOutput} language={activeTab === "json" ? "json" : "bash"} maxHeight="500px" />

            {/* Test send */}
            <div className="border-t border-ivory-400 pt-4">
              {!showConfirm ? (
                <Button variant="danger" size="sm" onClick={() => setShowConfirm(true)} disabled={testLoading}>
                  Send Composite Test Request
                </Button>
              ) : (
                <div className="rounded border border-amber-300 bg-amber-50 p-3 space-y-3">
                  <p className="text-sm text-amber-800">
                    ⚠ This will execute {generatedPayload.compositeRequest.length} sub-request(s) against your Salesforce org{allOrNone ? " - all or none" : ""}. Confirm?
                  </p>
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" onClick={handleSendTest} loading={testLoading}>
                      Confirm Send
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {testError && (
                <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {testError}
                </div>
              )}

              {testResult && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${testResult.success ? "text-green-700" : "text-red-600"}`}>
                      {testResult.status} {testResult.statusText}
                    </span>
                    <span className="text-xs text-ivory-600">{testResult.responseTime}ms</span>
                  </div>
                  <CodeBlock
                    code={typeof testResult.body === "string" ? testResult.body : JSON.stringify(testResult.body, null, 2)}
                    language="json"
                    maxHeight="400px"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
