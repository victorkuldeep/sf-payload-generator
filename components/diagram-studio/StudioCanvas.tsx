"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, ReactFlow, useNodesState, useReactFlow, type Edge, type Node } from "@xyflow/react";
import { Diamond, RectangleHorizontal, Square, StickyNote } from "lucide-react";
import { systemNodeTypes } from "@/components/system-design/flowRender";
import { SystemGlyph } from "@/components/system-design/SystemNode";
import { SYSTEM_TEMPLATES, type SystemType } from "@/lib/system-design/model";
import {
  blankSketchNode,
  sketchId,
  type SketchNodeKind,
  type StudioSketch,
} from "@/lib/diagram-studio/sketch";
import { registerSketchBridge, sketchSnapshotOf } from "@/lib/ai/sketchBridge";
import { studioNodeTypes } from "./StudioFlowNode";
import Button from "../ui/Button";

/**
 * Studio sketch canvas: freehand architecture drawing. System boxes reuse
 * the System glyphs (sketches already look like System); flowchart shapes
 * are studio-only. Links are static - no animation, no run state.
 */

const SYSTEM_BUTTONS: { systemType: SystemType; label: string }[] = [
  { systemType: "salesforce", label: "Salesforce" },
  { systemType: "middleware", label: "Middleware" },
  { systemType: "rest", label: "REST API" },
  { systemType: "saas", label: "SaaS" },
  { systemType: "queue", label: "Queue" },
  { systemType: "database", label: "Database" },
  { systemType: "custom", label: "Custom" },
];

const SHAPE_BUTTONS: { kind: Exclude<SketchNodeKind, "system">; label: string; Icon: typeof Square }[] = [
  { kind: "process", label: "Process", Icon: Square },
  { kind: "decision", label: "Decision", Icon: Diamond },
  { kind: "terminator", label: "Terminator", Icon: RectangleHorizontal },
  { kind: "note", label: "Note", Icon: StickyNote },
];

function iconOf(systemType: SystemType | undefined): string {
  return SYSTEM_TEMPLATES.find((t) => t.systemType === systemType)?.iconKey ?? "plus";
}

function templateName(systemType: SystemType): string {
  return SYSTEM_TEMPLATES.find((t) => t.systemType === systemType)?.name ?? "Custom System";
}

const allNodeTypes = { ...systemNodeTypes, ...studioNodeTypes };

type Sel = { nodes: string[]; edges: string[] };

