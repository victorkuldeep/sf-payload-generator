"use client";

import { useState, useMemo, useCallback } from "react";
import type { Node, Edge } from "@xyflow/react";
import type {
  SalesforceObject,
  SalesforceDescribeResult,
} from "@/lib/salesforce/types";
import { buildErdElements, type ErdNodeData } from "@/lib/erd/graph";
import { rankObjects } from "@/lib/search/rank";
import { ErdCanvas } from "./erd/ErdCanvas";
import { EmptyState } from "./EmptyState";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Badge from "./ui/Badge";

interface SchemaPanelProps {
  objects: SalesforceObject[];
  instanceUrl: string;
  apiVersion: string;
  getToken: () => string;
  /** Room mode: fill the parent height instead of a fixed viewport calc. */
  fillHeight?: boolean;
}

const MAX_NODES = 60;
const MAX_NEW_PER_ACTION = 25;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = await Promise.all(items.slice(i, i + limit).map(fn));
    out.push(...chunk);
  }
  return out;
}

export default function SchemaPanel({
  objects,
  instanceUrl,
  apiVersion,
  getToken,
  fillHeight = false,
}: SchemaPanelProps) {
  const [rootSearch, setRootSearch] = useState("");
  const [rootName, setRootName] = useState("");
  const [focusName, setFocusName] = useState("");
  const [describes, setDescribes] = useState<Map<string, SalesforceDescribeResult>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [spot, setSpot] = useState<{ focus: string; related: Set<string> } | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [staged, setStaged] = useState<Set<string>>(new Set());

  const labels = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of objects) m.set(o.name, o.label);
    for (const d of describes.values()) m.set(d.name, d.label);
    return m;
  }, [objects, describes]);

  const filteredObjects = useMemo(
    () => rankObjects(objects, rootSearch, 80),
    [objects, rootSearch]
  );

  const elements: { nodes: Node<ErdNodeData>[]; edges: Edge[] } = useMemo(() => {
    if (describes.size === 0 || !rootName) return { nodes: [], edges: [] };
    const built = buildErdElements(describes, labels, rootName, spot);
    const describedSet = new Set(describes.keys());
    return {
      edges: built.edges,
      nodes: built.nodes.map((n) => {
        const d = describes.get(n.id);
        const shown = (d?.childRelationships ?? []).filter(
          (r) => r.relationshipName && describedSet.has(r.childSObject)
        ).length;
        return { ...n, data: { ...n.data, shownChildren: shown } };
      }),
    };
  }, [describes, labels, rootName, spot]);

  const fetchDescribe = useCallback(
    async (objectName: string): Promise<SalesforceDescribeResult> => {
      const token = getToken();
      if (!token) throw new Error("Session token unavailable. Please reconnect.");
      const response = await fetch("/api/salesforce/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceUrl, token, apiVersion, objectName }),
      });
      const data = (await response.json()) as SalesforceDescribeResult & { error?: string };
      if (!response.ok) {
        throw new Error(
          typeof (data as unknown as { error?: unknown }).error === "string"
            ? (data as unknown as { error: string }).error
            : `Describe failed for ${objectName}`
        );
      }
      return data;
    },
    [instanceUrl, apiVersion, getToken]
  );

  const mergeDescribes = useCallback((fresh: SalesforceDescribeResult[]) => {
    if (fresh.length === 0) return;
    setDescribes((prev) => {
      const next = new Map(prev);
      for (const d of fresh) next.set(d.name, d);
      return next;
    });
  }, []);

  const undiscoveredChildren = useCallback(
    (ofName: string, known: Map<string, SalesforceDescribeResult>): string[] => {
      const d = known.get(ofName);
      if (!d) return [];
      const out: string[] = [];
      for (const r of d.childRelationships ?? []) {
        if (!r.relationshipName) continue;
        if (!known.has(r.childSObject) && !out.includes(r.childSObject)) {
          out.push(r.childSObject);
        }
      }
      return out;
    },
    []
  );

  const toggleStage = useCallback((apiName: string) => {
    setStaged((prev) => {
      const next = new Set(prev);
      if (next.has(apiName)) next.delete(apiName);
      else next.add(apiName);
      return next;
    });
  }, []);

  const applyStaged = useCallback(async () => {
    if (staged.size === 0 || busy) return;
    const names = [...staged].filter((n) => !describes.has(n));
    if (names.length === 0) {
      // Everything staged is already on canvas — just focus the first
      const first = [...staged][0];
      setFocusName(first);
      setStaged(new Set());
      setRootSearch("");
      setNotice(`${first} is already on the canvas — focused.`);
      return;
    }
    if (describes.size + names.length > MAX_NODES) {
      setNotice(`Canvas cap is ${MAX_NODES} objects — adding ${names.length} would exceed it. Remove some nodes first.`);
      return;
    }
    setError(null);
    setNotice(null);
    setSpot(null);
    setBusy(`Adding ${names.length} object${names.length === 1 ? "" : "s"} to canvas…`);
    try {
      const fresh = await mapLimit(names, 6, fetchDescribe);
      mergeDescribes(fresh);
      if (describes.size === 0 && fresh.length > 0) {
        setRootName(fresh[0].name);
      }
      setFocusName(fresh[fresh.length - 1]?.name ?? rootName);
      setStaged(new Set());
      setRootSearch("");
      setNotice(
        fresh.length === 1
          ? `${fresh[0].name} added — links to objects already on canvas draw automatically.`
          : `${fresh.length} objects added — links draw automatically where both ends are present.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add objects");
    } finally {
      setBusy(null);
    }
  }, [staged, describes, busy, rootName, fetchDescribe, mergeDescribes]);

  const discoverChildren = useCallback(async () => {
    const target = focusName || rootName;
    if (!target || busy) return;
    const kids = undiscoveredChildren(target, describes).slice(0, MAX_NEW_PER_ACTION);
    if (kids.length === 0) {
      setNotice(`No undiscovered children on ${target}.`);
      return;
    }
    if (describes.size + kids.length > MAX_NODES) {
      setNotice(`Canvas cap is ${MAX_NODES} objects — remove some nodes or reset first.`);
      return;
    }
    setError(null);
    setNotice(null);
    setSpot(null);
    setBusy(`Discovering ${kids.length} child objects of ${target}…`);
    try {
      const fresh = await mapLimit(kids, 6, fetchDescribe);
      mergeDescribes(fresh);
      setNotice(`Added ${fresh.length} children of ${target}. Select any node to go deeper.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setBusy(null);
    }
  }, [focusName, rootName, busy, undiscoveredChildren, describes, fetchDescribe, mergeDescribes]);

  const discoverFull = useCallback(async () => {
    if (!rootName || busy) return;
    setError(null);
    setNotice(null);
    setSpot(null);
    setBusy("Discovering full data model…");
    try {
      const known = new Map(describes);
      for (let depth = 0; depth < 3; depth++) {
        const frontier: string[] = [];
        for (const name of known.keys()) {
          for (const kid of undiscoveredChildren(name, known)) {
            if (!frontier.includes(kid)) frontier.push(kid);
          }
        }
        const room = MAX_NODES - known.size;
        if (frontier.length === 0 || room <= 0) break;
        const batch = frontier.slice(0, Math.min(room, MAX_NEW_PER_ACTION));
        setBusy(`Discovering level ${depth + 2} — ${batch.length} objects…`);
        const fresh = await mapLimit(batch, 6, fetchDescribe);
        for (const d of fresh) known.set(d.name, d);
        setDescribes(new Map(known));
      }
      setNotice(`Mapped ${known.size} objects. Junctions are badged automatically.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Full discovery failed");
    } finally {
      setBusy(null);
    }
  }, [rootName, busy, undiscoveredChildren, describes, fetchDescribe]);

  const showParents = useCallback(async () => {
    const target = focusName || rootName;
    if (!target || busy) return;
    const d = describes.get(target);
    if (!d) return;
    const allParents = [...new Set((d.fields ?? []).flatMap((f) => f.referenceTo ?? []))];
    const missing = allParents.filter((t) => !describes.has(t)).slice(0, 15);
    setError(null);
    setNotice(null);
    try {
      if (missing.length > 0) {
        setBusy(`Loading ${missing.length} parent objects of ${target}…`);
        const fresh = await mapLimit(missing, 6, fetchDescribe);
        mergeDescribes(fresh);
      }
      const onCanvas = allParents.filter((t) => t === target || describes.has(t) || missing.includes(t));
      setSpot({ focus: target, related: new Set(onCanvas) });
      setNotice(
        onCanvas.length > 0
          ? `${target} is ringed — ${onCanvas.length} parent${onCanvas.length === 1 ? "" : "s"} highlighted. Click empty canvas to clear.`
          : `${target} has no lookup parents to highlight.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load parents");
    } finally {
      setBusy(null);
    }
  }, [focusName, rootName, busy, describes, fetchDescribe, mergeDescribes]);

  const removeNode = useCallback(() => {
    const target = focusName;
    if (!target || target === rootName) return;
    setSpot(null);
    setDescribes((prev) => {
      const next = new Map(prev);
      next.delete(target);
      return next;
    });
    setFocusName(rootName);
  }, [focusName, rootName]);

  const resetAll = useCallback(() => {
    if (describes.size === 0) return;
    // Non-destructive: re-run auto-layout + re-fit, keep every node.
    setSpot(null);
    setNotice(null);
    setError(null);
    setDescribes(new Map(describes));
    setNotice("Layout refreshed — nodes re-arranged, nothing removed.");
  }, [describes]);

  const [confirmClear, setConfirmClear] = useState(false);

  const clearCanvas = useCallback(() => {
    setDescribes(new Map());
    setRootName("");
    setFocusName("");
    setSpot(null);
    setNotice(null);
    setError(null);
    setConfirmClear(false);
  }, []);

  const handleNodeClick = useCallback((id: string) => {
    setFocusName(id);
    setSpot(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSpot(null);
  }, []);

  const handleFocusChange = useCallback((id: string) => {
    setFocusName(id);
    setSpot(null);
  }, []);

  // Pop-out handoff: fresh tabs don't inherit sessionStorage, so serve the
  // live session over a same-origin BroadcastChannel (memory only, one-shot,
  // nonce-matched — the token never touches disk or the URL).
  const popOut = useCallback(() => {
    const token = getToken();
    if (!token) {
      setError("Session expired — reconnect in the studio first, then pop out.");
      return;
    }
    const nonce =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.open(`/schema?handoff=${nonce}`, "_blank", "noopener");
    try {
      const bc = new BroadcastChannel("sf-schema-handoff");
      const payload = { instanceUrl, apiVersion, token };
      const timer = window.setTimeout(() => bc.close(), 15000);
      bc.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as { type?: string; nonce?: string } | null;
        if (msg?.type === "schema-room-ready" && msg.nonce === nonce) {
          bc.postMessage({ type: "schema-room-session", nonce, session: payload });
          window.clearTimeout(timer);
          bc.close();
        }
      };
    } catch {
      /* BroadcastChannel unavailable — room falls back to its own Connect */
    }
  }, [getToken, instanceUrl, apiVersion]);

  const focusOptions = [...describes.keys()].sort();

  return (
    <div
      className="flex gap-3"
      style={fillHeight ? { height: "100%", minHeight: 0 } : { height: "calc(100vh - 300px)", minHeight: 520 }}
    >
      {/* ── Collapsible explorer sidebar ── */}
      {sideOpen ? (
        <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-2 border-b border-[var(--color-line-soft)] px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-bold text-ivory-950">Schema Explorer</h2>
              <p className="text-[10px] text-ivory-600">
                {describes.size > 0 ? `${describes.size} on canvas` : "Pick a root object"}
              </p>
            </div>
            <Badge variant="info">ERD</Badge>
            <button
              type="button"
              onClick={popOut}
              aria-label="Open schema room in a new tab"
              title="Pop out to a full-screen schema room (new tab, chrome-free canvas)"
              className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M14 4h6v6M20 4 11 13M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setSideOpen(false)}
              aria-label="Collapse explorer panel"
              title="Collapse panel"
              className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="m14 6-6 6 6 6" />
              </svg>
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3.5">
            <div>
              <Input
                placeholder="Add object — try Account…"
                value={rootSearch}
                onChange={(e) => setRootSearch(e.target.value)}
                aria-label="Choose root object for ERD"
              />
              {rootSearch.trim() && (
                <div className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line-soft)]" role="group" aria-label="Matching objects — check to stage">
                  {filteredObjects.length === 0 ? (
                    <p className="p-3 text-xs text-ivory-600">No objects match.</p>
                  ) : (
                    filteredObjects.map((o) => {
                      const onCanvas = describes.has(o.name);
                      const checked = onCanvas || staged.has(o.name);
                      return (
                        <label
                          key={o.name}
                          className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-ivory-300 ${
                            checked ? "bg-ivory-200" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={onCanvas}
                            onChange={() => toggleStage(o.name)}
                            className="h-4 w-4 shrink-0 rounded border-ivory-400 bg-white text-bronze-600 focus:ring-bronze-500 disabled:opacity-60"
                            aria-label={onCanvas ? `${o.label} (already on canvas)` : `Stage ${o.label}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-ivory-950">{o.label}</span>
                            <span className="block truncate text-[11px] font-mono text-ivory-600">{o.name}</span>
                          </span>
                          {onCanvas && (
                            <span className="shrink-0 rounded border border-bronze-300 bg-bronze-100 px-1 py-px text-[9px] font-semibold text-bronze-700">
                              On canvas
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              )}
              {staged.size > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--color-accent-soft)] bg-[var(--color-accent-bg)] px-3 py-2">
                  <span className="flex-1 text-[11px] font-medium text-ivory-900">
                    {staged.size} staged
                  </span>
                  <button
                    type="button"
                    onClick={() => setStaged(new Set())}
                    className="text-[11px] text-ivory-600 hover:text-ivory-950 underline cursor-pointer"
                  >
                    Clear
                  </button>
                  <Button size="sm" onClick={applyStaged} disabled={!!busy} loading={!!busy}>
                    Add to canvas
                  </Button>
                </div>
              )}
            </div>

            {rootName && (
              <>
                <label className="block text-xs font-medium text-ivory-700">
                  Focus node
                  <select
                    value={focusName}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleFocusChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs font-medium text-ivory-950 focus:outline-none focus:border-bronze-500 cursor-pointer"
                    aria-label="Focused object"
                  >
                    {focusOptions.map((n) => (
                      <option key={n} value={n}>{labels.get(n) ?? n} ({n})</option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-1 gap-1.5">
                  <Button size="sm" variant="secondary" onClick={discoverChildren} disabled={!!busy} title="Expand one level under the focused node">
                    Discover children
                  </Button>
                  <Button size="sm" variant="secondary" onClick={showParents} disabled={!!busy} title="Ring the focused node and highlight its lookup parents">
                    Show parents
                  </Button>
                  <Button size="sm" onClick={discoverFull} disabled={!!busy} loading={!!busy} title="Auto-map the whole data model up to 3 levels deep">
                    Discover full
                  </Button>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={removeNode} disabled={!focusName || focusName === rootName || !!busy} className="flex-1" title="Remove the focused object from the canvas">
                      Remove
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetAll} disabled={describes.size === 0 || !!busy} className="flex-1" title="Re-run auto-layout and re-fit — keeps every node">
                      Reset view
                    </Button>
                  </div>
                  {confirmClear ? (
                    <span className="flex items-center gap-2 text-[11px] text-ivory-700">
                      Empty the whole canvas?
                      <button type="button" onClick={clearCanvas} className="font-semibold text-red-700 underline cursor-pointer">
                        Yes, clear
                      </button>
                      <button type="button" onClick={() => setConfirmClear(false)} className="underline cursor-pointer">
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClear(true)}
                      disabled={describes.size === 0}
                      className="text-[11px] text-ivory-600 hover:text-red-700 underline cursor-pointer disabled:opacity-40"
                    >
                      Clear canvas
                    </button>
                  )}
                </div>
              </>
            )}

            {busy && <p className="text-xs text-bronze-600" role="status">{busy}</p>}
            {error && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                {error}
              </div>
            )}
            {notice && <p className="text-[11px] leading-relaxed text-ivory-700">{notice}</p>}

            <div className="rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)] p-2.5 text-[10px] leading-relaxed text-ivory-600">
              <p className="font-semibold text-ivory-900 mb-1">Legend</p>
              <p><strong className="text-ivory-950">Key</strong> = Id / Name · <strong className="text-bronze-600">Link</strong> = lookup</p>
              <p><strong className="text-red-600">*</strong> = required · <strong className="text-bronze-700">JUNCTION</strong> = 2+ required lookups (audit fields excluded)</p>
              <p>Joins: parent header-right → child footer-left · click a line to reveal its lookup field · <strong className="text-bronze-600">link icon</strong> = lookup field · drag nodes to rearrange</p>
            </div>
          </div>
        </aside>
      ) : (
        <div className="flex w-11 shrink-0 flex-col items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] py-3">
          <button
            type="button"
            onClick={() => setSideOpen(true)}
            aria-label="Expand explorer panel"
            title="Expand explorer panel"
            className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="m10 6 6 6-6 6" />
            </svg>
          </button>
          <span className="text-[10px] font-bold text-ivory-500" style={{ writingMode: "vertical-rl" }}>
            {describes.size > 0 ? `${describes.size} objects` : "Explorer"}
          </span>
        </div>
      )}

      {/* ── Full-height canvas ── */}
      <div className="min-w-0 flex-1 min-h-0">
        {!rootName || describes.size === 0 ? (
          <div className={`flex items-center justify-center rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-6 ${fillHeight ? "h-full" : "h-full min-h-[420px]"}`}>
            <EmptyState
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  <path d="M10 6.5h5.5a2 2 0 0 1 2 2V14M14 17.5H8.5a2 2 0 0 1-2-2V10" />
                </svg>
              }
              title="Pick an object to map its data model"
              description="Search the explorer panel — the object lands on the infinite canvas as an ERD table. Discover children level by level, go full-depth, present with the laser, export hi-res PNG."
            />
          </div>
        ) : (
          <ErdCanvas
            nodes={elements.nodes}
            edges={elements.edges}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
          />
        )}
      </div>
    </div>
  );
}
