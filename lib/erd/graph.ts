import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { SalesforceDescribeResult } from "@/lib/salesforce/types";

export interface ErdPickValue {
  label: string;
  value: string;
  active: boolean;
  isDefault: boolean;
}

export interface ErdFieldRow {
  name: string;
  type: string;
  isId: boolean;
  isName: boolean;
  /** Lookup targets, e.g. ["Account", "Opportunity"] */
  refs: string[];
  required: boolean;
  /** Picklist options (picklist/multipicklist only, capped). */
  pickValues: ErdPickValue[];
}

export interface ErdNodeData extends Record<string, unknown> {
  label: string;
  apiName: string;
  custom: boolean;
  rows: ErdFieldRow[];
  totalFields: number;
  shownChildren: number;
  totalChildren: number;
  isJunction: boolean;
  isRoot: boolean;
  /** Spotlight mode: focused node gets a ring, everything unrelated dims. */
  spotlight: boolean;
  dimmed: boolean;
  /** True while this node's describe is being refreshed. */
  refreshing: boolean;
  onRefreshNode?: (id: string) => void;
  onPicklistClick?: (
    nodeId: string,
    fieldName: string,
    anchor: { x: number; y: number; width: number; height: number }
  ) => void;
}

export const ERD_NODE_WIDTH = 300;
export const ERD_MAX_ROWS = 10;
const ROW_H = 26;
// Fixed chrome heights (nodes must match these exactly - dagre + handle docks depend on them)
export const ERD_HEADER_H = 62;
export const ERD_FOOTER_H = 60;
// Header + rows padding + more-button + footer
const CHROME_H = ERD_HEADER_H + 8 + 22 + ERD_FOOTER_H;

export function erdNodeHeight(rowCount: number): number {
  return CHROME_H + Math.min(rowCount, ERD_MAX_ROWS) * ROW_H;
}

function toRow(
  f: {
    name: string;
    type: string;
    nillable: boolean;
    nameField: boolean;
    referenceTo: string[];
    picklistValues?: { label: string; value: string; active: boolean; defaultValue: boolean }[] | null;
  },
  targetLabels: Map<string, string>
): ErdFieldRow {
  const isPick = f.type === "picklist" || f.type === "multipicklist";
  return {
    name: f.name,
    type: f.type,
    isId: f.name === "Id",
    isName: !!f.nameField,
    refs: (f.referenceTo ?? []).filter((t) => targetLabels.has(t)),
    required: !f.nillable,
    pickValues:
      isPick && Array.isArray(f.picklistValues)
        ? f.picklistValues.slice(0, 100).map((p) => ({
            label: p.label ?? p.value,
            value: p.value,
            active: p.active !== false,
            isDefault: !!p.defaultValue,
          }))
        : [],
  };
}

