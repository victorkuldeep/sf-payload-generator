"use client";

import { useMemo, useState } from "react";
import type { CompositeSubRequest, SalesforceObject } from "@/lib/salesforce/types";
import { buildCompositeTree } from "@/lib/payload/generator";
import { rankObjects } from "@/lib/search/rank";
import Input from "./ui/Input";

interface CompositeTreeProps {
  subRequests: CompositeSubRequest[];
  selectedId: string | null;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAddObject: (objectName: string) => void;
  allObjects: SalesforceObject[];
}

const METHOD_DOT: Record<string, string> = {
  POST: "bg-green-600",
  PATCH: "bg-amber-500",
  GET: "bg-sky-600",
  DELETE: "bg-red-600",
};

/**
 * Workbench request tree: one compact row per sub-request, indented by
 * `@{ref}` parentage. Chevron collapses a subtree, click selects for
 * editing, hover reveals duplicate / delete. No arrows, no cards.
 */
export default function CompositeTree({
  subRequests,
  selectedId,
  collapsed,
  onSelect,
  onToggleCollapse,
  onDuplicate,
  onRemove,
  onAddObject,
  allObjects,
}: CompositeTreeProps) {
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildCompositeTree(subRequests), [subRequests]);
  const byId = useMemo(() => new Map(subRequests.map((sr) => [sr.id, sr])), [subRequests]);
  const indexById = useMemo(() => new Map(subRequests.map((sr, i) => [sr.id, i])), [subRequests]);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return rankObjects(allObjects, search, 8).filter(
      (o) => o.name.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
    );
  }, [allObjects, search]);

  // Visible rows: roots in execution order, children under expanded parents.
  const rows = useMemo(() => {
    const out: string[] = [];
    const visit = (id: string, hidden: boolean) => {
      const node = tree.get(id);
      if (!node) return;
      if (!hidden) out.push(id);
      const kidsHidden = hidden || collapsed.has(id);
      [...node.children]
        .sort((a, b) => (indexById.get(a) ?? 0) - (indexById.get(b) ?? 0))
        .forEach((c) => visit(c, kidsHidden));
    };
    subRequests.forEach((sr) => {
      if ((tree.get(sr.id)?.depth ?? 0) === 0) visit(sr.id, false);
    });
    return out;
  }, [subRequests, tree, collapsed, indexById]);

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden flex flex-col">
      <div className="border-b border-[var(--color-line-soft)] p-3">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-[1.4px] text-ivory-600">
            Requests · {subRequests.length}/25
          </h3>
        </div>
        <Input
          placeholder="Find sObject to add…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Find sObject to add as sub-request"
        />
        {search.trim() !== "" && (
          <div className="mt-1 max-h-56 overflow-y-auto rounded border border-[var(--color-line)] bg-white shadow-sm">
            {suggestions.map((o) => (
              <button
                key={o.name}
                onClick={() => {
                  onAddObject(o.name);
                  setSearch("");
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-ivory-200 transition-colors"
              >
                <span className="font-medium text-ivory-950">{o.label}</span>
                <span className="ml-2 font-mono text-xs text-ivory-600">{o.name}</span>
              </button>
            ))}
            {suggestions.length === 0 && (
              <p className="px-3 py-2 text-sm text-ivory-500">No matches</p>
            )}
          </div>
        )}
      </div>

      <div className="max-h-[560px] overflow-y-auto p-1.5" role="tree" aria-label="Composite requests">
        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-ivory-500">
            No requests yet - search above to add your first sObject.
          </p>
        )}
        {rows.map((id) => {
          const sr = byId.get(id);
          if (!sr) return null;
          const node = tree.get(id);
          const depth = node?.depth ?? 0;
          const hasKids = (node?.children.length ?? 0) > 0;
          const isCollapsed = collapsed.has(id);
          const selected = id === selectedId;
          const n = (indexById.get(id) ?? 0) + 1;
          return (
            <div
              key={id}
              role="treeitem"
              aria-selected={selected}
              aria-expanded={hasKids ? !isCollapsed : undefined}
              onClick={() => onSelect(id)}
              className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-[7px] transition-colors ${
                selected ? "bg-ivory-950 text-ivory-100" : "hover:bg-ivory-200 text-ivory-900"
              }`}
              style={{ marginLeft: depth * 18 }}
              title={sr.objectName ? `${sr.objectName} · @${sr.referenceId}` : "Empty request - pick an object"}
            >
              {hasKids ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse(id);
                  }}
                  aria-label={isCollapsed ? "Expand subtree" : "Collapse subtree"}
                  className={`shrink-0 rounded p-0.5 text-[10px] leading-none transition-transform ${
                    selected ? "text-ivory-300 hover:text-white" : "text-ivory-500 hover:text-ivory-950"
                  } ${isCollapsed ? "-rotate-90" : ""}`}
                >
                  ▼
                </button>
              ) : (
                <span className="w-[14px] shrink-0 text-center text-[10px] text-ivory-400" aria-hidden="true">
                  ·
                </span>
              )}
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  selected ? "bg-ivory-100 text-ivory-950" : "bg-ivory-950 text-ivory-100"
                }`}
              >
                {n}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {sr.objectName ? (
                  <>
                    {sr.describe?.label ?? sr.objectName}
                    <span className={`ml-1.5 font-mono text-[11px] ${selected ? "text-ivory-300" : "text-bronze-600"}`}>
                      @{sr.referenceId || "…"}
                    </span>
                  </>
                ) : (
                  <span className={selected ? "text-ivory-300" : "text-ivory-500"}>Select object…</span>
                )}
              </span>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${METHOD_DOT[sr.method] ?? "bg-ivory-400"}`}
                title={sr.method}
                aria-label={sr.method}
              />
              <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(id);
                  }}
                  aria-label="Duplicate request"
                  title="Duplicate (new unique referenceId)"
                  className={`rounded p-1 text-xs leading-none ${
                    selected ? "text-ivory-300 hover:text-white" : "text-ivory-500 hover:text-ivory-950"
                  }`}
                >
                  ⧉
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(id);
                  }}
                  aria-label="Delete request"
                  title="Delete request"
                  className={`rounded p-1 text-xs leading-none ${
                    selected ? "text-ivory-300 hover:text-white" : "text-ivory-500 hover:text-red-700"
                  }`}
                >
                  ×
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
