import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { SalesforceDescribeResult } from "@/lib/salesforce/types";

export interface ErdFieldRow {
  name: string;
  type: string;
  isId: boolean;
  isName: boolean;
  /** Lookup targets, e.g. ["Account", "Opportunity"] */
  refs: string[];
  required: boolean;
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
}

export const ERD_NODE_WIDTH = 300;
export const ERD_MAX_ROWS = 10;
const ROW_H = 26;
// Header 62 + rows + more-button 22 + footer 30 + padding
const CHROME_H = 122;

export function erdNodeHeight(rowCount: number): number {
  return CHROME_H + Math.min(rowCount, ERD_MAX_ROWS) * ROW_H;
}

function toRow(
  f: { name: string; type: string; nillable: boolean; nameField: boolean; referenceTo: string[] },
  targetLabels: Map<string, string>
): ErdFieldRow {
  return {
    name: f.name,
    type: f.type,
    isId: f.name === "Id",
    isName: !!f.nameField,
    refs: (f.referenceTo ?? []).filter((t) => targetLabels.has(t)),
    required: !f.nillable,
  };
}

function orderRows(
  rows: ErdFieldRow[]
): ErdFieldRow[] {
  const rank = (r: ErdFieldRow) =>
    r.isId ? 0 : r.isName ? 1 : r.refs.length > 0 ? 2 : r.required ? 3 : 4;
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Audit/system lookups every standard object carries — never junction evidence. */
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
 */
export function buildErdElements(
  describes: Map<string, SalesforceDescribeResult>,
  labels: Map<string, string>,
  root: string,
  spot: ErdSpotlight | null = null
): ErdElements {
  const nodes: Node<ErdNodeData>[] = [];
  const edges: Edge[] = [];
  const seenEdges = new Set<string>();

  // Pass 1 — nodes
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
      },
    });
  }

  // Pass 2 — edges docked on side edges at header/footer height.
  // Inter-node: parent header-right → child footer-left (bezier sweep).
  // Self-lookup: header-left → footer-left, hugging the node's own flank
  // in staggered lanes so stacked loops never share one path.
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
        edges.push({
          id: key,
          source: target,
          target: apiName,
          sourceHandle: isLoop ? loopOutHandleId : parentExitHandleId,
          targetHandle: isLoop ? loopInHandleId : childEntryHandleId,
          label: field.name,
          // Custom ERD edge: "one" bar at the parent end, crow's foot at the child end.
          type: "erdEdge",
          ...(isLoop ? { data: { loopLane } } : {}),
        });
      }
    }
  }

  return { nodes: layoutErd(nodes, edges), edges };
}

export function layoutErd(
  nodes: Node<ErdNodeData>[],
  edges: Edge[]
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

  return nodes.map((n) => {
    const p = g.node(n.id);
    const h = heights.get(n.id) ?? 200;
    return { ...n, position: { x: p.x - ERD_NODE_WIDTH / 2, y: p.y - h / 2 } };
  });
}