export function StudioCanvas({
  sketch,
  onChange,
}: {
  sketch: StudioSketch;
  onChange: (next: StudioSketch) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const sketchRef = useRef(sketch);
  useEffect(() => {
    sketchRef.current = sketch;
  }, [sketch]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>({ nodes: [], edges: [] });
  const [past, setPast] = useState<StudioSketch[]>([]);
  const [future, setFuture] = useState<StudioSketch[]>([]);
  const draggingRef = useRef(false);

  const commit = useCallback(
    (next: StudioSketch, undoable = true) => {
      if (undoable) {
        setPast((p) => [...p.slice(-49), sketchRef.current]);
        setFuture([]);
      }
      onChange(next);
    },
    [onChange]
  );

  const undo = useCallback(() => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [sketchRef.current, ...f].slice(0, 50));
    onChange(prev);
  }, [past, onChange]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, sketchRef.current]);
    onChange(next);
  }, [future, onChange]);

  // AI bridge: the agent draws through the same commit path (undoable).
  useEffect(() => {
    registerSketchBridge({
      getSnapshot: () => sketchSnapshotOf(sketchRef.current),
      getSketch: () => sketchRef.current,
      apply: (fn) => {
        try {
          commit(fn(sketchRef.current));
          return { ok: true };
        } catch {
          return { ok: false, error: "Sketch apply failed." };
        }
      },
    });
    return () => registerSketchBridge(null);
  }, [commit, sketch.id]);

  const commitNote = useCallback(
    (id: string, text: string) => {
      setEditingId(null);
      const cur = sketchRef.current.nodes.find((n) => n.id === id);
      if (!cur || cur.label === text) return;
      commit({ ...sketchRef.current, nodes: sketchRef.current.nodes.map((n) => (n.id === id ? { ...n, label: text } : n)) });
    },
    [commit]
  );

  const rfNodes: Node[] = useMemo(
    () =>
      sketch.nodes.map((n): Node => {
        const position = { x: n.x, y: n.y };
        if (n.kind === "system") {
          return {
            id: n.id,
            type: "system",
            position,
            data: { name: n.label, systemType: n.systemType ?? "custom", iconKey: iconOf(n.systemType), draft: true },
          };
        }
        if (n.kind === "note") {
          return {
            id: n.id,
            type: "note",
            position,
            data: {
              text: n.label,
              editing: editingId === n.id,
              onBeginEdit: () => setEditingId(n.id),
              onCommit: (text: string) => commitNote(n.id, text),
              onCancel: () => setEditingId(null),
            },
          };
        }
        return { id: n.id, type: `flow-${n.kind}`, position, data: { label: n.label } };
      }),
    [sketch, editingId, commitNote]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      sketch.edges.map((e) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        label: e.label || undefined,
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        labelBgStyle: { fill: "#FFFFFF", fillOpacity: 0.95 },
        labelStyle: { fontSize: 11, fontFamily: "monospace" },
        style: { stroke: "#8A8070", strokeWidth: 1.5 },
      })),
    [sketch]
  );

  // ERD pattern: nodes live in React Flow local state so drags track the
  // pointer with zero global churn; the sketch commits once on drag stop.
  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  useEffect(() => {
    if (!draggingRef.current) setNodes(rfNodes);
  }, [rfNodes, setNodes]);
  void nodes;

  const place = useCallback(
    (kind: SketchNodeKind, systemType?: SystemType, label?: string) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.width / 2, y: rect.height / 2 })
        : { x: 400, y: 300 };
      const count = sketchRef.current.nodes.length;
      const at = { x: center.x + ((count % 5) - 2) * 40, y: center.y + (Math.floor(count / 5) % 5) * 40 - 40 };
      const node = {
        ...blankSketchNode(kind, at),
        label: label ?? (kind === "system" ? templateName(systemType ?? "custom") : blankSketchNode(kind, at).label),
        systemType: kind === "system" ? (systemType ?? "custom") : undefined,
      };
      commit({ ...sketchRef.current, nodes: [...sketchRef.current.nodes, node] });
    },
    [commit, screenToFlowPosition]
  );

  const onConnectCommit = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      commit({
        ...sketchRef.current,
        edges: [...sketchRef.current.edges, { id: sketchId("ske"), sourceId, targetId, label: "" }],
      });
    },
    [commit]
  );

  const removeSelection = useCallback(() => {
    const cur = sketchRef.current;
    if (sel.nodes.length === 0 && sel.edges.length === 0) return;
    const dead = new Set(sel.nodes);
    commit({
      ...cur,
      nodes: cur.nodes.filter((n) => !dead.has(n.id)),
      edges: cur.edges.filter((e) => !dead.has(e.sourceId) && !dead.has(e.targetId) && !sel.edges.includes(e.id)),
    });
    setSel({ nodes: [], edges: [] });
  }, [sel, commit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && (sel.nodes.length > 0 || sel.edges.length > 0)) {
        e.preventDefault();
        removeSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, undo, redo, removeSelection]);

  const selNode = sketch.nodes.find((n) => n.id === sel.nodes[0]) ?? null;
  const selEdge = sketch.edges.find((e) => e.id === sel.edges[0]) ?? null;

  const setNodeLabel = (id: string, label: string) => {
    const cur = sketchRef.current.nodes.find((n) => n.id === id);
    if (!cur || cur.label === label) return;
    commit({ ...sketchRef.current, nodes: sketchRef.current.nodes.map((n) => (n.id === id ? { ...n, label } : n)) });
  };

  const setNodeSystemType = (id: string, systemType: SystemType) => {
    commit({
      ...sketchRef.current,
      nodes: sketchRef.current.nodes.map((n) => (n.id === id ? { ...n, systemType, label: n.label } : n)),
    });
  };

  const setEdgeLabel = (id: string, label: string) => {
    const cur = sketchRef.current.edges.find((e) => e.id === id);
    if (!cur || cur.label === label) return;
    commit({ ...sketchRef.current, edges: sketchRef.current.edges.map((e) => (e.id === id ? { ...e, label } : e)) });
  };

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-3">
      <div className="flex w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto rounded-xl border border-[#E8E2D8] bg-white p-1.5" role="toolbar" aria-label="Sketch palette">
        <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#A39B8E]">Sys</p>
        {SYSTEM_BUTTONS.map((b) => (
          <button
            key={b.systemType}
            type="button"
            title={`Place ${b.label}`}
            aria-label={`Place ${b.label}`}
            onClick={() => place("system", b.systemType)}
            className="rounded-lg border border-transparent p-1.5 text-[#777168] hover:border-[#E8E2D8] hover:text-[#27241F] transition-colors cursor-pointer"
          >
            <SystemGlyph iconKey={SYSTEM_TEMPLATES.find((t) => t.systemType === b.systemType)?.iconKey ?? "plus"} />
          </button>
        ))}
        <p className="mt-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#A39B8E]">Flow</p>
        {SHAPE_BUTTONS.map(({ kind, label, Icon }) => (
          <button
            key={kind}
            type="button"
            title={`Place ${label}`}
            aria-label={`Place ${label}`}
            onClick={() => place(kind)}
            className="rounded-lg border border-transparent p-1.5 text-[#777168] hover:border-[#E8E2D8] hover:text-[#27241F] transition-colors cursor-pointer"
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        ))}
        <p className="mt-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#A39B8E]">Edit</p>
        <button
          type="button"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          onClick={undo}
          disabled={past.length === 0}
          className="rounded-lg border border-transparent p-1.5 text-[#777168] hover:border-[#E8E2D8] hover:text-[#27241F] transition-colors cursor-pointer disabled:opacity-40"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
        </button>
        <button
          type="button"
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          onClick={redo}
          disabled={future.length === 0}
          className="rounded-lg border border-transparent p-1.5 text-[#777168] hover:border-[#E8E2D8] hover:text-[#27241F] transition-colors cursor-pointer disabled:opacity-40"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></svg>
        </button>
      </div>

      <div ref={containerRef} className="relative min-h-[420px] min-w-0 flex-1 overflow-hidden rounded-xl border border-[#E8E2D8] bg-[#FAF8F2]">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={allNodeTypes}
          onConnect={(c) => {
            if (c.source && c.target) onConnectCommit(c.source, c.target);
          }}
          onSelectionChange={({ nodes: sn, edges: se }) => setSel({ nodes: sn.map((n) => n.id), edges: se.map((e) => e.id) })}
          onNodeDragStart={() => {
            draggingRef.current = true;
          }}
          onNodeDragStop={(_, node) => {
            draggingRef.current = false;
            const live = new Map(getNodes().map((n) => [n.id, n.position]));
            const pos = live.get(node.id);
            if (!pos) return;
            const cur = sketchRef.current.nodes.find((n) => n.id === node.id);
            if (!cur || (cur.x === Math.round(pos.x) && cur.y === Math.round(pos.y))) return;
            commit({
              ...sketchRef.current,
              nodes: sketchRef.current.nodes.map((n) => (n.id === node.id ? { ...n, x: Math.round(pos.x), y: Math.round(pos.y) } : n)),
            });
          }}
          onNodesChange={onNodesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
        >
          <Background gap={22} size={1.2} color="#DDD3BC" bgColor="#FAF8F2" />
        </ReactFlow>
      </div>

      <aside className="flex w-60 shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-[#E8E2D8] bg-white p-3" aria-label="Sketch inspector">
        {selNode ? (
          <>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-[#A39B8E]">
              {selNode.kind === "system" ? "System box" : selNode.kind === "note" ? "Note" : "Flow shape"}
            </p>
            <label className="block text-[12px] font-semibold text-[#27241F]">
              Label
              <input
                key={selNode.id}
                defaultValue={selNode.label}
                onBlur={(e) => setNodeLabel(selNode.id, e.target.value.trim() || selNode.label)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="mt-1 w-full rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[13px] font-normal focus:border-[#A98450] focus:outline-none"
              />
            </label>
            {selNode.kind === "system" && (
              <label className="block text-[12px] font-semibold text-[#27241F]">
                Type
                <select
                  value={selNode.systemType ?? "custom"}
                  onChange={(e) => setNodeSystemType(selNode.id, e.target.value as SystemType)}
                  className="mt-1 w-full rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[13px] font-normal focus:border-[#A98450] focus:outline-none"
                >
                  {SYSTEM_TEMPLATES.map((t) => (
                    <option key={t.systemType} value={t.systemType}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button size="sm" variant="ghost" onClick={removeSelection}>
              Delete selected
            </Button>
          </>
        ) : selEdge ? (
          <>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-[#A39B8E]">Link</p>
            <label className="block text-[12px] font-semibold text-[#27241F]">
              Label
              <input
                key={selEdge.id}
                defaultValue={selEdge.label}
                placeholder="e.g. Create Order"
                onBlur={(e) => setEdgeLabel(selEdge.id, e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="mt-1 w-full rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[13px] font-normal focus:border-[#A98450] focus:outline-none"
              />
            </label>
            <Button size="sm" variant="ghost" onClick={removeSelection}>
              Delete selected
            </Button>
          </>
        ) : (
          <>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-[#A39B8E]">Inspector</p>
            <p className="text-[12px] leading-relaxed text-[#777168]">
              {sel.nodes.length + sel.edges.length > 1
                ? `${sel.nodes.length + sel.edges.length} selected - Delete removes them all.`
                : "Pick a palette box to place it, drag between boxes to link, click anything to edit its label."}
            </p>
            {(sel.nodes.length + sel.edges.length > 1) && (
              <Button size="sm" variant="ghost" onClick={removeSelection}>
                Delete selected
              </Button>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
