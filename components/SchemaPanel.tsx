"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Node, Edge } from "@xyflow/react";
import type {
  SalesforceObject,
  SalesforceDescribeResult,
} from "@/lib/salesforce/types";
import { buildErdElements, buildGraphElements, rootNeighbors, type ErdNodeData } from "@/lib/erd/graph";
import { rankObjects } from "@/lib/search/rank";
import { isSessionExpiredMessage } from "@/lib/salesforce/client";
import { apiFetch } from "@/lib/api";
import { ErdCanvas, type ErdCanvasHandle } from "./erd/ErdCanvas";
import { DiscoverPicker, type DiscoverCandidate } from "./erd/DiscoverPicker";
import { PicklistPopover, type PicklistPopoverData } from "./erd/PicklistPopover";
import {
  listSnapshotsByOrg,
  saveSnapshot as persistSnapshot,
  deleteSnapshot as deleteSnapshotFromDb,
  renameSnapshot as renameSnapshotInDb,
  type ErdSnapshot,
} from "@/lib/erd/snapshotDb";
import { newItemId } from "@/lib/collection/types";
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
  onSessionExpired?: () => void;
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

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type GraphDetail =
  | {
      kind: "loaded";
      d: SalesforceDescribeResult;
      parents: string[];
      kids: string[];
    }
  | {
      kind: "lite";
      n: {
        apiName: string;
        label: string;
        custom: boolean;
        role: "parent" | "child";
        via: string;
        kind: "md" | "lookup";
      };
    };

