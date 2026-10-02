"use client";

import type { SystemConnection, SystemProject } from "./model";

/**
 * Chain resolution (pure): from a start edge, follow ready edges downstream.
 * Fan-out runs every branch (shared prefix executes once per lane trace);
 * cycles stop with a note; dead ends stop silently. Hop cap bounds pathological
 * canvases. A lane is an ordered edge list - the executor walks it hop by hop.
 */

export const CHAIN_MAX_HOPS = 25;

export interface ChainLane {
  edges: SystemConnection[];
  stopped: string | null;
}

export function resolveChain(
  project: Pick<SystemProject, "connections">,
  startEdgeId: string,
  maxHops = CHAIN_MAX_HOPS
): ChainLane[] {
  const bySource = new Map<string, SystemConnection[]>();
  for (const c of project.connections) {
    const list = bySource.get(c.sourceId) ?? [];
    list.push(c);
    bySource.set(c.sourceId, list);
  }
  // Deterministic fan-out order: label, then id.
  for (const list of bySource.values()) {
    list.sort((a, b) => (a.label || "").localeCompare(b.label || "") || (a.id < b.id ? -1 : 1));
  }
  const start = project.connections.find((c) => c.id === startEdgeId);
  if (!start) return [];
  const lanes: ChainLane[] = [];
  // DFS carrying the lane; shared prefixes re-execute per lane (documented:
  // lanes are independent traces, not exactly-once delivery).
  const walk = (edge: SystemConnection, lane: SystemConnection[], visited: Set<string>) => {
    if (lane.length >= maxHops) {
      lanes.push({ edges: lane, stopped: `Hop cap (${maxHops}) reached - chain truncated.` });
      return;
    }
    if (visited.has(edge.id)) {
      lanes.push({ edges: lane, stopped: `Cycle detected at ${edge.id} - stopped, not looped.` });
      return;
    }
    const next = [...lane, edge];
    const visitedNext = new Set(visited);
    visitedNext.add(edge.id);
    const outgoing = (bySource.get(edge.targetId) ?? []).filter((c) => c.id !== edge.id);
    if (outgoing.length === 0) {
      lanes.push({ edges: next, stopped: null });
      return;
    }
    for (const o of outgoing) walk(o, next, visitedNext);
  };
  walk(start, [], new Set());
  return lanes;
}

/** Edges in a lane missing a stored mapping (run as passthrough, stated). */
export function unmappedEdges(lane: ChainLane): string[] {
  return lane.edges.filter((e) => !e.mapping).map((e) => e.id);
}
