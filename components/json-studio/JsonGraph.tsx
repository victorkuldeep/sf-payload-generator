"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import type { JsonDocument } from "@/lib/json/document";
import { ancestorIds, getNode } from "@/lib/json/document";
import { projectGraph, searchGraphModel, type ChangeTone } from "@/lib/json/graph";
import { stringifyPath } from "@/lib/json/path";

interface JsonGraphNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  preview: string;
  childCount: number;
  hiddenChildren: number;
  expandable: boolean;
  expanded: boolean;
  tone: ChangeTone;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

const NODE_W = 232;
const NODE_H = 78;

const TONE_BORDER: Record<ChangeTone, string> = {
  neutral: "border-[#E8E2D8]",
  added: "border-[#32815B]",
  removed: "border-[#B84C42]",
  modified: "border-[#B98335]",
  type: "border-[#7A5C9E]",
};

const TONE_DOT: Record<ChangeTone, string> = {
  neutral: "bg-[#A39B8E]",
  added: "bg-[#32815B]",
  removed: "bg-[#B84C42]",
  modified: "bg-[#B98335]",
  type: "bg-[#7A5C9E]",
};

function JsonGraphNodeInner({ id, data, selected }: NodeProps<Node<JsonGraphNodeData>>) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${data.label}, ${data.type}${data.expandable ? (data.expanded ? ", expanded" : ", collapsed") : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          data.onSelect(id);
        } else if (e.key === "ArrowRight" && data.expandable && !data.expanded) {
          e.preventDefault();
          data.onToggle(id);
        } else if (e.key === "ArrowLeft" && data.expandable && data.expanded) {
          e.preventDefault();
          data.onToggle(id);
        }
      }}
      onClick={() => data.onSelect(id)}
      className={`w-[232px] rounded-xl border-2 bg-white px-2.5 py-2 shadow-sm transition-colors ${TONE_BORDER[data.tone]} ${
        selected ? "ring-4 ring-[#A98450]/40" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 2, height: 2, pointerEvents: "none" }} />
      <div className="flex items-center gap-1.5">
        {data.expandable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onToggle(id);
            }}
            aria-label={data.expanded ? "Collapse" : "Expand"}
            className="shrink-0 rounded p-0.5 text-[10px] leading-none text-[#A39B8E] hover:text-[#27241F] cursor-pointer"
          >
            {data.expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[data.tone]}`} aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#27241F]" title={data.label}>
          {data.label}
        </span>
        <span className="shrink-0 rounded border border-[#E8E2D8] bg-[#F8F6F0] px-1 font-mono text-[10px] text-[#777168]">
          {data.type}
        </span>
      </div>
      <p className="mt-0.5 truncate font-mono text-[11px] text-[#777168]" title={data.preview}>
        {data.expandable
          ? `${data.childCount} ${data.childCount === 1 ? "child" : "children"}${data.hiddenChildren > 0 ? ` · +${data.hiddenChildren} more` : ""}`
          : data.preview === ""
            ? "—"
            : data.preview}
      </p>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 2, height: 2, pointerEvents: "none" }} />
    </div>
  );
}

const JsonGraphNode = memo(JsonGraphNodeInner);

const nodeTypes = { jsonNode: JsonGraphNode };

export interface JsonGraphProps {
  doc: JsonDocument;
  tones?: Map<string, ChangeTone>;
  onRevealInTree?: (path: (string | number)[]) => void;
  /** Controlled selection (Graph Diff sync). Omit for internal state. */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Render subset + ancestors (change-category filters). */
  includeOnly?: Set<string> | null;
}

function layouted(
  doc: JsonDocument,
  expanded: Set<string>,
  tones: Map<string, ChangeTone> | undefined,
  onToggle: (id: string) => void,
  onSelect: (id: string) => void,
  includeOnly?: Set<string> | null
): { nodes: Node<JsonGraphNodeData>[]; edges: Edge[]; pos: Map<string, { x: number; y: number }>; truncated: boolean; visible: number; total: number } {
  const proj = projectGraph(doc, { expanded, tones, includeOnly: includeOnly ?? null });
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 28, ranksep: 64, marginx: 30, marginy: 30 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of proj.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of proj.edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const pos = new Map<string, { x: number; y: number }>();
  const nodes: Node<JsonGraphNodeData>[] = proj.nodes.map((n) => {
    const p = g.node(n.id);
    pos.set(n.id, { x: p.x, y: p.y });
    return {
      id: n.id,
      type: "jsonNode",
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: {
        label: n.label,
        type: n.type,
        preview: n.preview,
        childCount: n.childCount,
        hiddenChildren: n.hiddenChildren,
        expandable: n.expandable,
        expanded: n.expanded,
        tone: n.tone,
        onToggle,
        onSelect,
      },
    };
  });
  const edges: Edge[] = proj.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "default",
    style: { stroke: "#A39B8E", strokeWidth: 1.5 },
  }));
  return { nodes, edges, pos, truncated: proj.truncated, visible: proj.visible, total: proj.total };
}

