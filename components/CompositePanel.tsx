"use client";

import { useState, useCallback, useMemo } from "react";
import type { SalesforceObject, SalesforceDescribeResult, SalesforceField } from "@/lib/salesforce/types";
import { apiFetch } from "@/lib/api";
import { isSessionExpiredMessage } from "@/lib/salesforce/client";
import { getWritableFields, isRequiredField } from "@/lib/salesforce/metadata";
import type { NewCollectionItem } from "@/lib/collection/types";
import {
  buildStudioPayload,
  validateStudio,
  fixExecutionOrder,
  nextReferenceId,
  emptyStudioRequest,
  newStudioId,
  type StudioDocument,
  type StudioRequest,
  type StudioFieldValue,
  type StudioPayload,
} from "@/lib/composite/studio";
import StudioRequests, { type StudioRequestActions } from "./composite-studio/StudioRequests";
import StudioGraph from "./composite-studio/StudioGraph";
import StudioPayloadView from "./composite-studio/StudioPayload";
import Button from "./ui/Button";

interface CompositePanelProps {
  objects: SalesforceObject[];
  instanceUrl: string;
  apiVersion: string;
  getToken: () => string;
  onAddToCollection: (item: NewCollectionItem) => void;
  onSessionExpired?: () => void;
}

type StudioScreen = "requests" | "graph" | "payload";

const MAX_REQUESTS = 25;
const API_VERSIONS = ["v75.0", "v74.0", "v73.0", "v72.0", "v71.0", "v70.0", "v69.0", "v68.0", "v67.0", "v66.0", "v65.0"];

/**
 * Composite Studio shell: one canonical StudioDocument shared by the
 * Requests / Graph / Payload screens. Screen switches never lose state.
 */
