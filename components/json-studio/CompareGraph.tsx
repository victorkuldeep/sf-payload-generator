"use client";

import { useMemo } from "react";
import { buildDocument, type JsonDocument } from "@/lib/json/document";
import type { Finding, FindingCategory } from "@/lib/json/compare";
import { JsonGraph } from "./JsonGraph";
import { tonesForSide } from "./CompareFindings";

function includeSet(doc: JsonDocument, ids: Iterable<string>): Set<string> {
  const keep = new Set<string>();
  for (const id of ids) {
    let cur: string | null = id;
    const guard = new Set<string>();
    while (cur !== null && !guard.has(cur) && doc.nodes.has(cur)) {
      guard.add(cur);
      keep.add(cur);
      cur = doc.nodes.get(cur)?.parent ?? null;
    }
  }
  return keep;
}

/**
 * Graph Diff: A and B canvases side by side with change tones, synced
 * selection, and category filtering (presentation only - findings rule).
 */
export function CompareGraph({
  a,
  b,
  findings,
  filter,
  selectedId,
  onSelect,
}: {
  a: object;
  b: object;
  findings: Finding[];
  filter: Set<FindingCategory> | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const docA = useMemo(() => buildDocument(a), [a]);
  const docB = useMemo(() => buildDocument(b), [b]);

  const tonesA = useMemo(() => tonesForSide(findings, "a"), [findings]);
  const tonesB = useMemo(() => tonesForSide(findings, "b"), [findings]);

  const includeA = useMemo(() => {
    if (filter === null) return null;
    const ids = findings.filter((f) => f.pathA !== null && filter.has(f.category)).map((f) => f.pathA as string);
    return includeSet(docA, ids);
  }, [findings, filter, docA]);

  const includeB = useMemo(() => {
    if (filter === null) return null;
    const ids = findings.filter((f) => f.pathB !== null && filter.has(f.category)).map((f) => f.pathB as string);
    return includeSet(docB, ids);
  }, [findings, filter, docB]);

  // Selection is finding-scoped; map to each side's node id.
  const finding = findings.find((f) => f.id === selectedId) ?? null;
  const selA = finding?.pathA ?? null;
  const selB = finding?.pathB ?? null;

  const selectFrom = (side: "a" | "b") => (nodeId: string | null) => {
    if (nodeId === null) {
      onSelect(null);
      return;
    }
    const hit = findings.find((f) => (side === "a" ? f.pathA : f.pathB) === nodeId);
    onSelect(hit ? hit.id : null);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-1.5 font-mono text-[11px] font-bold text-[#777168]">A · source</p>
        <JsonGraph
          doc={docA}
          tones={tonesA}
          includeOnly={includeA}
          selectedId={selA}
          onSelect={selectFrom("a")}
        />
      </div>
      <div>
        <p className="mb-1.5 font-mono text-[11px] font-bold text-[#777168]">B · target</p>
        <JsonGraph
          doc={docB}
          tones={tonesB}
          includeOnly={includeB}
          selectedId={selB}
          onSelect={selectFrom("b")}
        />
      </div>
    </div>
  );
}
