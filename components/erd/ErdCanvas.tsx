"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
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
import type { ErdNodeData } from "@/lib/erd/graph";
import { ErdTableNode } from "./ErdTableNode";
import { ErdEdge } from "./ErdEdge";

const nodeTypes = { erdTable: ErdTableNode } as const;
const edgeTypes = { erdEdge: ErdEdge } as const;

interface ErdCanvasProps {
  nodes: Node<ErdNodeData>[];
  edges: Edge[];
  onNodeClick?: (id: string) => void;
  onPaneClick?: () => void;
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

function ErdFlow({ nodes: propNodes, edges: propEdges, onNodeClick, onPaneClick }: ErdCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ErdNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  const [laser, setLaser] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokeId = useRef(0);
  const drawing = useRef(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setNodes(propNodes);
    setEdges(propEdges);
    const t = window.setTimeout(() => fitView({ padding: 0.18, maxZoom: 1 }), 60);
    return () => window.clearTimeout(t);
  }, [propNodes, propEdges, setNodes, setEdges, fitView]);

  useEffect(() => {
    if (!laser) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLaser(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [laser]);

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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        panOnDrag={!laser}
        panOnScroll
        zoomOnScroll={false}
        nodesDraggable={!laser}
        nodesConnectable={false}
        elementsSelectable={!laser}
        minZoom={0.15}
        fitView
      >
        <Background gap={22} size={1.2} color="#DDD3BC" bgColor="#FAF8F2" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          style={{ background: "#FFFFFF", border: "1px solid #DDD3BC", borderRadius: 8 }}
          maskColor="rgba(250, 248, 242, 0.75)"
        />
        <Controls position="bottom-left" />
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

      {/* Top-left: counts + laser */}
      <div className="absolute left-3 top-3 z-30 flex flex-wrap items-center gap-1.5">
        <span className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] font-medium text-ivory-700">
          {nodes.length} objects · {edges.length} links
        </span>
        <button
          type="button"
          onClick={() => setLaser((v) => !v)}
          aria-pressed={laser}
          title={laser ? "Exit laser pointer (Esc)" : "Laser walkthrough — draw on the canvas while you present"}
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

      {/* Top-right: snapshot export — always visible */}
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
}

export function ErdCanvas(props: ErdCanvasProps) {
  return (
    <ReactFlowProvider>
      <ErdFlow {...props} />
    </ReactFlowProvider>
  );
}
