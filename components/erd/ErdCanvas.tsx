"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";
import type { ErdNodeData, GraphBubbleData } from "@/lib/erd/graph";
import { ErdTableNode } from "./ErdTableNode";
import { ErdEdge } from "./ErdEdge";
import { GraphBubbleNode } from "./GraphBubbleNode";

const nodeTypes = { erdTable: ErdTableNode, graphBubble: GraphBubbleNode } as const;
const edgeTypes = { erdEdge: ErdEdge } as const;

export interface ErdCanvasHandle {
  getNodes: () => Node<ErdNodeData | GraphBubbleData>[];
}

interface ErdCanvasProps {
  nodes: Node<ErdNodeData | GraphBubbleData>[];
  edges: Edge[];
  onNodeClick?: (id: string) => void;
  onPaneClick?: () => void;
  onViewportMove?: () => void;
  onNodeDragStop?: (id: string, position: { x: number; y: number }) => void;
  /** Bump to force a fresh auto-layout. Unchanged revisions preserve drag positions. */
  layoutRev: number;
  /** Explicit positions (snapshot restore) applied on top of the fresh layout. */
  enforcedPositions?: Map<string, { x: number; y: number }> | null;
  /** Restored viewport (zoom memory across view switches). Omit to fit. */
  storedViewport?: { x: number; y: number; zoom: number } | null;
  onViewportChange?: (v: { x: number; y: number; zoom: number }) => void;
}