function GraphDetailCard({
  detail,
  labels,
  onClose,
  onOpenInErd,
  onMakeRoot,
  onLoad,
}: {
  detail: GraphDetail;
  labels: Map<string, string>;
  onClose: () => void;
  onOpenInErd: () => void;
  onMakeRoot: () => void;
  onLoad: () => void;
}) {
  const apiName = detail.kind === "loaded" ? detail.d.name : detail.n.apiName;
  const label = detail.kind === "loaded" ? detail.d.label : detail.n.label;
  return (
    <div className="absolute right-3 top-3 bottom-3 z-30 w-[280px] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_16px_48px_-12px_rgba(24,20,12,0.35)]">
      <div className="border-b border-[var(--color-line-soft)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[1.6px] text-[var(--color-accent-dark)]">
              {detail.kind === "loaded" ? "On canvas" : `Preview · ${detail.n.role}`}
            </p>
            <h3 className="mt-1 text-xl font-bold tracking-tight text-ivory-950">{label}</h3>
            <p className="truncate font-mono text-[11px] text-ivory-600">{apiName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-md p-1 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {detail.kind === "loaded" ? (
            <>
              <Badge variant="default">{detail.d.fields.length} fields</Badge>
              <Badge variant="default">
                {detail.d.childRelationships.filter((r) => r.relationshipName).length} children
              </Badge>
              {detail.d.custom && <Badge variant="info">Custom</Badge>}
            </>
          ) : (
            <>
              <Badge variant={detail.n.role === "parent" ? "default" : "info"}>{detail.n.role}</Badge>
              <Badge variant={detail.n.kind === "md" ? "custom" : "default"}>
                {detail.n.kind === "md" ? "master-detail" : "lookup"}
              </Badge>
              <Badge variant="default">via {detail.n.via}</Badge>
            </>
          )}
        </div>
      </div>

      {detail.kind === "loaded" && (
        <div className="space-y-3 p-4">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[1.6px] text-ivory-600">
              Connected edges ({detail.parents.length + detail.kids.length})
            </p>
            <ul className="space-y-1">
              {detail.parents.map((p) => (
                <li key={`p:${p}`} className="truncate rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-2.5 py-1.5 font-mono text-[11px] text-ivory-800">
                  ↑ {labels.get(p) ?? p} <span className="text-ivory-500">({p})</span>
                </li>
              ))}
              {detail.kids.map((k) => (
                <li key={`c:${k}`} className="truncate rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-2.5 py-1.5 font-mono text-[11px] text-ivory-800">
                  ↓ {labels.get(k) ?? k} <span className="text-ivory-500">({k})</span>
                </li>
              ))}
              {detail.parents.length === 0 && detail.kids.length === 0 && (
                <li className="text-[11px] text-ivory-500">No described links yet.</li>
              )}
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <Button size="sm" variant="secondary" onClick={onOpenInErd}>
              Open in ERD
            </Button>
            <Button size="sm" variant="ghost" onClick={onMakeRoot}>
              Make graph root
            </Button>
          </div>
        </div>
      )}

      {detail.kind === "lite" && (
        <div className="space-y-3 p-4">
          <p className="text-xs leading-relaxed text-ivory-700">
            Placed from relationship metadata - its fields are not fetched yet.
            Related to the root via <span className="font-mono font-semibold text-ivory-950">{detail.n.via}</span>.
          </p>
          <Button size="sm" onClick={onLoad} className="w-full">
            Fetch details
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SchemaPanel({
  objects,
  instanceUrl,
  apiVersion,
  getToken,
  fillHeight = false,
  onSessionExpired,
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
  // Refresh + popover + snapshot state
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<PicklistPopoverData | null>(null);
  const [layoutRev, setLayoutRev] = useState(0);
  const [enforced, setEnforced] = useState<Map<string, { x: number; y: number }> | null>(null);
  const canvasRef = useRef<ErdCanvasHandle | null>(null);
  const [snapshots, setSnapshots] = useState<ErdSnapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Graph view + filters + detail
  const [view, setView] = useState<"erd" | "graph">("erd");
  const [filterMode, setFilterMode] = useState<"all" | "standard" | "custom" | "manual">("all");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [manageChecked, setManageChecked] = useState<Set<string>>(new Set());
  const [hideSystem, setHideSystem] = useState(false);
  const [graphSelected, setGraphSelected] = useState<string | null>(null);
  const [picker, setPicker] = useState<{
    mode: "children" | "parents";
    title: string;
    subtitle: string;
    candidates: DiscoverCandidate[];
  } | null>(null);

  const SYSTEM_OBJECTS = useMemo(
    () => new Set(["User", "RecordType", "Organization", "Profile"]),
    []
  );

  const customSet = useMemo(() => {
    const s = new Set<string>();
    for (const o of objects) if (o.custom) s.add(o.name);
    return s;
  }, [objects]);

  const isCustomName = useCallback(
    (apiName: string) => customSet.has(apiName) || apiName.endsWith("__c"),
    [customSet]
  );

  // Visible describes: filters hide without deleting (manual eyes, std/custom, system)
  const visibleDescribes = useMemo(() => {
    const out = new Map<string, SalesforceDescribeResult>();
    for (const [name, d] of describes) {
      if (name === rootName) {
        out.set(name, d);
        continue;
      }
      if (hideSystem && SYSTEM_OBJECTS.has(name)) continue;
      if (filterMode === "standard" && isCustomName(name)) continue;
      if (filterMode === "custom" && !isCustomName(name)) continue;
      if (filterMode === "manual" && hiddenIds.has(name)) continue;
      out.set(name, d);
    }
    return out;
  }, [describes, rootName, hideSystem, filterMode, hiddenIds, isCustomName, SYSTEM_OBJECTS]);

  const orgDomain = useMemo(() => {
    try {
      return new URL(instanceUrl).hostname;
    } catch {
      return "";
    }
  }, [instanceUrl]);

  useEffect(() => {
    if (!orgDomain) {
      setSnapshots([]);
      return;
    }
    listSnapshotsByOrg(orgDomain)
      .then(setSnapshots)
      .catch(() => setSnapshots([]));
  }, [orgDomain]);

  // Popover values come from live describes - drop it if metadata changes underneath
  useEffect(() => {
    setPopover(null);
  }, [describes]);

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

  const baseElements: { nodes: Node<ErdNodeData>[]; edges: Edge[] } = useMemo(() => {
    if (visibleDescribes.size === 0 || !rootName) return { nodes: [], edges: [] };
    const built = buildErdElements(visibleDescribes, labels, rootName, spot, enforced);
    const describedSet = new Set(visibleDescribes.keys());
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
  }, [visibleDescribes, describes, labels, rootName, spot, enforced]);

  // Radial graph elements (built from the same cache + visibility rules)
  const graphElements = useMemo(() => {
    if (view !== "graph" || !rootName) return { nodes: [], edges: [], overflow: 0 };
    const root = describes.get(rootName);
    if (!root) return { nodes: [], edges: [], overflow: 0 };
    const neighbors = rootNeighbors(root, labels, isCustomName).filter((n) => {
      if (hideSystem && SYSTEM_OBJECTS.has(n.apiName)) return false;
      if (filterMode === "standard" && n.custom) return false;
      if (filterMode === "custom" && !n.custom) return false;
      if (filterMode === "manual" && hiddenIds.has(n.apiName)) return false;
      return true;
    });
    return buildGraphElements(root, neighbors, new Set(describes.keys()), spot, enforced);
  }, [view, rootName, describes, labels, isCustomName, hideSystem, SYSTEM_OBJECTS, filterMode, hiddenIds, spot, enforced]);

  const neighborMap = useMemo(() => {
    const root = describes.get(rootName);
    if (!root) return new Map<string, ReturnType<typeof rootNeighbors>[number]>();
    const m = new Map<string, ReturnType<typeof rootNeighbors>[number]>();
    for (const n of rootNeighbors(root, labels, isCustomName)) m.set(n.apiName, n);
    return m;
  }, [describes, rootName, labels, isCustomName]);

  const detail = useMemo(() => {
    if (!graphSelected || view !== "graph") return null;
    const d = describes.get(graphSelected);
    if (d) {
      const parents = [...new Set((d.fields ?? []).flatMap((f) => f.referenceTo ?? []))];
      const kids = [
        ...new Set(
          (d.childRelationships ?? [])
            .filter((r) => r.relationshipName)
            .map((r) => r.childSObject)
        ),
      ];
      return { kind: "loaded" as const, d, parents, kids };
    }
    const n = neighborMap.get(graphSelected);
    if (!n) return null;
    return { kind: "lite" as const, n };
  }, [graphSelected, view, describes, neighborMap]);

  const fetchDescribe = useCallback(
    async (objectName: string): Promise<SalesforceDescribeResult> => {
      const token = getToken();
      if (!token) throw new Error("Session token unavailable. Please reconnect.");
      const response = await apiFetch("/api/salesforce/describe", { instanceUrl, token, apiVersion, objectName });
      const data = (await response.json()) as SalesforceDescribeResult & { error?: string };
      if (!response.ok) {
        const message =
          typeof (data as unknown as { error?: unknown }).error === "string"
            ? (data as unknown as { error: string }).error
            : `Describe failed for ${objectName}`;
        if (isSessionExpiredMessage(message)) onSessionExpired?.();
        throw new Error(message);
      }
      return data;
    },
    [instanceUrl, apiVersion, getToken, onSessionExpired]
  );

  const mergeDescribes = useCallback((fresh: SalesforceDescribeResult[]) => {
    if (fresh.length === 0) return;
    setDescribes((prev) => {
      const next = new Map(prev);
      for (const d of fresh) next.set(d.name, d);
      return next;
    });
  }, []);

  const refreshNode = useCallback(
    async (id: string) => {
      if (busy) return;
      setRefreshingIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setError(null);
      try {
        const fresh = await fetchDescribe(id);
        mergeDescribes([fresh]);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Refresh failed for ${id}`);
      } finally {
        setRefreshingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [busy, fetchDescribe, mergeDescribes]
  );

  const openPicklist = useCallback(
    (
      nodeId: string,
      fieldName: string,
      anchor: { x: number; y: number; width: number; height: number }
    ) => {
      const d = describes.get(nodeId);
      const f = d?.fields.find((fl) => fl.name === fieldName);
      if (!f) return;
      setPopover({
        apiName: nodeId,
        nodeLabel: d?.label ?? nodeId,
        fieldName,
        fieldType: f.type,
        values: (f.picklistValues ?? []).slice(0, 100).map((p) => ({
          label: p.label ?? p.value,
          value: p.value,
          active: p.active !== false,
          isDefault: !!p.defaultValue,
        })),
        x: anchor.x,
        y: anchor.y,
      });
    },
    [describes]
  );

  // Attach live callbacks + refresh spinners on top of the base elements
  const elements: { nodes: Node<ErdNodeData>[]; edges: Edge[] } = useMemo(
    () => ({
      edges: baseElements.edges,
      nodes: baseElements.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          refreshing: refreshingIds.has(n.id),
          onRefreshNode: refreshNode,
          onPicklistClick: openPicklist,
        },
      })),
    }),
    [baseElements, refreshingIds, refreshNode, openPicklist]
  );

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

  // Pin live drag positions so growth actions keep the user's arrangement
  // (fresh nodes still take dagre-planned spots). Reset view clears the pins.
  // Prefixed graph ids (p:X) are ALSO stored stripped (X) so a position
  // survives the trip back to the ERD view instead of colliding there.
  const pinCurrentLayout = useCallback(() => {
    const live = canvasRef.current?.getNodes() ?? [];
    if (live.length === 0) return;
    setEnforced((prev) => {
      const next = new Map(prev ?? []);
      for (const n of live) {
        next.set(n.id, { ...n.position });
        if (n.id.includes(":")) {
          next.set(n.id.split(":").slice(1).join(":"), { ...n.position });
        }
      }
      return next;
    });
  }, []);

  const handleNodeDragStop = useCallback((id: string, position: { x: number; y: number }) => {
    setEnforced((prev) => {
      const next = new Map(prev ?? []);
      next.set(id, { ...position });
      return next;
    });
  }, []);

  const pruneEnforced = useCallback((ids: Set<string>) => {
    setEnforced((prev) => {
      if (!prev) return prev;
      const next = new Map(prev);
      for (const id of ids) {
        next.delete(id);
        for (const k of [...next.keys()]) {
          if (k.endsWith(`:${id}`)) next.delete(k);
        }
      }
      return next;
    });
  }, []);

  // Shared add-pipeline: fetch, merge, pin layout, bump revision
  const addNames = useCallback(
    async (names: string[]): Promise<SalesforceDescribeResult[]> => {
      const fresh = await mapLimit(names, 6, fetchDescribe);
      mergeDescribes(fresh);
      pinCurrentLayout();
      setLayoutRev((r) => r + 1);
      return fresh;
    },
    [fetchDescribe, mergeDescribes, pinCurrentLayout]
  );

  const applyStaged = useCallback(async () => {
    if (staged.size === 0 || busy) return;
    const names = [...staged].filter((n) => !describes.has(n));
    if (names.length === 0) {
      // Everything staged is already on canvas - just focus the first
      const first = [...staged][0];
      setFocusName(first);
      setStaged(new Set());
      setRootSearch("");
      setNotice(`${first} is already on the canvas - focused.`);
      return;
    }
    if (describes.size + names.length > MAX_NODES) {
      setNotice(`Canvas cap is ${MAX_NODES} objects - adding ${names.length} would exceed it. Remove some nodes first.`);
      return;
    }
    setError(null);
    setNotice(null);
    setSpot(null);
    setBusy(`Adding ${names.length} object${names.length === 1 ? "" : "s"} to canvas…`);
    try {
      const fresh = await addNames(names);
      if (describes.size === 0 && fresh.length > 0) {
        setRootName(fresh[0].name);
      }
      setFocusName(fresh[fresh.length - 1]?.name ?? rootName);
      setStaged(new Set());
      setRootSearch("");
      setNotice(
        fresh.length === 1
          ? `${fresh[0].name} added - links to objects already on canvas draw automatically.`
          : `${fresh.length} objects added - links draw automatically where both ends are present.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add objects");
    } finally {
      setBusy(null);
    }
  }, [staged, describes, busy, rootName, addNames]);

  const refreshAll = useCallback(async () => {
    if (busy || describes.size === 0) return;
    const ids = [...describes.keys()];
    const before = new Map<string, Set<string>>();
    for (const [k, d] of describes) before.set(k, new Set(d.fields.map((f) => f.name)));
    setError(null);
    setNotice(null);
    setSpot(null);
    setPopover(null);
    setBusy(`Refreshing ${ids.length} object${ids.length === 1 ? "" : "s"}…`);
    try {
      const fresh = await mapLimit(ids, 6, fetchDescribe);
      mergeDescribes(fresh);
      const parts: string[] = [];
      for (const d of fresh) {
        const old = before.get(d.name) ?? new Set<string>();
        const now = new Set(d.fields.map((f) => f.name));
        const added = [...now].filter((x) => !old.has(x));
        const removed = [...old].filter((x) => !now.has(x));
        if (added.length > 0 || removed.length > 0) {
          const bits: string[] = [];
          if (added.length > 0) {
            bits.push(`+${added.length} (${added.slice(0, 3).join(", ")}${added.length > 3 ? "…" : ""})`);
          }
          if (removed.length > 0) {
            bits.push(`−${removed.length} (${removed.slice(0, 3).join(", ")}${removed.length > 3 ? "…" : ""})`);
          }
          parts.push(`${d.name} ${bits.join(" ")}`);
        }
      }
      setNotice(
        parts.length > 0
          ? `Refreshed ${fresh.length} · ` + parts.slice(0, 4).join(" · ") + (parts.length > 4 ? ` · +${parts.length - 4} more` : "")
          : `Refreshed ${fresh.length} object${fresh.length === 1 ? "" : "s"} - no field changes.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(null);
    }
  }, [busy, describes, fetchDescribe, mergeDescribes]);

  const saveSnapshot = useCallback(async () => {
    if (busy || describes.size === 0 || !orgDomain) return;
    const live = canvasRef.current?.getNodes() ?? [];
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of live) positions[n.id] = { ...n.position };
    const label = labels.get(rootName) ?? rootName;
    const now = Date.now();
    const snap: ErdSnapshot = {
      id: newItemId(),
      orgDomain,
      name: describes.size > 1 ? `${label} +${describes.size - 1}` : label,
      createdAt: now,
      root: rootName,
      focus: focusName || rootName,
      nodes: [...describes.keys()],
      positions,
    };
    try {
      await persistSnapshot(snap);
      setSnapshots(await listSnapshotsByOrg(orgDomain));
      setNotice(`Snapshot “${snap.name}” saved - restore it anytime from history.`);
    } catch {
      setError("Couldn't save snapshot (IndexedDB unavailable).");
    }
  }, [busy, describes, orgDomain, rootName, focusName, labels]);

  const restoreSnapshot = useCallback(
    async (snap: ErdSnapshot) => {
      if (busy) return;
      setShowHistory(false);
      setError(null);
      setNotice(null);
      setSpot(null);
      setPopover(null);
      setBusy(`Restoring “${snap.name}” with fresh metadata…`);
      try {
        const results = await mapLimit(snap.nodes, 6, async (n) => {
          try {
            return await fetchDescribe(n);
          } catch {
            return null;
          }
        });
        const fresh = results.filter((d): d is SalesforceDescribeResult => d !== null);
        if (fresh.length === 0) {
          throw new Error("None of the snapshotted objects could be described - org changed or session expired.");
        }
        setDescribes(new Map(fresh.map((d) => [d.name, d] as const)));
        const root = fresh.some((d) => d.name === snap.root) ? snap.root : fresh[0].name;
        setRootName(root);
        setFocusName(fresh.some((d) => d.name === snap.focus) ? snap.focus : root);
        setEnforced(new Map(Object.entries(snap.positions)));
        setLayoutRev((r) => r + 1);
        const skipped = snap.nodes.length - fresh.length;
        setNotice(
          `Restored “${snap.name}” with fresh metadata (${fresh.length} objects)` +
            (skipped > 0 ? `, ${skipped} no longer describable` : "") +
            "."
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Restore failed");
      } finally {
        setBusy(null);
      }
    },
    [busy, fetchDescribe]
  );

  const deleteSnapshot = useCallback(
    async (id: string) => {
      try {
        await deleteSnapshotFromDb(id);
        setSnapshots(await listSnapshotsByOrg(orgDomain));
      } catch {
        /* ignore */
      }
    },
    [orgDomain]
  );

  const renameSnapshot = useCallback(
    async (id: string, name: string) => {
      const clean = name.trim();
      if (!clean) return;
      try {
        await renameSnapshotInDb(id, clean);
        setSnapshots(await listSnapshotsByOrg(orgDomain));
      } catch {
        /* ignore */
      }
      setRenamingId(null);
    },
    [orgDomain]
  );

  const discoverChildren = useCallback(() => {
    const target = focusName || rootName;
    if (!target || busy) return;
    const d = describes.get(target);
    if (!d) return;
    const seen = new Set<string>();
    const candidates: DiscoverCandidate[] = [];
    for (const r of d.childRelationships ?? []) {
      if (!r.relationshipName || seen.has(r.childSObject)) continue;
      seen.add(r.childSObject);
      candidates.push({
        apiName: r.childSObject,
        label: labels.get(r.childSObject) ?? r.childSObject,
        custom: isCustomName(r.childSObject),
        group: "child",
        via: r.relationshipName,
        kind: r.cascadeDelete === true ? "md" : "lookup",
        onCanvas: describes.has(r.childSObject),
        system: SYSTEM_OBJECTS.has(r.childSObject),
      });
    }
    if (candidates.length === 0) {
      setNotice(`No child relationships on ${target}.`);
      return;
    }
    setPicker({
      mode: "children",
      title: `Discover children of ${target}`,
      subtitle: `${candidates.length} related objects - tick what joins the canvas`,
      candidates,
    });
  }, [focusName, rootName, busy, describes, labels, isCustomName, SYSTEM_OBJECTS]);

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
        setBusy(`Discovering level ${depth + 2} - ${batch.length} objects…`);
        const fresh = await mapLimit(batch, 6, fetchDescribe);
        for (const d of fresh) known.set(d.name, d);
        setDescribes(new Map(known));
        pinCurrentLayout();
        setLayoutRev((r) => r + 1);
      }
      setNotice(`Mapped ${known.size} objects. Junctions are badged automatically.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Full discovery failed");
    } finally {
      setBusy(null);
    }
  }, [rootName, busy, undiscoveredChildren, describes, fetchDescribe, pinCurrentLayout]);

  const showParents = useCallback(() => {
    const target = focusName || rootName;
    if (!target || busy) return;
    const d = describes.get(target);
    if (!d) return;
    const seen = new Set<string>();
    const candidates: DiscoverCandidate[] = [];
    for (const f of d.fields ?? []) {
      if (f.type !== "reference") continue;
      for (const t of f.referenceTo ?? []) {
        if (t === target || seen.has(t)) continue;
        seen.add(t);
        candidates.push({
          apiName: t,
          label: labels.get(t) ?? t,
          custom: isCustomName(t),
          group: "parent",
          via: f.name,
          kind: "lookup",
          onCanvas: describes.has(t),
          system: SYSTEM_OBJECTS.has(t),
        });
      }
    }
    if (candidates.length === 0) {
      setNotice(`${target} has no lookup parents.`);
      return;
    }
    setPicker({
      mode: "parents",
      title: `Show parents of ${target}`,
      subtitle: `${candidates.length} lookup targets - tick what joins the canvas, then they spotlight`,
      candidates,
    });
  }, [focusName, rootName, busy, describes, labels, isCustomName, SYSTEM_OBJECTS]);

  const applyPicker = useCallback(
    async (selected: string[]) => {
      if (!picker || busy) return;
      const mode = picker.mode;
      const target = focusName || rootName;
      setPicker(null);
      const names = selected.filter((n) => !describes.has(n)).slice(0, MAX_NEW_PER_ACTION);
      if (names.length === 0) {
        setNotice("Everything selected is already on canvas.");
        return;
      }
      if (describes.size + names.length > MAX_NODES) {
        setNotice(`Canvas cap is ${MAX_NODES} objects - adding ${names.length} would exceed it. Remove some nodes first.`);
        return;
      }
      setError(null);
      setNotice(null);
      setSpot(null);
      setBusy(`Adding ${names.length} object${names.length === 1 ? "" : "s"}…`);
      try {
        const fresh = await addNames(names);
        setFocusName(fresh[fresh.length - 1]?.name ?? target);
        if (mode === "parents" && target) {
          const dd = fresh.find((x) => x.name === target) ?? describes.get(target);
          const allParents = dd
            ? [...new Set((dd.fields ?? []).flatMap((f) => f.referenceTo ?? []))]
            : [];
          const freshNames = new Set(fresh.map((x) => x.name));
          const onCanvas = allParents.filter(
            (t) => t === target || describes.has(t) || freshNames.has(t)
          );
          if (onCanvas.length > 0) {
            setSpot({ focus: target, related: new Set(onCanvas) });
            setNotice(
              `${target} is ringed - ${onCanvas.length} parent${onCanvas.length === 1 ? "" : "s"} highlighted. Click empty canvas to clear.`
            );
            return;
          }
        }
        setNotice(
          fresh.length === 1
            ? `${fresh[0].name} added - links draw automatically.`
            : `${fresh.length} objects added - links draw automatically where both ends are present.`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Discovery failed");
      } finally {
        setBusy(null);
      }
    },
    [picker, busy, describes, focusName, rootName, addNames]
  );

  const removeNode = useCallback(() => {
    const target = focusName;
    if (!target || target === rootName) return;
    setSpot(null);
    pruneEnforced(new Set([target]));
    setDescribes((prev) => {
      const next = new Map(prev);
      next.delete(target);
      return next;
    });
    setFocusName(rootName);
  }, [focusName, rootName, pruneEnforced]);

  const removeMany = useCallback(
    (ids: string[]) => {
      const doomed = ids.filter((id) => id !== rootName);
      if (doomed.length === 0) return;
      const gone = new Set(doomed);
      setSpot(null);
      pruneEnforced(gone);
      setHiddenIds((prev) => {
        const next = new Set(prev);
        for (const id of gone) next.delete(id);
        return next;
      });
      setDescribes((prev) => {
        const next = new Map(prev);
        for (const id of gone) next.delete(id);
        return next;
      });
      if (gone.has(focusName)) setFocusName(rootName);
      if (graphSelected && gone.has(graphSelected)) setGraphSelected(null);
      setNotice(`Removed ${gone.size} object${gone.size === 1 ? "" : "s"} from canvas.`);
    },
    [rootName, focusName, graphSelected, pruneEnforced]
  );

  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Eye toggles only take effect in manual mode - jump there automatically
    setFilterMode((m) => (m === "manual" ? m : "manual"));
  }, []);

  const resetAll = useCallback(() => {
    if (describes.size === 0) return;
    // Non-destructive: re-run auto-layout + re-fit, keep every node.
    setSpot(null);
    setNotice(null);
    setError(null);
    setEnforced(null);
    setDescribes(new Map(describes));
    setLayoutRev((r) => r + 1);
    setNotice("Layout refreshed - nodes re-arranged, nothing removed.");
  }, [describes]);

  const [confirmClear, setConfirmClear] = useState(false);

  const clearCanvas = useCallback(() => {
    setDescribes(new Map());
    setRootName("");
    setFocusName("");
    setSpot(null);
    setEnforced(null);
    setNotice(null);
    setError(null);
    setConfirmClear(false);
  }, []);

  const handleNodeClick = useCallback(
    (id: string) => {
      // Graph bubbles carry prefixed ids (p:X / c:X) - strip to the API name
      const api = id.includes(":") ? id.split(":").slice(1).join(":") : id;
      setFocusName(api);
      setSpot(null);
      setGraphSelected(api);
    },
    []
  );

  const loadLite = useCallback(
    async (api: string) => {
      if (busy || describes.has(api)) return;
      setError(null);
      setBusy(`Loading ${api}…`);
      try {
        const fresh = await addNames([api]);
        if (fresh.length > 0) {
          setFocusName(api);
          setNotice(`${api} added to canvas.`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to load ${api}`);
      } finally {
        setBusy(null);
      }
    },
    [busy, describes, addNames]
  );

  const handlePaneClick = useCallback(() => {
    setSpot(null);
    setPopover(null);
    setGraphSelected(null);
  }, []);

  const handleFocusChange = useCallback((id: string) => {
    setFocusName(id);
    setSpot(null);
  }, []);

  // Pop-out handoff: fresh tabs don't inherit sessionStorage, so serve the
  // live session over a same-origin BroadcastChannel (memory only, one-shot,
  // nonce-matched - the token never touches disk or the URL).
  const popOut = useCallback(() => {
    const token = getToken();
    if (!token) {
      setError("Session expired - reconnect in the studio first, then pop out.");
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
      /* BroadcastChannel unavailable - room falls back to its own Connect */
    }
  }, [getToken, instanceUrl, apiVersion]);

  const focusOptions = [...describes.keys()].sort();

  return (
    <div
      className="flex gap-3"
      style={fillHeight ? { height: "100%", minHeight: 0 } : { height: "calc(100vh - 180px)", minHeight: 520 }}
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
              onClick={saveSnapshot}
              disabled={busy != null || describes.size === 0}
              aria-label="Save canvas snapshot"
              title="Snapshot this canvas - restorable per org from history"
              className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M8 7l1.5-2.5h5L16 7" />
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <circle cx="12" cy="13.5" r="3.2" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              aria-label={`Snapshot history, ${snapshots.length} saved`}
              title={`Snapshot history (${snapshots.length} for this org)`}
              className="relative rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
              {snapshots.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 inline-flex items-center justify-center rounded-full bg-ivory-950 text-ivory-100 text-[9px] font-bold">
                  {snapshots.length > 99 ? "99+" : snapshots.length}
                </span>
              )}
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
                placeholder="Add object - try Account…"
                value={rootSearch}
                onChange={(e) => setRootSearch(e.target.value)}
                aria-label="Choose root object for ERD"
              />
              {rootSearch.trim() && (
                <div className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line-soft)]" role="group" aria-label="Matching objects - check to stage">
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
                  <Button size="sm" variant="secondary" onClick={refreshAll} disabled={!!busy || describes.size === 0} title="Re-fetch metadata for every object on canvas and report what changed">
                    Refresh all
                  </Button>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={removeNode} disabled={!focusName || focusName === rootName || !!busy} className="flex-1" title="Remove the focused object from the canvas">
                      Remove
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetAll} disabled={describes.size === 0 || !!busy} className="flex-1" title="Re-run auto-layout and re-fit - keeps every node">
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

            {describes.size > 0 && (
              <details className="rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)]">
                <summary className="cursor-pointer list-none px-2.5 py-2 text-[11px] font-semibold text-ivory-900 hover:text-ivory-950">
                  Canvas nodes ({describes.size})
                  <span className="ml-1 font-normal text-ivory-500">- eye to hide, tick + remove for bulk</span>
                </summary>
                <ul className="max-h-44 space-y-0.5 overflow-y-auto border-t border-[var(--color-line-soft)] p-1.5">
                  {[...describes.keys()].sort().map((name) => {
                    const isRoot = name === rootName;
                    const hidden = hiddenIds.has(name);
                    const checked = manageChecked.has(name);
                    return (
                      <li
                        key={name}
                        className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 ${hidden ? "opacity-50" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleHidden(name)}
                          aria-label={hidden ? `Show ${name}` : `Hide ${name}`}
                          title={hidden ? "Show (manual filter)" : "Hide (manual filter)"}
                          className="rounded p-1 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
                        >
                          {hidden ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                              <path d="M3 3l18 18M10.5 5.2A9.8 9.8 0 0 1 12 5c7 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C4 8.4 2 12 2 12s3 7 10 7c1.5 0 2.9-.3 4.1-.8" />
                              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                            </svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                        {!isRoot && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setManageChecked((prev) => {
                                const next = new Set(prev);
                                if (next.has(name)) next.delete(name);
                                else next.add(name);
                                return next;
                              });
                            }}
                            aria-label={`Select ${name} for bulk remove`}
                            className="h-3.5 w-3.5 shrink-0 rounded border-ivory-400 text-bronze-600"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setFocusName(name);
                            setSpot(null);
                            if (view === "graph") setGraphSelected(name);
                          }}
                          className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-ivory-800 hover:text-ivory-950 cursor-pointer"
                          title={`${labels.get(name) ?? name} - click to focus`}
                        >
                          {name}
                          {isRoot && <span className="ml-1 text-[9px] font-bold text-bronze-600">ROOT</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {[...manageChecked].some((n) => n !== rootName && describes.has(n)) && (
                  <div className="border-t border-[var(--color-line-soft)] p-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-red-700"
                      onClick={() => {
                        removeMany([...manageChecked]);
                        setManageChecked(new Set());
                      }}
                    >
                      Remove checked
                    </Button>
                  </div>
                )}
              </details>
            )}

            <div className="rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)] p-2.5 text-[10px] leading-relaxed text-ivory-600">
              <p className="font-semibold text-ivory-900 mb-1">Legend</p>
              {view === "graph" ? (
                <>
                  <p><strong className="text-ivory-950">Solid</strong> = master-detail · <strong className="text-ivory-950">dotted</strong> = lookup</p>
                  <p>Dashed bubble = preview, click for details · ring = selected · click empty canvas to clear</p>
                </>
              ) : (
                <>
                  <p><strong className="text-ivory-950">Key</strong> = Id / Name · <strong className="text-bronze-600">Link</strong> = lookup</p>
                  <p><strong className="text-red-600">*</strong> = required · <strong className="text-bronze-700">JUNCTION</strong> = 2+ required lookups (audit fields excluded)</p>
                  <p>Solid = master-detail · dotted = lookup · click a line to reveal its lookup field · drag nodes to rearrange</p>
                </>
              )}
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
      <div className="min-w-0 flex-1 min-h-0 flex flex-col gap-2">
        {rootName && describes.size > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <div className="flex rounded-lg border border-[var(--color-line)] overflow-hidden bg-[var(--color-surface)]" role="tablist" aria-label="Canvas view">
              {(["erd", "graph"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => {
                    setView(v);
                    setGraphSelected(null);
                  }}
                  title={v === "erd" ? "ERD tables with fields" : "Radial graph - root in the middle, fan out"}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                    view === v ? "bg-ivory-950 text-ivory-100" : "text-ivory-700 hover:text-ivory-950"
                  }`}
                >
                  {v === "erd" ? "ERD" : "Graph"}
                </button>
              ))}
            </div>
            <span className="mx-1 h-4 w-px bg-[var(--color-line)]" aria-hidden="true" />
            {(["all", "standard", "custom", "manual"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterMode(f)}
                aria-pressed={filterMode === f}
                title={
                  f === "all" ? "Show everything on canvas"
                  : f === "standard" ? "Show standard objects only"
                  : f === "custom" ? "Show custom objects only"
                  : "Show only eye-checked nodes"
                }
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors cursor-pointer ${
                  filterMode === f
                    ? "bg-ivory-950 text-ivory-100 border-ivory-950"
                    : "bg-[var(--color-surface)] border-[var(--color-line)] text-ivory-700 hover:border-[var(--color-accent)]"
                }`}
              >
                {f}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setHideSystem((v) => !v)}
              aria-pressed={hideSystem}
              title="Hide system objects (User, RecordType, Organization, Profile)"
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                hideSystem
                  ? "bg-bronze-600 text-white border-bronze-600"
                  : "bg-[var(--color-surface)] border-[var(--color-line)] text-ivory-600 hover:text-ivory-950"
              }`}
            >
              Hide system
            </button>
            {view === "graph" && graphElements.overflow > 0 && (
              <span
                className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800"
                title="Dense neighborhood - refine with filters or Manual mode to see the rest"
              >
                +{graphElements.overflow} beyond orbit room
              </span>
            )}
          </div>
        )}
        <div className="relative min-h-0 flex-1">
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
                description="Search the explorer panel - the object lands on the infinite canvas as an ERD table. Discover children level by level, go full-depth, present with the laser, export hi-res PNG."
              />
            </div>
          ) : view === "erd" ? (
            <ErdCanvas
              nodes={elements.nodes}
              edges={elements.edges}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              onViewportMove={() => setPopover(null)}
              onNodeDragStop={handleNodeDragStop}
              layoutRev={layoutRev}
              enforcedPositions={enforced}
              ref={canvasRef}
            />
          ) : (
            <ErdCanvas
              nodes={graphElements.nodes}
              edges={graphElements.edges}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              onViewportMove={() => setPopover(null)}
              onNodeDragStop={handleNodeDragStop}
              layoutRev={layoutRev}
              enforcedPositions={null}
              ref={canvasRef}
            />
          )}
          {view === "graph" && detail && (
            <GraphDetailCard
              detail={detail}
              labels={labels}
              onClose={() => setGraphSelected(null)}
              onOpenInErd={() => {
                if (detail.kind === "loaded") {
                  setFocusName(detail.d.name);
                  setView("erd");
                }
              }}
              onMakeRoot={() => {
                if (detail.kind === "loaded") {
                  setRootName(detail.d.name);
                  setFocusName(detail.d.name);
                  setSpot(null);
                  setGraphSelected(detail.d.name);
                  setNotice(`${detail.d.name} is now the graph root.`);
                }
              }}
              onLoad={() => {
                if (detail.kind === "lite") void loadLite(detail.n.apiName);
              }}
            />
          )}
        </div>
      </div>

      {/* Picklist inspector */}
      {popover && <PicklistPopover pop={popover} onClose={() => setPopover(null)} />}

      {/* Selective discovery picker */}
      {picker && (
        <DiscoverPicker
          open
          title={picker.title}
          subtitle={picker.subtitle}
          candidates={picker.candidates}
          onApply={applyPicker}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Snapshot history */}
      {showHistory && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-title"
          onClick={() => {
            setShowHistory(false);
            setRenamingId(null);
          }}
        >
          <div className="modal-card max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[var(--color-line-soft)]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
                  {orgDomain || "This org"} · {snapshots.length} saved
                </p>
                <h2 id="history-title" className="mt-1 text-lg font-bold text-ivory-950">
                  Canvas snapshots
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowHistory(false);
                  setRenamingId(null);
                }}
                aria-label="Close snapshot history"
                className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto px-6 py-4">
              {snapshots.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm font-semibold text-ivory-950">No snapshots yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-ivory-600">
                    Arrange your canvas, hit the camera icon, and pick up exactly here later -
                    snapshots restore with fresh metadata.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {snapshots.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2.5"
                    >
                      {renamingId === s.id ? (
                        <div className="flex gap-2">
                          <input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") renameSnapshot(s.id, renameValue);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            autoFocus
                            aria-label="Snapshot name"
                            className="flex-1 min-w-0 rounded border border-ivory-400 bg-white px-2 py-1 text-xs text-ivory-950 focus:border-bronze-500 focus:outline-none"
                          />
                          <Button size="sm" onClick={() => renameSnapshot(s.id, renameValue)}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-ivory-950">{s.name}</p>
                            <p className="text-[11px] text-ivory-600">
                              {s.nodes.length} objects · {timeAgo(s.createdAt)}
                            </p>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => restoreSnapshot(s)} disabled={!!busy}>
                            Restore
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(s.id);
                              setRenameValue(s.name);
                            }}
                            aria-label={`Rename ${s.name}`}
                            title="Rename"
                            className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                              <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
                              <path d="m13.5 6.5 3 3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSnapshot(s.id)}
                            aria-label={`Delete ${s.name}`}
                            title="Delete"
                            className="rounded-md p-1.5 text-ivory-500 hover:text-red-700 hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                              <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13h10l1-13" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="px-6 pb-4 text-[11px] text-ivory-600">
              Restoring re-fetches live metadata - layouts come back, stale fields don&apos;t.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
