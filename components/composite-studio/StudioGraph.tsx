"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { SalesforceDescribeResult } from "@/lib/salesforce/types";
import { getWritableFields } from "@/lib/salesforce/metadata";
import type { StudioDocument, StudioIssue, StudioMapping } from "@/lib/composite/studio";
import Button from "../ui/Button";

interface StudioGraphNodeData extends Record<string, unknown> {
  seq: number;
  method: string;
  label: string;
  apiName: string;
  referenceId: string;
  fieldCount: number;
  inCount: number;
  outCount: number;
  hasError: boolean;
  hasWarning: boolean;
}

interface StudioGraphProps {
  doc: StudioDocument;
  describes: Map<string, SalesforceDescribeResult>;
  issues: StudioIssue[];
  onEditRequest: (id: string) => void;
  onDuplicate: (id: string, withLinks: boolean) => void;
  onDelete: (id: string) => void;
  onPosition: (id: string, pos: { x: number; y: number }) => void;
  onResetLayout: () => void;
  onCreateMapping: (targetRequestId: string, targetField: string, sourceRequestId: string, sourceProperty: string) => void;
  onRemoveMapping: (mappingId: string, clearValue: boolean) => void;
  onAddRequest: () => void;
}

const NODE_W = 248;
const NODE_H = 112;
const X_GAP = 120;
const Y_GAP = 40;

/** Longest-path layer per request (sources = 0). Independents get -1. */
function computeLayers(doc: StudioDocument): Map<string, number> {
  const depth = new Map(doc.requests.map((r) => [r.id, -1]));
  const linked = new Set<string>();
  for (const m of doc.mappings) {
    linked.add(m.sourceRequestId);
    linked.add(m.targetRequestId);
  }
  const incoming = new Map<string, string[]>();
  for (const r of doc.requests) incoming.set(r.id, []);
  for (const m of doc.mappings) incoming.get(m.targetRequestId)?.push(m.sourceRequestId);
  const visit = (id: string, stack: Set<string>): number => {
    const known = depth.get(id) ?? -1;
    if (known >= 0) return known;
    if (stack.has(id)) return 0;
    stack.add(id);
    let d = 0;
    for (const s of incoming.get(id) ?? []) {
      if (!linked.has(s)) continue;
      d = Math.max(d, visit(s, stack) + 1);
    }
    stack.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const r of doc.requests) {
    if (linked.has(r.id)) visit(r.id, new Set());
  }
  return depth;
}