function orderRows(
  rows: ErdFieldRow[]
): ErdFieldRow[] {
  const rank = (r: ErdFieldRow) =>
    r.isId ? 0 : r.isName ? 1 : r.refs.length > 0 ? 2 : r.required ? 3 : 4;
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Audit/system lookups every standard object carries - never junction evidence. */
const SYSTEM_REF_FIELDS = new Set(["CreatedById", "LastModifiedById", "OwnerId"]);

/** Junction heuristic: 2+ required NON-SYSTEM lookups = classic junction object. */
export function detectJunction(describe: SalesforceDescribeResult): boolean {
  const requiredRefs = describe.fields.filter(
    (f) =>
      f.type === "reference" &&
      !f.nillable &&
      !SYSTEM_REF_FIELDS.has(f.name) &&
      (f.referenceTo?.length ?? 0) > 0
  );
  return requiredRefs.length >= 2;
}

export interface ErdElements {
  nodes: Node<ErdNodeData>[];
  edges: Edge[];
}

/** Handle ids used by ErdTableNode. Joins dock on side edges at header/footer height. */
export const parentExitHandleId = "erd-exit";
export const childEntryHandleId = "erd-entry";
export const loopOutHandleId = "erd-loop-out";
export const loopInHandleId = "erd-loop-in";

export interface ErdSpotlight {
  focus: string;
  related: Set<string>;
}

/**
 * Build ERD nodes + edges from cached describes.
 * Edges are derived from reference fields and only drawn when BOTH ends are described.
 * `pinned` fixes node positions (drags, restores); newcomers spiral to free space.
 */
export function buildErdElements(
  describes: Map<string, SalesforceDescribeResult>,
  labels: Map<string, string>,
  root: string,
  spot: ErdSpotlight | null = null,
  pinned: Map<string, { x: number; y: number }> | null = null
): ErdElements {
  const nodes: Node<ErdNodeData>[] = [];

  // Pass 1 - nodes (edges are built centrally by buildEdges below)
  for (const [apiName, describe] of describes) {
    const allRows = orderRows(
      describe.fields.map((f) =>
        toRow(
          {
            name: f.name,
            type: f.type,
            nillable: f.nillable,
            nameField: f.nameField,
            referenceTo: f.referenceTo ?? [],
            picklistValues: f.picklistValues ?? null,
          },
          labels
        )
      )
    );
    const rows = allRows;
    const childRels = (describe.childRelationships ?? []).filter((r) => r.relationshipName);

    nodes.push({
      id: apiName,
      type: "erdTable",
      position: { x: 0, y: 0 },
      data: {
        label: describe.label,
        apiName: describe.name,
        custom: describe.custom,
        rows,
        totalFields: describe.fields.length,
        shownChildren: 0, // filled by panel
        totalChildren: childRels.length,
        isJunction: detectJunction(describe),
        isRoot: apiName === root,
        spotlight: spot != null && spot.focus === apiName,
        dimmed: spot != null && spot.focus !== apiName && !spot.related.has(apiName),
        // Panel overrides per live refresh state
        refreshing: false,
      },
    });
  }

  const edges = buildEdges(describes);

  return { nodes: layoutErd(nodes, edges, pinned), edges };
}

export type ErdEdgeKind = "md" | "lookup";

export interface ErdEdgeData extends Record<string, unknown> {
  kind: ErdEdgeKind;
  loopLane?: number;
}

/**
 * Build relationship edges from cached describes. An edge parent → child
 * exists for every lookup whose BOTH ends are described. Kind comes from the
 * parent's childRelationships cascadeDelete flag (true = master-detail).
 */
export function buildEdges(describes: Map<string, SalesforceDescribeResult>): Edge[] {
  const edges: Edge[] = [];
  const seenEdges = new Set<string>();
  const selfLanes = new Map<string, number>();

  for (const [apiName, describe] of describes) {
    // Parent edges: this object's lookups → described targets
    for (const field of describe.fields) {
      if (field.type !== "reference") continue;
      for (const target of field.referenceTo ?? []) {
        if (!describes.has(target)) continue;
        const key = `${target}|${apiName}|${field.name}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        const isLoop = target === apiName;
        let loopLane = 0;
        if (isLoop) {
          loopLane = selfLanes.get(apiName) ?? 0;
          selfLanes.set(apiName, loopLane + 1);
        }
        // Master-detail test: the parent's childRelationship for this exact
        // child + lookup field carries cascadeDelete.
        const parentDescribe = describes.get(target);
        const rel = parentDescribe?.childRelationships?.find(
          (r) => r.childSObject === apiName && r.field === field.name
        );
        const kind: ErdEdgeKind = rel?.cascadeDelete === true ? "md" : "lookup";
        edges.push({
          id: key,
          source: target,
          target: apiName,
          sourceHandle: isLoop ? loopOutHandleId : parentExitHandleId,
          targetHandle: isLoop ? loopInHandleId : childEntryHandleId,
          label: field.name,
          // Custom ERD edge: "one" bar at the parent end, crow's foot at the child end.
          type: "erdEdge",
          data: { kind, ...(isLoop ? { loopLane } : {}) } as ErdEdgeData,
        });
      }
    }
  }

  return edges;
}

// ── Radial graph view ─────────────────────────────────────────────────────

export type GraphNodeRole = "root" | "parent" | "child";

export interface GraphBubbleData extends Record<string, unknown> {
  label: string;
  apiName: string;
  custom: boolean;
  role: GraphNodeRole;
  /** False for not-yet-loaded neighbors (dashed lite bubbles). */
  loaded: boolean;
  childCount: number;
  isJunction: boolean;
  dimmed: boolean;
  spotlight: boolean;
}

export interface GraphNeighbor {
  apiName: string;
  label: string;
  custom: boolean;
  role: "parent" | "child";
  /** Lookup field (child side) or relationship driving the link. */
  via: string;
  kind: ErdEdgeKind;
}

/**
 * 1-neighborhood of the root: parents from its lookup targets, children from
 * its childRelationships. Neighbors need not be described — lite bubbles carry
 * just enough to render and to load on click.
 */
export function rootNeighbors(
  root: SalesforceDescribeResult,
  labels: Map<string, string>,
  isCustom: (apiName: string) => boolean
): GraphNeighbor[] {
  const out: GraphNeighbor[] = [];
  const seen = new Set<string>();

  for (const f of root.fields ?? []) {
    if (f.type !== "reference") continue;
    for (const target of f.referenceTo ?? []) {
      if (target === root.name || seen.has(`p:${target}`)) continue;
      seen.add(`p:${target}`);
      out.push({
        apiName: target,
        label: labels.get(target) ?? target,
        custom: isCustom(target),
        role: "parent",
        via: f.name,
        kind: "lookup",
      });
    }
  }

  for (const r of root.childRelationships ?? []) {
    if (!r.relationshipName) continue;
    if (r.childSObject === root.name || seen.has(`c:${r.childSObject}`)) continue;
    seen.add(`c:${r.childSObject}`);
    out.push({
      apiName: r.childSObject,
      label: labels.get(r.childSObject) ?? r.childSObject,
      custom: isCustom(r.childSObject),
      role: "child",
      via: r.field,
      kind: r.cascadeDelete === true ? "md" : "lookup",
    });
  }

  return out;
}

const BUBBLE_ROOT = 104;
const BUBBLE_NODE = 80;
const MAX_FAN = 64;

// Scatter orbits: bubbles sit on concentric rings so dense fans never share
// one crowded circle. Lane step clears two bubble diameters + margin.
const ORBITS = [330, 475, 620];
const ARC_DEG = 160;
const MIN_GAP = 118;

function orbitSlots(radius: number): number[] {
  const arcLen = radius * ((ARC_DEG * Math.PI) / 180);
  const n = Math.max(3, Math.floor(arcLen / MIN_GAP));
  return Array.from({ length: n }, (_, i) => -ARC_DEG / 2 + (ARC_DEG * i) / Math.max(1, n - 1));
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface GraphElements {
  nodes: Node<GraphBubbleData>[];
  edges: Edge[];
  /** Neighbors left out for lack of room - panel surfaces the count. */
  overflow: number;
}

/**
 * Radial scatter: root at origin, parents fanning left, children fanning
 * right, spread across concentric orbits. Greedy fill - each bubble takes the
 * first free slot starting from the inner orbit, so dense neighborhoods spill
 * outward like stars instead of piling onto one ring. Fully deterministic:
 * same input, same sky. Anything past capacity is counted as overflow.
 * Lite (undescribed) neighbors render dashed and load on click.
 */
export function buildGraphElements(
  root: SalesforceDescribeResult,
  neighbors: GraphNeighbor[],
  described: Set<string>,
  spot: ErdSpotlight | null = null,
  pinned: Map<string, { x: number; y: number }> | null = null
): GraphElements {
  const shown = neighbors.slice(0, MAX_FAN);
  const overflow = Math.max(0, neighbors.length - shown.length);
  const parents = shown.filter((n) => n.role === "parent");
  const children = shown.filter((n) => n.role === "child");

  const nodes: Node<GraphBubbleData>[] = [
    {
      id: root.name,
      type: "graphBubble",
      position: { x: -BUBBLE_ROOT / 2, y: -BUBBLE_ROOT / 2 },
      data: {
        label: root.label,
        apiName: root.name,
        custom: root.custom,
        role: "root",
        loaded: true,
        childCount: (root.childRelationships ?? []).filter((r) => r.relationshipName).length,
        isJunction: detectJunction(root),
        dimmed: false,
        spotlight: false,
      },
    },
  ];
  const edges: Edge[] = [];

  // Occupied points: root center + any pinned (dragged) bubbles, matched by
  // bare API name or prefixed graph id.
  const occupied: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  if (pinned) {
    const seen = new Set<string>();
    for (const [key, p] of pinned) {
      const api = key.includes(":") ? key.split(":").slice(1).join(":") : key;
      if (api !== root.name && !seen.has(api)) {
        seen.add(api);
        occupied.push({ x: p.x + BUBBLE_NODE / 2, y: p.y + BUBBLE_NODE / 2 });
      }
    }
  }

  const place = (
    list: GraphNeighbor[],
    centerDeg: number,
    prefix: string
  ) => {
    const taken: boolean[][] = ORBITS.map(() => []);
    const slotAngles = ORBITS.map(orbitSlots);
    list.forEach((n) => {
      let placed: { x: number; y: number } | null = null;
      for (let o = 0; o < ORBITS.length && !placed; o++) {
        const angles = slotAngles[o];
        // Start near the middle and alternate outward for a balanced fan
        const order = [...angles.keys()].sort((a, b) => {
          const da = Math.abs(a - (angles.length - 1) / 2);
          const db = Math.abs(b - (angles.length - 1) / 2);
          return da - db || a - b;
        });
        for (const si of order) {
          if (taken[o][si]) continue;
          const rad = ((centerDeg + angles[si]) * Math.PI) / 180;
          const p = { x: ORBITS[o] * Math.cos(rad), y: ORBITS[o] * Math.sin(rad) };
          if (occupied.some((q) => dist(p, q) < MIN_GAP)) continue;
          taken[o][si] = true;
          placed = p;
          break;
        }
      }
      if (!placed) return; // no room even out here - counted as overflow below
      occupied.push(placed);
      const loaded = described.has(n.apiName);
      nodes.push({
        id: `${prefix}:${n.apiName}`,
        type: "graphBubble",
        position: { x: placed.x - BUBBLE_NODE / 2, y: placed.y - BUBBLE_NODE / 2 },
        data: {
          label: n.label,
          apiName: n.apiName,
          custom: n.custom,
          role: n.role,
          loaded,
          childCount: 0,
          isJunction: false,
          dimmed: spot != null && spot.focus !== n.apiName && !spot.related.has(n.apiName),
          spotlight: spot != null && spot.focus === n.apiName,
        },
      });
      const isParentSide = n.role === "parent";
      edges.push({
        id: `g|${root.name}|${n.apiName}|${n.via}`,
        source: isParentSide ? `${prefix}:${n.apiName}` : root.name,
        target: isParentSide ? root.name : `${prefix}:${n.apiName}`,
        label: n.via,
        type: "erdEdge",
        data: { kind: n.kind, graphLink: true, target: n.apiName, loaded } as Record<string, unknown>,
      });
    });
  };

  const before = nodes.length;
  place(parents, 180, "p");
  place(children, 0, "c");
  const unplaced = shown.length - (nodes.length - before);

  return { nodes, edges, overflow: overflow + unplaced };
}

export function layoutErd(
  nodes: Node<ErdNodeData>[],
  edges: Edge[],
  pinned?: Map<string, { x: number; y: number }> | null
): Node<ErdNodeData>[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 56, ranksep: 120, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const heights = new Map<string, number>();
  for (const n of nodes) {
    const h = erdNodeHeight((n.data as ErdNodeData).rows.length);
    heights.set(n.id, h);
    g.setNode(n.id, { width: ERD_NODE_WIDTH, height: h });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const placed = nodes.map((n) => {
    const p = g.node(n.id);
    const h = heights.get(n.id) ?? 200;
    return { ...n, position: { x: p.x - ERD_NODE_WIDTH / 2, y: p.y - h / 2 } };
  });

  if (!pinned || pinned.size === 0) return placed;

  // 1. Honor pins (user drags + restored snapshots)
  const byId = new Map(placed.map((n) => [n.id, n]));
  for (const [id, p] of pinned) {
    const n = byId.get(id);
    if (n) n.position = { ...p };
  }

  // 2. Push every unpinned node out of overlap - radially away from the
  // clash partner's center, so newcomers cascade to free space instead of
  // stacking under pinned nodes. Pinned nodes (drags, restores) never move.
  const GAP = 28;
  const STEP = 40;
  const rectOf = (n: (typeof placed)[number]) => ({
    x: n.position.x,
    y: n.position.y,
    w: ERD_NODE_WIDTH,
    h: heights.get(n.id) ?? 200,
  });
  const hits = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) =>
    a.x < b.x + b.w + GAP &&
    b.x < a.x + a.w + GAP &&
    a.y < b.y + b.h + GAP &&
    b.y < a.y + a.h + GAP;
  const centerOf = (r: ReturnType<typeof rectOf>) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  for (const n of placed) {
    if (pinned.has(n.id)) continue;
    let r = rectOf(n);
    let tries = 0;
    while (tries < 200) {
      const clash = placed.find((m) => m.id !== n.id && hits(r, rectOf(m)));
      if (!clash) break;
      tries++;
      const c = centerOf(rectOf(clash));
      const s = centerOf(r);
      let dx = s.x - c.x;
      let dy = s.y - c.y;
      // Dead-center stack (the Lead/Account case): cascade down-right.
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        dx = 1;
        dy = 0.6;
      }
      const len = Math.hypot(dx, dy);
      r = { ...r, x: r.x + (dx / len) * STEP, y: r.y + (dy / len) * STEP };
      n.position = { x: r.x, y: r.y };
    }
  }

  return placed;
}
