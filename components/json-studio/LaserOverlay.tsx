"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Stroke {
  id: number;
  pts: { x: number; y: number }[];
}

function findScroller(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let el = walker.nextNode() as HTMLElement | null;
  while (el) {
    if (el.scrollHeight > el.clientHeight + 4) return el;
    el = walker.nextNode() as HTMLElement | null;
  }
  return null;
}

/**
 * Laser pointer overlay (ERD language): L toggles, Esc exits, strokes
 * fade after ~1.6s. Never activates while typing. Wheel scroll is
 * forwarded to the inner scroll container so walkthroughs keep scrolling.
 */
export function LaserOverlay({
  active,
  hostRef,
}: {
  active: boolean;
  /** Ref of the element containing the scrollable surface. */
  hostRef: React.RefObject<HTMLElement | null>;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [pencil, setPencil] = useState<{ x: number; y: number } | null>(null);
  const strokeId = useRef(0);
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);

  // Forward wheel to the inner scroller (native, non-passive).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !active) return;
    const onWheel = (e: WheelEvent) => {
      if (!scrollerRef.current) scrollerRef.current = findScroller(hostRef.current);
      const scroller = scrollerRef.current;
      // No inner scroller (e.g. canvas panes that pan via transform):
      // let the page scroll naturally instead of swallowing the wheel.
      if (!scroller) return;
      e.preventDefault();
      scroller.scrollTop += e.deltaY;
      scroller.scrollLeft += e.deltaX;
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [active, hostRef]);

  useEffect(() => {
    scrollerRef.current = null;
  }, [active]);

  const relPos = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  if (!active) return null;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full touch-none"
      style={{ cursor: "none", zIndex: 30 }}
      onPointerDown={(e) => {
        drawing.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const id = ++strokeId.current;
        const p = relPos(e);
        setPencil(p);
        setStrokes((prev) => [...prev.slice(-11), { id, pts: [p] }]);
        window.setTimeout(() => {
          setStrokes((prev) => prev.filter((s) => s.id !== id));
        }, 1600);
      }}
      onPointerMove={(e) => {
        const p = relPos(e);
        if (e.pointerType === "mouse" || e.pointerType === "pen") setPencil(p);
        if (!drawing.current) return;
        setStrokes((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          return [...prev.slice(0, -1), { ...last, pts: [...last.pts, p].slice(-120) }];
        });
      }}
      onPointerUp={() => {
        drawing.current = false;
      }}
      onPointerLeave={() => {
        drawing.current = false;
        setPencil(null);
      }}
    >
      {pencil && (
        <g transform={`translate(${pencil.x} ${pencil.y}) rotate(-45)`} pointerEvents="none">
          <rect x="-3" y="-19" width="6" height="12" rx="1" fill="#A98450" />
          <polygon points="-3,-7 3,-7 0,0" fill="#E8DCC8" />
          <circle cx="0" cy="-1.5" r="1.6" fill="#ef4444" />
        </g>
      )}
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
  );
}

/** L toggles (never while typing or with modifiers), Esc exits. */
export function useLaser(active: boolean, setActive: (v: boolean | ((p: boolean) => boolean)) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActive(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== "l") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      setActive((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActive]);
  return active;
}

export function LaserButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={active ? "Exit laser pointer (Esc)" : "Laser walkthrough - press L to present, Esc to exit"}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
        active
          ? "bg-[#ef4444] border-[#dc2626] text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]"
          : "bg-[var(--color-surface)] border-[var(--color-line)] text-ivory-700 hover:border-red-400 hover:text-red-600"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : "bg-[#ef4444]"}`} aria-hidden="true" />
      {active ? "Laser • Esc" : "Laser"}
    </button>
  );
}
