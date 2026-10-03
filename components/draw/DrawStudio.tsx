"use client";

import dynamic from "next/dynamic";

const DrawCanvasLazy = dynamic(() => import("./DrawCanvas").then((m) => m.DrawCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
      Loading whiteboard…
    </div>
  ),
});

/**
 * Pure Excalidraw canvas - no studio chrome, no snapshots, no autosave.
 * The editor's own menu (including save-as-image and command palette)
 * is the interface. Nothing here renders locale- or time-sensitive text,
 * so server and client HTML always agree.
 */
export function DrawStudio() {
  return (
    // Definite viewport height (not flex-fill): Excalidraw measures its
    // container at mount and needs non-zero dimensions up front, or the
    // toolbar never renders. 54px header + ~42px slim footer chrome,
    // minus the 1px hairline frame (width stretches to it automatically).
    <div className="m-px h-[calc(100dvh-98px)] min-h-[480px] overflow-hidden bg-white">
      <DrawCanvasLazy />
    </div>
  );
}