interface Stroke {
  id: number;
  pts: { x: number; y: number }[];
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function pngFileName(scale: 2 | 3): string {
  const d = new Date();
  const pad = (v: number) => String(v).padStart(2, "0");
  return `salesforce-erd-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}@${scale}x.png`;
}

const ErdFlow = forwardRef<ErdCanvasHandle, ErdCanvasProps>(function ErdFlow(
  { nodes: propNodes, edges: propEdges, onNodeClick, onPaneClick, onViewportMove, onNodeDragStop, layoutRev, enforcedPositions, storedViewport, onViewportChange },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ErdNodeData | GraphBubbleData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();
  const lastRev = useRef(layoutRev);
  // Refit only when the graph SHAPE changes (count, view type, explicit
  // re-layout) - never on data-only refreshes, so zoom is never stolen.
  const fitSig = useRef("");

  // Live mirror for snapshot saves (drag positions included)
  const nodesRef = useRef<Node<ErdNodeData | GraphBubbleData>[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useImperativeHandle(
    ref,
    () => ({
      getNodes: () => nodesRef.current,
    }),
    []
  );

  const [laser, setLaser] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokeId = useRef(0);
  const drawing = useRef(false);
  // Drag-lock is OURS: freezing node displacement only, pan/zoom always
  // alive. The built-in freeze-everything lock sits below it in Controls;
  // its state is mirrored above so it never slips silently.
  const [nodesLocked, setNodesLocked] = useState(false);
  // Mirror of the built-in freeze-everything lock: mirrored into state so a
  // parent re-render can never silently unlock it behind the user's back.
  const [fullLocked, setFullLocked] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (enforcedPositions) {
      // Snapshot restore: fresh layout underneath, saved drag positions on top
      setNodes(
        propNodes.map((n) => {
          const p = enforcedPositions.get(n.id);
          return p ? { ...n, position: { ...p } } : n;
        })
      );
      setEdges(propEdges);
      lastRev.current = layoutRev;
    } else if (lastRev.current !== layoutRev) {
      // Explicit re-layout (discover, reset, fresh add)
      lastRev.current = layoutRev;
      setNodes(propNodes);
      setEdges(propEdges);
    } else {
      // Same revision (e.g. metadata refresh): keep every dragged position,
      // adopt fresh positions only for brand-new nodes
      setNodes((prev) => {
        const current = new Map(prev.map((p) => [p.id, p.position] as const));
        return propNodes.map((n) => {
          const p = current.get(n.id);
          return p ? { ...n, position: p } : n;
        });
      });
      setEdges(propEdges);
    }
    // Refit ONLY on view-type switch, explicit re-layout, or restore - NEVER
    // on node-count changes (adds, removes, filters, expansions) and never on
    // selection/spotlight: your zoom is sacred and stays put while scouting.
    // With a stored viewport (memory across switches) skip fitting entirely -
    // defaultViewport below restores it on mount.
    const sig = `${propNodes[0]?.type ?? ""}:${layoutRev}:${enforcedPositions ? "e" : ""}:${storedViewport ? "m" : "f"}`;
    if (sig !== fitSig.current) {
      fitSig.current = sig;
      if (storedViewport) return undefined;
      const t = window.setTimeout(() => fitView({ padding: 0.18, maxZoom: 1 }), 60);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [propNodes, propEdges, layoutRev, enforcedPositions, storedViewport, setNodes, setEdges, fitView]);

  useEffect(() => {
    if (!laser) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLaser(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [laser]);

  // "L" toggles the laser (Excalidraw-style): press to present, Esc to scroll again.
  // Ignored while typing or with modifier keys held. ⌘K stays as object find.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== "l") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      setLaser((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const doExport = useCallback(
    async (scale: 2 | 3) => {
      setExporting(true);
      setExportError(null);
      try {
        const viewportEl = containerRef.current?.querySelector(".react-flow__viewport");
        if (!viewportEl) throw new Error("Canvas not ready");
        const bounds = getNodesBounds(nodes);
        const PAD = 60;
        const imgW = Math.max(1200, bounds.width + PAD * 2);
        const imgH = Math.max(800, bounds.height + PAD * 2);
        const { x, y, zoom } = getViewportForBounds(
          bounds,
          imgW,
          imgH,
          0.1,
          2,
          PAD / Math.min(imgW, imgH)
        );
        const dataUrl = await toPng(viewportEl as HTMLElement, {
          backgroundColor: "#FAF8F2",
          pixelRatio: scale,
          cacheBust: true,
          width: imgW,
          height: imgH,
          style: {
            width: `${imgW}px`,
            height: `${imgH}px`,
            transform: `translate(${x}px, ${y}px) scale(${zoom})`,
          },
          filter: (n) =>
            !(n instanceof HTMLElement) ||
            (!n.classList.contains("react-flow__handle") &&
              !n.classList.contains("erd-laser-layer")),
        });
        downloadDataUrl(dataUrl, pngFileName(scale));
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "PNG export failed");
      } finally {
        setExporting(false);
      }
    },
    [nodes]
  );

  const relPos = useCallback((e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }, []);

  const startStroke = useCallback(
    (e: React.PointerEvent) => {
      if (!laser) return;
      drawing.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const id = ++strokeId.current;
      setStrokes((prev) => [...prev.slice(-11), { id, pts: [relPos(e)] }]);
      window.setTimeout(() => {
        setStrokes((prev) => prev.filter((s) => s.id !== id));
      }, 1600);
    },
    [laser, relPos]
  );

  const extendStroke = useCallback(
    (e: React.PointerEvent) => {
      if (!laser || !drawing.current) return;
      const p = relPos(e);
      setStrokes((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, pts: [...last.pts, p].slice(-120) }];
      });
    },
    [laser, relPos]
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[420px] w-full overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)]"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        onPaneClick={() => onPaneClick?.()}
        onNodeDragStop={(_, node) => onNodeDragStop?.(node.id, { ...node.position })}
        onMoveStart={() => onViewportMove?.()}
        onMoveEnd={(_, viewport) => onViewportChange?.({ ...viewport })}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        panOnDrag={!laser}
        zoomOnScroll
        zoomOnPinch
        nodesDraggable={!laser && !nodesLocked && !fullLocked}
        nodesConnectable={false}
        elementsSelectable={!laser && !fullLocked}
        onInteractiveChange={(interactive) => setFullLocked(!interactive)}
        minZoom={0.15}
        fitView={storedViewport ? false : true}
        defaultViewport={storedViewport ?? undefined}
      >
        <Background gap={22} size={1.2} color="#DDD3BC" bgColor="#FAF8F2" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor="#D9CFB6"
          nodeStrokeColor="#9A7653"
          style={{ background: "#FFFFFF", border: "1px solid #DDD3BC", borderRadius: 8 }}
          maskColor="rgba(250, 248, 242, 0.75)"
        />
        <Controls position="bottom-left" />
        <Panel position="bottom-left" style={{ marginBottom: 134 }}>
          <button
            type="button"
            onClick={() => setNodesLocked((v) => !v)}
            aria-pressed={nodesLocked}
            title={nodesLocked ? "Unlock node dragging (pan/zoom always work)" : "Lock node positions - drag to arrange, lock to present (pan/zoom always work)"}
            className="react-flow__controls-button"
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: nodesLocked ? "#211F1B" : undefined, color: nodesLocked ? "#fff" : undefined, borderBottom: "1px solid #eee" }}
          >
            {nodesLocked ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 7.5-2" />
              </svg>
            )}
          </button>
        </Panel>
      </ReactFlow>

      {laser && (
        <svg
          className="erd-laser-layer absolute inset-0 h-full w-full touch-none"
          style={{ cursor: "crosshair", zIndex: 20 }}
          onPointerDown={startStroke}
          onPointerMove={extendStroke}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerLeave={() => {
            drawing.current = false;
          }}
        >
          {strokes.map((s) => (
            <g key={s.id}>
              <polyline
                points={s.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#ef4444"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.pts.length > 0 && (
                <circle
                  cx={s.pts[s.pts.length - 1].x}
                  cy={s.pts[s.pts.length - 1].y}
                  r="5"
                  fill="#ef4444"
                />
              )}
            </g>
          ))}
        </svg>
      )}

      {/* Empty canvas: guidance card (pan still works around it) */}
      {propNodes.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 pointer-events-none">
          <div className="pointer-events-auto max-w-sm rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-5 text-center shadow-[0_12px_36px_-16px_rgba(24,20,12,0.4)]">
            <p className="text-[11px] font-bold uppercase tracking-[1.8px] text-[var(--color-accent-dark)]">
              Map your data model
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ivory-700">
              Add an object from the panel on the left - links to objects
              already on canvas draw automatically.
            </p>
            <p className="mt-2.5 text-[11px] text-ivory-500">
              ⌘K find · L laser · drag to pan · scroll to zoom
            </p>
          </div>
        </div>
      )}

      {/* Top-left: counts + laser */}
      <div className="absolute left-3 top-3 z-30 flex flex-wrap items-center gap-1.5">
        <span className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] font-medium text-ivory-700">
          {nodes.length} objects · {edges.length} links
        </span>
        <button
          type="button"
          onClick={() => setLaser((v) => !v)}
          aria-pressed={laser}
          title={laser ? "Exit laser pointer (Esc)" : "Laser walkthrough - press L to present, Esc to scroll again"}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
            laser
              ? "bg-[#ef4444] border-[#dc2626] text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]"
              : "bg-[var(--color-surface)] border-[var(--color-line)] text-ivory-700 hover:border-red-400 hover:text-red-600"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${laser ? "bg-white" : "bg-[#ef4444]"}`} aria-hidden="true" />
          {laser ? "Laser • Esc to exit" : "Laser"}
        </button>
      </div>

      {/* Top-right: snapshot export - always visible */}
      <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5">
        {exportError && (
          <span className="rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-700" role="alert">
            {exportError}
          </span>
        )}
        <button
          type="button"
          onClick={() => doExport(2)}
          disabled={exporting || nodes.length === 0}
          title="Download the full diagram as PNG (2x)"
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-ivory-700 hover:border-[var(--color-accent)] hover:text-ivory-950 transition-colors cursor-pointer disabled:opacity-40"
        >
          {exporting ? "Exporting…" : "Snapshot PNG"}
        </button>
        <button
          type="button"
          onClick={() => doExport(3)}
          disabled={exporting || nodes.length === 0}
          title="Download the full diagram as hi-res PNG (3x) for decks"
          className="rounded-lg border border-ivory-950 bg-ivory-950 px-2.5 py-1.5 text-[11px] font-semibold text-ivory-100 hover:bg-bronze-600 hover:border-bronze-600 transition-colors cursor-pointer disabled:opacity-40"
        >
          3x Hi-Res
        </button>
      </div>
    </div>
  );
});

export const ErdCanvas = forwardRef<ErdCanvasHandle, ErdCanvasProps>(function ErdCanvas(props, ref) {
  return (
    <ReactFlowProvider>
      <ErdFlow {...props} ref={ref} />
    </ReactFlowProvider>
  );
});