/**
 * Read-only JSON graph: hierarchical canvas, search across the full
 * model, inspector with copy actions, reveal-in-tree sync.
 */
function JsonGraphFlow({ doc, tones, onRevealInTree, selectedId: controlledId, onSelect, includeOnly }: JsonGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<JsonGraphNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedId = controlledId !== undefined ? controlledId : internalSelectedId;
  const setSelectedId = useCallback(
    (id: string | null) => {
      if (onSelect) onSelect(id);
      else setInternalSelectedId(id);
    },
    [onSelect]
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [hitIndex, setHitIndex] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const posRef = useRef(new Map<string, { x: number; y: number }>());
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { setCenter, fitView, zoomIn, zoomOut } = useReactFlow();

  const onToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Reset expansion when the document identity changes.
  const docKey = `${doc.rootId}:${doc.size}`;
  const [lastDocKey, setLastDocKey] = useState(docKey);
  useEffect(() => {
    if (docKey !== lastDocKey) {
      setLastDocKey(docKey);
      setExpanded(new Set());
      setSelectedId(null);
    }
  }, [docKey, lastDocKey, setSelectedId]);

  const laid = useMemo(
    () => layouted(doc, expanded, tones, onToggle, setSelectedId, includeOnly),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, expanded, tones, includeOnly]
  );

  useEffect(() => {
    posRef.current = laid.pos;
    setNodes(laid.nodes.map((n) => ({ ...n, selected: n.id === selectedId })));
    setEdges(laid.edges);
  }, [laid, selectedId, setNodes, setEdges]);

  // Controlled selection follows with expansion + centering (finding sync).
  const lastFollowed = useRef<string | null>(null);
  useEffect(() => {
    if (controlledId === undefined || controlledId === lastFollowed.current) return;
    lastFollowed.current = controlledId;
    if (!controlledId) return;
    const ancestors = ancestorIds(doc, controlledId);
    if (ancestors.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const a of ancestors) next.add(a);
        return next;
      });
    }
    window.setTimeout(() => {
      const p = posRef.current.get(controlledId);
      if (p) setCenter(p.x, p.y, { zoom: 1, duration: reducedMotion ? 0 : 250 });
    }, 150);
  }, [controlledId, doc, setCenter, reducedMotion]);

  const hits = useMemo(() => searchGraphModel(doc, query, stringifyPath), [doc, query]);

  const gotoHit = useCallback(
    (index: number) => {
      const hit = hits[index];
      if (!hit) return;
      setHitIndex(index);
      // Expand ancestors so the match renders, then center it.
      const ancestors = ancestorIds(doc, hit.id);
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const a of ancestors) next.add(a);
        return next;
      });
      setSelectedId(hit.id);
      window.setTimeout(() => {
        const p = posRef.current.get(hit.id);
        if (p) setCenter(p.x, p.y, { zoom: 1, duration: reducedMotion ? 0 : 250 });
      }, 60);
    },
    [hits, doc, setCenter, reducedMotion, setSelectedId]
  );

  useEffect(() => {
    setHitIndex(0);
  }, [query]);

  const selected = selectedId ? (getNode(doc, selectedId) ?? null) : null;

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  const expandAll = () => {
    const all = new Set<string>();
    for (const n of doc.nodes.values()) {
      if ((n.type === "object" || n.type === "array") && n.children.length > 0) all.add(n.id);
      if (all.size >= 1500) break;
    }
    setExpanded(all);
  };

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-xl border border-[#E8E2D8] bg-[#FAF8F2]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => setSelectedId(node.id)}
        onPaneClick={() => setSelectedId(null)}
        minZoom={0.2}
        fitView
        fitViewOptions={{ padding: 0.15, duration: reducedMotion ? 0 : undefined }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1.2} color="#E3DCCB" bgColor="#FAF8F2" />
        {laid.visible > 50 && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor="#D9CFB6"
            style={{ background: "#FFFFFF", border: "1px solid #E8E2D8", borderRadius: 8 }}
          />
        )}
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>

      {/* Toolbar */}
      <div className="absolute left-3 top-3 z-30 flex flex-wrap items-center gap-1.5">
        <span className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#777168]">
          {laid.visible}/{laid.total} nodes{laid.truncated ? " · capped" : ""}
        </span>
        <button onClick={() => zoomIn({ duration: reducedMotion ? 0 : 200 })} aria-label="Zoom in" title="Zoom in" className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#777168] hover:text-[#27241F] transition-colors cursor-pointer">+</button>
        <button onClick={() => zoomOut({ duration: reducedMotion ? 0 : 200 })} aria-label="Zoom out" title="Zoom out" className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#777168] hover:text-[#27241F] transition-colors cursor-pointer">−</button>
        <button onClick={() => fitView({ padding: 0.15, duration: reducedMotion ? 0 : 250 })} title="Fit to view" className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#777168] hover:text-[#27241F] transition-colors cursor-pointer">Fit</button>
        <button
          onClick={() => {
            setExpanded(new Set());
            setSelectedId(null);
            fitView({ padding: 0.15, duration: reducedMotion ? 0 : 250 });
          }}
          title="Reset view"
          className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#777168] hover:text-[#27241F] transition-colors cursor-pointer"
        >
          Reset
        </button>
        <button onClick={expandAll} title="Expand all (capped)" className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#777168] hover:text-[#27241F] transition-colors cursor-pointer">Expand all</button>
        <button onClick={() => setExpanded(new Set())} title="Collapse all to root" className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#777168] hover:text-[#27241F] transition-colors cursor-pointer">Collapse</button>
      </div>

      {/* Search */}
      <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5">
        <div className="flex items-center gap-1 rounded-lg border border-[#E8E2D8] bg-white px-2 py-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="text-[#A39B8E]">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits.length > 0) gotoHit((hitIndex + 1) % hits.length);
            }}
            placeholder="Search keys, values, paths…"
            aria-label="Search graph"
            spellCheck={false}
            className="w-40 bg-transparent font-mono text-[12px] focus:outline-none"
          />
          {query !== "" && (
            <span className="font-mono text-[10px] text-[#A39B8E]" aria-live="polite">
              {hits.length === 0 ? "0" : `${Math.min(hitIndex + 1, hits.length)}/${hits.length}`}
            </span>
          )}
        </div>
        {hits.length > 0 && (
          <>
            <button onClick={() => gotoHit((hitIndex - 1 + hits.length) % hits.length)} aria-label="Previous match" className="rounded-lg border border-[#E8E2D8] bg-white px-2 py-1 text-[11px] text-[#777168] hover:text-[#27241F] cursor-pointer">↑</button>
            <button onClick={() => gotoHit((hitIndex + 1) % hits.length)} aria-label="Next match" className="rounded-lg border border-[#E8E2D8] bg-white px-2 py-1 text-[11px] text-[#777168] hover:text-[#27241F] cursor-pointer">↓</button>
          </>
        )}
        <button
          onClick={() => setInspectorOpen((v) => !v)}
          aria-pressed={inspectorOpen}
          title="Toggle inspector"
          className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#777168] hover:text-[#27241F] transition-colors cursor-pointer"
        >
          {inspectorOpen ? "Hide panel" : "Inspector"}
        </button>
      </div>

      {/* Inspector */}
      {inspectorOpen && selected && (
        <div className="absolute bottom-3 right-3 top-16 z-30 flex w-72 flex-col overflow-hidden rounded-xl border border-[#E8E2D8] bg-white shadow-sm">
          <div className="border-b border-[#E8E2D8] px-3 py-2">
            <p className="truncate text-[13px] font-semibold text-[#27241F]" title={selected.label}>{selected.label}</p>
            <p className="font-mono text-[10px] text-[#A39B8E]">{selected.type}{selected.key !== null ? ` · key ${JSON.stringify(selected.key)}` : " · root"}</p>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2 text-[12px]">
            <InspectorRow k="Path" v={stringifyPath(selected.path)} mono />
            <InspectorRow k="Parent" v={selected.parent ?? "—"} mono />
            {typeof selected.key === "number" && <InspectorRow k="Index" v={String(selected.key)} mono />}
            {(selected.type === "object" || selected.type === "array") && (
              <InspectorRow k="Children" v={String(selected.children.length)} mono />
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A39B8E]">Value</p>
              <pre className="mt-0.5 max-h-48 overflow-auto rounded-lg bg-[#F8F6F0] p-2 font-mono text-[11px] text-[#27241F]">
                {JSON.stringify(selected.value, null, 2) ?? "—"}
              </pre>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-[#E8E2D8] px-3 py-2">
            <button onClick={() => void copyText(stringifyPath(selected.path), "path")} className="rounded-md border border-[#E8E2D8] px-2 py-1 text-[11px] hover:border-[#A98450] transition-colors cursor-pointer">
              {copied === "path" ? "Copied" : "Copy path"}
            </button>
            <button onClick={() => void copyText(JSON.stringify(selected.value), "value")} className="rounded-md border border-[#E8E2D8] px-2 py-1 text-[11px] hover:border-[#A98450] transition-colors cursor-pointer">
              {copied === "value" ? "Copied" : "Copy JSON value"}
            </button>
            {(selected.type === "object" || selected.type === "array") && (
              <button onClick={() => void copyText(JSON.stringify(selected.value, null, 2), "subtree")} className="rounded-md border border-[#E8E2D8] px-2 py-1 text-[11px] hover:border-[#A98450] transition-colors cursor-pointer">
                {copied === "subtree" ? "Copied" : "Copy subtree"}
              </button>
            )}
            {onRevealInTree && (
              <button onClick={() => onRevealInTree(selected.path)} className="rounded-md bg-[#211F1B] px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 transition-opacity cursor-pointer">
                Reveal in tree
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InspectorRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A39B8E]">{k}</p>
      <p className={`break-all text-[12px] text-[#27241F] ${mono ? "font-mono text-[11px]" : ""}`}>{v}</p>
    </div>
  );
}

export function JsonGraph(props: JsonGraphProps) {
  return (
    <ReactFlowProvider>
      <JsonGraphFlow {...props} />
    </ReactFlowProvider>
  );
}