function StudioGraphFlow(props: StudioGraphProps) {
  const { doc, describes, issues } = props;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioGraphNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectedPair, setInspectedPair] = useState<string | null>(null);
  const [showIndependents, setShowIndependents] = useState(true);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<{ sourceId: string; targetId: string; field: string; prop: string } | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);

  const issuesByReq = useMemo(() => {
    const m = new Map<string, { error: boolean; warning: boolean }>();
    for (const i of issues) {
      if (!i.requestId) continue;
      const cur = m.get(i.requestId) ?? { error: false, warning: false };
      if (i.level === "error") cur.error = true;
      else cur.warning = true;
      m.set(i.requestId, cur);
    }
    return m;
  }, [issues]);

  const inOut = useMemo(() => {
    const m = new Map<string, { in: number; out: number }>();
    for (const r of doc.requests) m.set(r.id, { in: 0, out: 0 });
    for (const mp of doc.mappings) {
      const s = m.get(mp.sourceRequestId);
      const t = m.get(mp.targetRequestId);
      if (s) s.out += 1;
      if (t) t.in += 1;
    }
    return m;
  }, [doc.requests, doc.mappings]);

  // Deterministic layered auto-layout; user drags persist in request.position.
  const autoPositions = useMemo(() => {
    const layers = computeLayers(doc);
    const pos = new Map<string, { x: number; y: number }>();
    const byLayer = new Map<number, string[]>();
    for (const r of doc.requests) {
      const d = layers.get(r.id) ?? -1;
      if (d < 0) continue;
      if (!byLayer.has(d)) byLayer.set(d, []);
      byLayer.get(d)?.push(r.id);
    }
    const depths = [...byLayer.keys()].sort((a, b) => a - b);
    let cursorY = 0;
    for (const d of depths) {
      const ids = byLayer.get(d) ?? [];
      ids.forEach((id, k) => {
        pos.set(id, { x: 60 + d * (NODE_W + X_GAP), y: cursorY + k * (NODE_H + Y_GAP) });
      });
      cursorY += ids.length * (NODE_H + Y_GAP) + Y_GAP * 2;
    }
    // Independent lane: grid band below the layered graph.
    const independents = doc.requests.filter((r) => (layers.get(r.id) ?? -1) < 0);
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, independents.length))));
    independents.forEach((r, k) => {
      pos.set(r.id, {
        x: 60 + (k % cols) * (NODE_W + 48),
        y: cursorY + 90 + Math.floor(k / cols) * (NODE_H + Y_GAP),
      });
    });
    return { pos, laneY: cursorY + 40, laneCount: independents.length };
  }, [doc]);

  useEffect(() => {
    const built: Node<StudioGraphNodeData>[] = [];
    const layers = computeLayers(doc);
    doc.requests.forEach((r, i) => {
      const independent = (layers.get(r.id) ?? -1) < 0;
      if (independent && !showIndependents) return;
      const saved = r.position;
      const auto = autoPositions.pos.get(r.id) ?? { x: 60, y: 60 };
      const flags = issuesByReq.get(r.id) ?? { error: false, warning: false };
      const io = inOut.get(r.id) ?? { in: 0, out: 0 };
      built.push({
        id: r.id,
        type: "studioNode",
        position: saved ?? auto,
        selected: r.id === selectedNodeId,
        data: {
          seq: i + 1,
          method: r.method,
          label: r.displayName || r.objectLabel || "Untitled",
          apiName: r.objectApiName,
          referenceId: r.referenceId,
          fieldCount: r.fields.length,
          inCount: io.in,
          outCount: io.out,
          hasError: flags.error,
          hasWarning: !flags.error && flags.warning,
        },
      });
    });
    // Lane label for the independent band.
    if (showIndependents && autoPositions.laneCount > 0) {
      built.push({
        id: "__lane__",
        type: "laneLabel",
        position: { x: 60, y: autoPositions.laneY },
        selectable: false,
        draggable: false,
        data: {} as StudioGraphNodeData,
      });
    }
    setNodes(built);

    // Bundle same-pair mappings into one edge with a count.
    const groups = new Map<string, StudioMapping[]>();
    for (const m of doc.mappings) {
      const key = `${m.sourceRequestId}→${m.targetRequestId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(m);
    }
    const builtEdges: Edge[] = [];
    for (const [key, ms] of groups) {
      const [s, t] = key.split("→");
      if (!doc.requests.some((r) => r.id === s) || !doc.requests.some((r) => r.id === t)) continue;
      const first = ms[0];
      builtEdges.push({
        id: `e:${key}`,
        source: s,
        target: t,
        type: "default",
        animated: false,
        label: ms.length > 1 ? `${first.targetFieldApiName} +${ms.length - 1}` : first.targetFieldApiName,
        labelStyle: { fontSize: 10, fontFamily: "monospace", fill: "#A98450" },
        labelBgStyle: { fill: "#FFFFFF", fillOpacity: 0.92 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#A39B8E", width: 18, height: 18 },
        style: { stroke: "#A39B8E", strokeWidth: inspectedPair === key ? 2.6 : 1.6 },
        data: { mappingIds: ms.map((x) => x.id) },
      });
    }
    setEdges(builtEdges);
  }, [doc, autoPositions, issuesByReq, inOut, selectedNodeId, inspectedPair, showIndependents, setNodes, setEdges]);

  const openLinkDraft = useCallback((sourceId: string, targetId: string) => {
    setLinkDraft({ sourceId, targetId, field: "", prop: "id" });
    setConnectFrom(null);
  }, []);

  const onConnect = useCallback(
    (conn: { source: string | null; target: string | null }) => {
      if (conn.source && conn.target && conn.source !== conn.target) {
        openLinkDraft(conn.source, conn.target);
      }
    },
    [openLinkDraft]
  );

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (node.id === "__lane__") return;
      if (connectFrom && connectFrom !== node.id) {
        openLinkDraft(connectFrom, node.id);
        return;
      }
      setSelectedNodeId(node.id);
      setInspectedPair(null);
    },
    [connectFrom, openLinkDraft]
  );

  const onEdgeClick = useCallback((_: unknown, edge: Edge) => {
    const key = String(edge.id).replace(/^e:/, "");
    setInspectedPair(key);
    setSelectedNodeId(null);
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (node.id === "__lane__") return;
      props.onPosition(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) });
    },
    [props]
  );

  const selectedReq = doc.requests.find((r) => r.id === selectedNodeId) ?? null;
  const pairMappings = inspectedPair
    ? doc.mappings.filter((m) => `${m.sourceRequestId}→${m.targetRequestId}` === inspectedPair)
    : [];
  const draftTargetDesc = linkDraft ? describes.get(doc.requests.find((r) => r.id === linkDraft.targetId)?.objectApiName ?? "") : undefined;
  const draftFields = draftTargetDesc ? getWritableFields(draftTargetDesc.fields, "POST") : [];
  const draftSource = linkDraft ? doc.requests.find((r) => r.id === linkDraft.sourceId) : undefined;

  const errCount = issues.filter((i) => i.level === "error").length;
  const warnCount = issues.filter((i) => i.level === "warning").length;

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-xl border border-[#E8E2D8] bg-[#F8F6F0]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => {
          setSelectedNodeId(null);
          setInspectedPair(null);
          setConnectFrom(null);
        }}
        onNodeDragStop={onNodeDragStop}
        nodesConnectable
        minZoom={0.2}
        fitView
        fitViewOptions={{ padding: 0.15 }}
      >
        <Background gap={24} size={1.2} color="#E3DCCB" bgColor="#F8F6F0" />
        {nodes.length > 8 && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor="#D9CFB6"
            style={{ background: "#FFFFFF", border: "1px solid #E8E2D8", borderRadius: 8 }}
          />
        )}
        <Controls position="bottom-left" />
      </ReactFlow>

      {/* Toolbar */}
      <div className="absolute left-3 top-3 z-30 flex flex-wrap items-center gap-1.5">
        <span className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#777168]">
          {doc.requests.length} nodes · {doc.mappings.length} links
        </span>
        <button
          onClick={() => props.onResetLayout()}
          title="Re-run layered auto-layout"
          className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#777168] hover:text-[#27241F] transition-colors cursor-pointer"
        >
          Auto-layout
        </button>
        <button
          onClick={() => setShowIndependents((v) => !v)}
          aria-pressed={showIndependents}
          title="Show or hide independent requests"
          className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#777168] hover:text-[#27241F] transition-colors cursor-pointer"
        >
          {showIndependents ? "Hide" : "Show"} independents
        </button>
        <button
          onClick={() => props.onAddRequest()}
          title="Add a request (Requests screen)"
          className="rounded-lg bg-[#211F1B] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 transition-opacity cursor-pointer"
        >
          + Add request
        </button>
        {(errCount > 0 || warnCount > 0) && (
          <span className="rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[11px] font-medium">
            {errCount > 0 && <span className="text-[#B84C42]">{errCount} error{errCount === 1 ? "" : "s"}</span>}
            {errCount > 0 && warnCount > 0 && <span className="text-[#A39B8E]"> · </span>}
            {warnCount > 0 && <span className="text-[#B98335]">{warnCount} warning{warnCount === 1 ? "" : "s"}</span>}
          </span>
        )}
      </div>

      {/* Connect mode banner */}
      {connectFrom && (
        <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-lg border border-[#D8C7A9] bg-[#F5F1E8] px-3 py-1.5 text-[11px] font-medium text-[#A98450]">
          Linking from @{doc.requests.find((r) => r.id === connectFrom)?.referenceId} - click a target node
          <button onClick={() => setConnectFrom(null)} className="ml-2 underline cursor-pointer">cancel</button>
        </div>
      )}

      {/* Node inspector */}
      {selectedReq && (
        <div className="absolute right-3 top-3 z-30 w-64 rounded-xl border border-[#E8E2D8] bg-white p-3 shadow-sm">
          <p className="font-mono text-[11px] text-[#A39B8E]">#{doc.requests.findIndex((r) => r.id === selectedReq.id) + 1}</p>
          <p className="truncate text-[14px] font-semibold text-[#27241F]">
            {selectedReq.displayName || selectedReq.objectLabel || "Untitled"}
          </p>
          <p className="truncate font-mono text-[11px] text-[#A98450]">@{selectedReq.referenceId}</p>
          <p className="mt-1 text-[11px] text-[#777168]">
            {selectedReq.method} · {selectedReq.fields.length} fields · ⬦{inOut.get(selectedReq.id)?.in ?? 0} in / {inOut.get(selectedReq.id)?.out ?? 0} out
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Button size="sm" onClick={() => props.onEditRequest(selectedReq.id)}>Edit</Button>
            <Button variant="secondary" size="sm" onClick={() => setConnectFrom(selectedReq.id)}>Connect…</Button>
            <Button variant="secondary" size="sm" onClick={() => props.onDuplicate(selectedReq.id, false)}>Duplicate</Button>
            <Button variant="ghost" size="sm" onClick={() => { props.onDelete(selectedReq.id); setSelectedNodeId(null); }}>Delete</Button>
          </div>
        </div>
      )}

      {/* Edge inspector */}
      {pairMappings.length > 0 && (
        <div className="absolute right-3 top-3 z-30 w-72 rounded-xl border border-[#E8E2D8] bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[#A39B8E]">
            {pairMappings.length} mapping{pairMappings.length === 1 ? "" : "s"}
          </p>
          <div className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto">
            {pairMappings.map((m) => {
              const src = doc.requests.find((r) => r.id === m.sourceRequestId);
              const dst = doc.requests.find((r) => r.id === m.targetRequestId);
              return (
                <div key={m.id} className="rounded-lg border border-[#E8E2D8] p-2">
                  <p className="font-mono text-[11px] text-[#27241F]">{m.targetFieldApiName}</p>
                  <p className="font-mono text-[11px] text-[#A98450]">
                    @{src?.referenceId}.{m.sourceProperty}
                  </p>
                  <p className="text-[10px] text-[#A39B8E]">
                    {src?.displayName || src?.objectLabel} → {dst?.displayName || dst?.objectLabel}
                  </p>
                  {!confirmUnlink || confirmUnlink !== m.id ? (
                    <button onClick={() => setConfirmUnlink(m.id)} className="mt-1 text-[11px] text-[#B84C42] hover:underline cursor-pointer">
                      Remove link
                    </button>
                  ) : (
                    <span className="mt-1 flex gap-1.5">
                      <button onClick={() => { props.onRemoveMapping(m.id, true); setConfirmUnlink(null); }} className="rounded border border-[#E8E2D8] px-1.5 py-0.5 text-[11px] hover:border-[#B84C42] hover:text-[#B84C42] cursor-pointer">
                        Clear value
                      </button>
                      <button onClick={() => { props.onRemoveMapping(m.id, false); setConfirmUnlink(null); }} className="rounded border border-[#E8E2D8] px-1.5 py-0.5 text-[11px] hover:border-[#B84C42] hover:text-[#B84C42] cursor-pointer">
                        Keep as text
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mapping popover (graph connect path) */}
      {linkDraft && (
        <div className="absolute left-1/2 top-1/2 z-40 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#D8C7A9] bg-white p-4 shadow-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[#A98450]">New link</p>
          <p className="mt-1 text-[13px] text-[#27241F]">
            <span className="font-mono">@{draftSource?.referenceId}</span>
            <span className="mx-1 text-[#A39B8E]">→</span>
            <span className="font-medium">{doc.requests.find((r) => r.id === linkDraft.targetId)?.displayName || "target"}</span>
          </p>
          <label className="mt-2 block">
            <span className="mb-0.5 block text-[11px] text-[#777168]">Destination field</span>
            <select
              value={linkDraft.field}
              onChange={(e) => setLinkDraft({ ...linkDraft, field: e.target.value })}
              className="w-full rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 font-mono text-[13px] cursor-pointer"
            >
              <option value="">Choose a field…</option>
              {draftFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}{f.type === "reference" ? "  · ref" : ""}
                </option>
              ))}
            </select>
          </label>
          {draftFields.length === 0 && (
            <p className="mt-1 text-[11px] text-[#B98335]">Target has no loaded metadata - pick the object first.</p>
          )}
          <label className="mt-2 block">
            <span className="mb-0.5 block text-[11px] text-[#777168]">Source property</span>
            <input
              value={linkDraft.prop}
              onChange={(e) => setLinkDraft({ ...linkDraft, prop: e.target.value })}
              placeholder="id"
              className="w-full rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 font-mono text-[13px] focus:border-[#A98450] focus:outline-none"
            />
          </label>
          {linkDraft.field !== "" && (
            <p className="mt-1.5 font-mono text-xs text-[#A98450]">
              {linkDraft.field} = @{draftSource?.referenceId}.{linkDraft.prop || "id"}
            </p>
          )}
          <div className="mt-2 flex gap-1.5">
            <Button
              size="sm"
              disabled={linkDraft.field === ""}
              onClick={() => {
                props.onCreateMapping(linkDraft.targetId, linkDraft.field, linkDraft.sourceId, linkDraft.prop.trim() || "id");
                setLinkDraft(null);
              }}
            >
              Apply link
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLinkDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StudioGraphNode({ data }: { data: StudioGraphNodeData }) {
  return (
    <div
      className={`w-[248px] rounded-xl border-2 bg-white px-3 py-2.5 shadow-sm transition-colors ${
        data.hasError ? "border-[#B84C42]" : data.hasWarning ? "border-[#B98335]" : "border-[#E8E2D8]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-[#A39B8E]">{String(data.seq).padStart(2, "0")}</span>
        <span className="rounded border border-[#E8E2D8] bg-[#F8F6F0] px-1 font-mono text-[10px] font-bold text-[#27241F]">{data.method}</span>
        {(data.hasError || data.hasWarning) && (
          <span className={`h-2 w-2 rounded-full ${data.hasError ? "bg-[#B84C42]" : "bg-[#B98335]"}`} />
        )}
      </div>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-[#27241F]">{data.label}</p>
      <p className="truncate font-mono text-[10px] text-[#A39B8E]">{data.apiName}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="truncate font-mono text-[11px] text-[#A98450]">@{data.referenceId}</span>
        <span className="text-[10px] text-[#A39B8E]">
          {data.fieldCount}f · ⬦{data.inCount}/{data.outCount}
        </span>
      </div>
    </div>
  );
}

function LaneLabel() {
  return (
    <div className="rounded-lg border border-dashed border-[#D8C7A9] bg-[#F5F1E8]/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[1.6px] text-[#A98450]">
      Independent requests - no links, always valid
    </div>
  );
}

const nodeTypes = {
  studioNode: StudioGraphNode,
  laneLabel: LaneLabel,
};

export default function StudioGraph(props: StudioGraphProps) {
  return (
    <ReactFlowProvider>
      <StudioGraphFlow {...props} />
    </ReactFlowProvider>
  );
}
