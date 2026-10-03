"use client";

import { useEffect, useRef, useState } from "react";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { readStoredScene, writeStoredScene, type StoredScene } from "@/lib/draw/storage";

/**
 * DrawCanvas - the single boundary between sObject Studio and Excalidraw.
 *
 * No other module imports `@excalidraw/excalidraw` at runtime; the rest of
 * the app talks to this wrapper, so the engine can be replaced without
 * rewriting callers.
 *
 * Reload-safety lives here too: the current scene restores from localStorage
 * on mount and saves (debounced) on every change. No snapshots, no chrome -
 * a reload simply returns to the drawing.
 */

// Self-hosted runtime assets (fonts, locales) copied from the installed
// package into public/excalidraw-assets by scripts/copy-excalidraw-assets.mjs.
// No CDN fallback is configured, so a missing file fails loudly, not silently.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).EXCALIDRAW_ASSET_PATH =
    "/excalidraw-assets/";
}

async function readInitialScene(): Promise<ExcalidrawInitialDataState | null> {
  const stored: StoredScene | null = await readStoredScene();
  if (!stored) return null;
  return {
    elements: stored.elements,
    appState: stored.appState,
    files: stored.files ?? undefined,
    scrollToContent: true,
  } as unknown as ExcalidrawInitialDataState;
}

/** Pure canvas - no props. The editor owns its state; nothing SSR-sensitive. */
export function DrawCanvas() {
  // Kick off once per mount: a fresh promise every render would reset the editor.
  const [initialScene] = useState<Promise<ExcalidrawInitialDataState | null>>(readInitialScene);
  const saveTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  return (
    <Excalidraw
      initialData={initialScene}
      onChange={(elements, appState, files) => {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          void writeStoredScene(serializeAsJSON(elements, appState, files, "local"));
        }, 500);
      }}
    />
  );
}