export default function CompositePanel({
  objects,
  instanceUrl,
  apiVersion,
  getToken,
  onAddToCollection,
  onSessionExpired,
}: CompositePanelProps) {
  const [doc, setDoc] = useState<StudioDocument>(() => ({
    name: "Untitled transaction",
    apiVersion,
    allOrNone: true,
    requests: [emptyStudioRequest(newStudioId("req"))],
    mappings: [],
  }));
  const [describes, setDescribes] = useState<Map<string, SalesforceDescribeResult>>(new Map());
  const [screen, setScreen] = useState<StudioScreen>("requests");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payload, setPayload] = useState<StudioPayload | null>(null);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);

  // Test request state
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ status: number; statusText: string; responseTime: number; body: unknown; success: boolean } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const issues = useMemo(() => validateStudio(doc, describes), [doc, describes]);
  const errCount = issues.filter((i) => i.level === "error").length;
  const warnCount = issues.filter((i) => i.level === "warning").length;

  const ver = doc.apiVersion.startsWith("v") ? doc.apiVersion : `v${doc.apiVersion}`;
  const compositeEndpoint = `${instanceUrl}/services/data/${ver}/composite`;

  const touch = useCallback(() => {
    setPayload(null);
    setTestResult(null);
    setTestError(null);
    setOrderNotice(null);
  }, []);

  const fetchDescribe = useCallback(
    async (requestId: string, objectName: string): Promise<SalesforceDescribeResult | null> => {
      const token = getToken();
      if (!token) return null;
      try {
        const response = await apiFetch("/api/salesforce/describe", { instanceUrl, token, apiVersion, objectName });
        const data = (await response.json()) as SalesforceDescribeResult & { error?: string };
        if (response.ok) {
          setDescribes((prev) => new Map(prev).set(objectName, data));
          // Mandatory fields auto-added: required + writable for the
          // request's method, empty values for the user to fill.
          setDoc((p) => ({
            ...p,
            requests: p.requests.map((r) => {
              if (r.id !== requestId) return r;
              const operation = r.method === "PATCH" ? "PATCH" : "POST";
              const have = new Set(r.fields.map((f) => f.apiName));
              const required = getWritableFields(data.fields, operation)
                .filter((f) => !have.has(f.name) && isRequiredField(f, operation))
                .map((f) => ({
                  apiName: f.name,
                  fieldLabel: f.label,
                  fieldType: f.type,
                  mode: "literal" as const,
                  literal: "",
                  mappingId: null,
                }));
              return required.length > 0 ? { ...r, fields: [...r.fields, ...required] } : r;
            }),
          }));
          return data;
        }
        if (typeof data.error === "string" && isSessionExpiredMessage(data.error)) onSessionExpired?.();
      } catch (err) {
        if (isSessionExpiredMessage(err instanceof Error ? err.message : "")) onSessionExpired?.();
      }
      return null;
    },
    [instanceUrl, apiVersion, getToken, onSessionExpired]
  );

  // ── request actions ──

  const handleAddObject = useCallback(
    (objectName: string) => {
      if (doc.requests.length >= MAX_REQUESTS) return;
      const obj = objects.find((o) => o.name === objectName);
      const id = newStudioId("req");
      const taken = new Set(doc.requests.map((r) => r.referenceId).filter(Boolean));
      const referenceId = nextReferenceId(obj?.label ?? objectName, taken);
      const req: StudioRequest = {
        ...emptyStudioRequest(id),
        objectApiName: objectName,
        objectLabel: obj?.label ?? objectName,
        referenceId,
      };
      setDoc((p) => ({ ...p, requests: [...p.requests, req] }));
      setSelectedId(id);
      touch();
      void fetchDescribe(id, objectName);
    },
    [doc.requests, objects, fetchDescribe, touch]
  );

  const handleDescribeObject = useCallback(
    async (id: string, objectName: string) => {
      const obj = objects.find((o) => o.name === objectName);
      setDoc((p) => {
        const taken = new Set(p.requests.filter((r) => r.id !== id).map((r) => r.referenceId).filter(Boolean));
        const referenceId = nextReferenceId(obj?.label ?? objectName, taken);
        return {
          ...p,
          requests: p.requests.map((r) =>
            r.id === id
              ? { ...r, objectApiName: objectName, objectLabel: obj?.label ?? objectName, referenceId, fields: [] }
              : r
          ),
          // Changing object drops this request's mappings (targets may be invalid)
          mappings: p.mappings.filter((m) => m.targetRequestId !== id),
        };
      });
      touch();
      await fetchDescribe(id, objectName);
    },
    [objects, fetchDescribe, touch]
  );

  const handleDuplicate = useCallback(
    (id: string, withLinks: boolean) => {
      if (doc.requests.length >= MAX_REQUESTS) return;
      const src = doc.requests.find((r) => r.id === id);
      if (!src) return;
      const taken = new Set(doc.requests.map((r) => r.referenceId).filter(Boolean));
      const cloneId = newStudioId("req");
      const clone: StudioRequest = {
        ...src,
        id: cloneId,
        displayName: src.displayName ? `${src.displayName} copy` : "",
        referenceId: nextReferenceId(src.objectLabel || src.objectApiName || "request", taken),
        fields: src.fields.map((f) => ({ ...f, mappingId: null, mode: f.mode === "reference" ? ("literal" as const) : f.mode })),
        position: undefined,
      };
      // Duplicated literal values that embed the old expression stay as text.
      if (withLinks) {
        const idMap = new Map<string, string>();
        setDoc((p) => {
          const mappings = p.mappings.filter((m) => m.targetRequestId === id).map((m) => ({
            ...m,
            id: newStudioId("map"),
            targetRequestId: cloneId,
          }));
          for (const m of mappings) idMap.set(m.id, m.id);
          void idMap;
          const fields = clone.fields.map((f) => {
            const srcField = src.fields.find((x) => x.apiName === f.apiName);
            const srcMapping = p.mappings.find((x) => x.id === srcField?.mappingId);
            const cloned = mappings.find(
              (x) => x.targetFieldApiName === f.apiName && x.sourceRequestId === srcMapping?.sourceRequestId
            );
            if (srcField?.mode === "reference" && srcMapping && cloned) {
              return { ...f, mode: "reference" as const, mappingId: cloned.id };
            }
            return f;
          });
          return {
            ...p,
            requests: [...p.requests, { ...clone, fields }],
            mappings: [...p.mappings, ...mappings],
          };
        });
      } else {
        setDoc((p) => ({ ...p, requests: [...p.requests, clone] }));
      }
      setSelectedId(cloneId);
      touch();
    },
    [doc.requests, touch]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setDoc((p) => {
        const next = p.requests.filter((r) => r.id !== id);
        return {
          ...p,
          requests: next.length > 0 ? next : [{ ...emptyStudioRequest(newStudioId("req")) }],
          mappings: p.mappings.filter((m) => m.sourceRequestId !== id && m.targetRequestId !== id),
        };
      });
      setSelectedId((prev) => {
        if (prev !== id) return prev;
        const idx = doc.requests.findIndex((r) => r.id === id);
        const rest = doc.requests.filter((r) => r.id !== id);
        return rest[Math.min(idx, rest.length - 1)]?.id ?? null;
      });
      touch();
    },
    [doc.requests, touch]
  );

  const handleMove = useCallback(
    (id: string, dir: -1 | 1) => {
      setDoc((p) => {
        const idx = p.requests.findIndex((r) => r.id === id);
        const j = idx + dir;
        if (idx < 0 || j < 0 || j >= p.requests.length) return p;
        const next = [...p.requests];
        [next[idx], next[j]] = [next[j], next[idx]];
        return { ...p, requests: next };
      });
      touch();
    },
    [touch]
  );

  const handleUpdateRequest = useCallback(
    (id: string, patch: Partial<StudioRequest>) => {
      setDoc((p) => ({ ...p, requests: p.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
      touch();
    },
    [touch]
  );

  // ── field actions ──

  const handleAddFields = useCallback(
    (requestId: string, fields: SalesforceField[]) => {
      setDoc((p) => ({
        ...p,
        requests: p.requests.map((r) => {
          if (r.id !== requestId) return r;
          const have = new Set(r.fields.map((f) => f.apiName));
          const rows: StudioFieldValue[] = fields
            .filter((f) => !have.has(f.name))
            .map((f) => ({
              apiName: f.name,
              fieldLabel: f.label,
              fieldType: f.type,
              mode: "literal" as const,
              literal: "",
              mappingId: null,
            }));
          return { ...r, fields: [...r.fields, ...rows] };
        }),
      }));
      touch();
    },
    [touch]
  );

  const handleRemoveField = useCallback(
    (requestId: string, apiName: string) => {
      // Mandatory fields are structural - refusing beats a corrupt request.
      const req = doc.requests.find((r) => r.id === requestId);
      const desc = req ? describes.get(req.objectApiName) : undefined;
      const meta = desc?.fields.find((f) => f.name === apiName);
      if (req && meta) {
        const operation = req.method === "PATCH" ? "PATCH" : "POST";
        if (isRequiredField(meta, operation)) return;
      }
      setDoc((p) => {
        const req = p.requests.find((r) => r.id === requestId);
        const field = req?.fields.find((f) => f.apiName === apiName);
        return {
          ...p,
          requests: p.requests.map((r) =>
            r.id === requestId ? { ...r, fields: r.fields.filter((f) => f.apiName !== apiName) } : r
          ),
          mappings: field?.mappingId ? p.mappings.filter((m) => m.id !== field.mappingId) : p.mappings,
        };
      });
      touch();
    },
    [touch, doc.requests, describes]
  );

  const handleSetLiteral = useCallback(
    (requestId: string, apiName: string, value: unknown) => {
      setDoc((p) => ({
        ...p,
        requests: p.requests.map((r) =>
          r.id === requestId
            ? { ...r, fields: r.fields.map((f) => (f.apiName === apiName ? { ...f, literal: value } : f)) }
            : r
        ),
      }));
      touch();
    },
    [touch]
  );

  const handleSetMode = useCallback(
    (requestId: string, apiName: string, mode: "literal" | "reference" | "null") => {
      setDoc((p) => ({
        ...p,
        requests: p.requests.map((r) => {
          if (r.id !== requestId) return r;
          return {
            ...r,
            fields: r.fields.map((f) => {
              if (f.apiName !== apiName) return f;
              if (f.mode === mode) return f;
              // Leaving reference mode drops the mapping. With no mapping
              // (linker canceled) the prior literal is restored untouched;
              // with an applied link the stale @{...} is cleared so no
              // invisible dependency lingers.
              if (f.mode === "reference" && mode === "literal") {
                return { ...f, mode, mappingId: null, literal: f.mappingId ? "" : f.literal };
              }
              return { ...f, mode, mappingId: mode === "reference" ? f.mappingId : null };
            }),
          };
        }),
        mappings:
          p.requests
            .find((r) => r.id === requestId)
            ?.fields.find((f) => f.apiName === apiName)?.mode === "reference" && mode !== "reference"
            ? p.mappings.filter(
                (m) =>
                  m.id !==
                  p.requests.find((r) => r.id === requestId)?.fields.find((f) => f.apiName === apiName)?.mappingId
              )
            : p.mappings,
      }));
      touch();
    },
    [touch]
  );

  // ── mapping actions (single source of truth for links) ──

  const handleCreateMapping = useCallback(
    (targetRequestId: string, targetField: string, sourceRequestId: string, sourceProperty: string) => {
      const mappingId = newStudioId("map");
      setDoc((p) => {
        // One active mapping per destination field - replace, never stack.
        const prev = p.requests
          .find((r) => r.id === targetRequestId)
          ?.fields.find((f) => f.apiName === targetField)?.mappingId;
        return {
          ...p,
          mappings: [
            ...p.mappings.filter((m) => m.id !== prev),
            { id: mappingId, sourceRequestId, sourceProperty, targetRequestId, targetFieldApiName: targetField },
          ],
          requests: p.requests.map((r) =>
            r.id === targetRequestId
              ? {
                  ...r,
                  fields: r.fields.map((f) =>
                    f.apiName === targetField ? { ...f, mode: "reference" as const, mappingId } : f
                  ),
                }
              : r
          ),
        };
      });
      touch();
    },
    [touch]
  );

  const handleRemoveMapping = useCallback(
    (mappingId: string, clearValue: boolean) => {
      setDoc((p) => ({
        ...p,
        mappings: p.mappings.filter((m) => m.id !== mappingId),
        requests: p.requests.map((r) => ({
          ...r,
          fields: r.fields.map((f) =>
            f.mappingId === mappingId
              ? { ...f, mode: "literal" as const, mappingId: null, literal: clearValue ? "" : f.literal }
              : f
          ),
        })),
      }));
      touch();
    },
    [touch]
  );

  const handleFixOrder = useCallback(() => {
    const { order, moved } = fixExecutionOrder(doc);
    if (!moved) {
      setOrderNotice("Order is already valid - nothing moved.");
      return;
    }
    const byId = new Map(doc.requests.map((r) => [r.id, r]));
    setDoc((p) => ({ ...p, requests: order.map((id) => byId.get(id)).filter((r): r is StudioRequest => Boolean(r)) }));
    setOrderNotice("Reordered so every source executes before its dependents - independents kept their places.");
    touch();
  }, [doc, touch]);

  const handlePosition = useCallback(
    (id: string, pos: { x: number; y: number }) => {
      setDoc((p) => ({ ...p, requests: p.requests.map((r) => (r.id === id ? { ...r, position: pos } : r)) }));
    },
    []
  );

  const handleResetLayout = useCallback(() => {
    setDoc((p) => ({ ...p, requests: p.requests.map((r) => ({ ...r, position: undefined })) }));
  }, []);

  const gotoRequest = useCallback((id: string) => {
    setSelectedId(id);
    setScreen("requests");
  }, []);

  // ── generate / test / export ──

  const handleGenerate = useCallback(() => {
    setPayload(buildStudioPayload(doc));
    setTestResult(null);
    setTestError(null);
    setScreen("payload");
  }, [doc]);

  const handleSendTest = useCallback(async () => {
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
    if (!payload) return;
    try {
      const response = await apiFetch("/api/salesforce/composite", {
        instanceUrl,
        token,
        apiVersion: doc.apiVersion,
        allOrNone: payload.allOrNone,
        compositeRequest: payload.compositeRequest,
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
  }, [payload, doc.apiVersion, getToken, instanceUrl, onSessionExpired]);

  const handleDownload = useCallback(() => {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "composite"}_payload.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [payload, doc.name]);

  const handleAddToCollection = useCallback(() => {
    if (!payload) return;
    onAddToCollection({
      name: `${doc.name} - ${payload.compositeRequest.length} sub-request${payload.compositeRequest.length === 1 ? "" : "s"}`,
      method: "POST",
      kind: "composite",
      url: compositeEndpoint,
      origin: instanceUrl,
      body: payload,
    });
  }, [payload, doc.name, compositeEndpoint, instanceUrl, onAddToCollection]);

  const actions: StudioRequestActions = {
    onSelect: setSelectedId,
    onAddObject: handleAddObject,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
    onMove: handleMove,
    onUpdateRequest: handleUpdateRequest,
    onDescribeObject: handleDescribeObject,
    onAddFields: handleAddFields,
    onRemoveField: handleRemoveField,
    onSetLiteral: handleSetLiteral,
    onSetMode: handleSetMode,
    onCreateMapping: handleCreateMapping,
    onRemoveMapping: handleRemoveMapping,
  };

  const tabs: { id: "requests" | "graph" | "payload"; label: string }[] = [
    { id: "requests", label: "Requests" },
    { id: "graph", label: `Graph${doc.mappings.length > 0 ? ` · ${doc.mappings.length}` : ""}` },
    { id: "payload", label: "Payload" },
  ];

  return (
    <div className="space-y-4">
      {/* Transaction toolbar */}
      <div className="rounded-xl border border-[#E8E2D8] bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <input
            value={doc.name}
            onChange={(e) => setDoc((p) => ({ ...p, name: e.target.value }))}
            aria-label="Transaction name"
            placeholder="Untitled transaction"
            className="min-w-[140px] flex-1 rounded-lg border border-transparent px-2 py-1 text-[15px] font-semibold text-[#27241F] hover:border-[#E8E2D8] focus:border-[#A98450] focus:outline-none sm:max-w-[260px]"
          />
          <span className="flex items-center gap-1.5 text-[11px] text-[#777168]" title={instanceUrl}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#32815B]" aria-hidden="true" />
            <span className="max-w-[180px] truncate font-mono">{instanceUrl.replace(/^https:\/\//, "")}</span>
          </span>
          <label className="flex items-center gap-1.5 text-[11px] text-[#777168]">
            API
            <select
              value={doc.apiVersion}
              onChange={(e) => {
                setDoc((p) => ({ ...p, apiVersion: e.target.value }));
                touch();
              }}
              className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-1.5 py-1 font-mono text-[11px] text-[#27241F]"
              aria-label="API version"
            >
              {Array.from(new Set([doc.apiVersion, ...API_VERSIONS])).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-[13px] text-[#27241F]">
            <input
              type="checkbox"
              checked={doc.allOrNone}
              onChange={(e) => {
                setDoc((p) => ({ ...p, allOrNone: e.target.checked }));
                touch();
              }}
              className="h-3.5 w-3.5 rounded"
            />
            allOrNone
          </label>
          <span className="font-mono text-[11px] text-[#777168]">
            {doc.requests.length}/25
          </span>
          <button
            onClick={() => setScreen("payload")}
            title="Open validation"
            className={`rounded-lg border px-2 py-1 font-mono text-[11px] cursor-pointer ${
              errCount > 0
                ? "border-red-300 bg-red-50 text-[#B84C42]"
                : warnCount > 0
                  ? "border-amber-300 bg-amber-50 text-[#B98335]"
                  : "border-[#E8E2D8] text-[#32815B]"
            }`}
          >
            {errCount > 0 ? `${errCount} error${errCount === 1 ? "" : "s"}` : warnCount > 0 ? `${warnCount} warning${warnCount === 1 ? "" : "s"}` : "valid"}
          </button>
          <span className="flex-1" />
          <Button size="sm" onClick={handleGenerate} disabled={doc.requests.length === 0}>
            Generate Payload
          </Button>
        </div>
        <div className="mt-2.5 flex border-b border-[#E8E2D8] -mb-3" role="tablist" aria-label="Composite Studio screens">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={screen === t.id}
              onClick={() => setScreen(t.id)}
              className={`px-4 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
                screen === t.id ? "text-[#27241F] underline underline-offset-8 decoration-[#A98450] decoration-2" : "text-[#A39B8E] hover:text-[#27241F]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {screen === "requests" && (
        <StudioRequests
          doc={doc}
          objects={objects}
          describes={describes}
          selectedId={selectedId}
          issues={issues}
          actions={actions}
        />
      )}

      {screen === "graph" && (
        <StudioGraph
          doc={doc}
          issues={issues}
          onEditRequest={gotoRequest}
          onPosition={handlePosition}
          onResetLayout={handleResetLayout}
        />
      )}

      {screen === "payload" && (
        <StudioPayloadView
          doc={doc}
          payload={payload}
          issues={issues}
          compositeEndpoint={compositeEndpoint}
          test={{
            loading: testLoading,
            error: testError,
            result: testResult,
            confirming: showConfirm,
            onAskSend: () => setShowConfirm(true),
            onCancelSend: () => setShowConfirm(false),
            onConfirmSend: handleSendTest,
          }}
          orderNotice={orderNotice}
          onFixOrder={handleFixOrder}
          onGotoRequest={gotoRequest}
          onDownload={handleDownload}
          onAddToCollection={handleAddToCollection}
        />
      )}
    </div>
  );
}
