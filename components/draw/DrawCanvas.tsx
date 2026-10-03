"use client";

import { useRef, useState } from "react";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { Action } from "@excalidraw/excalidraw/actions/types";
import { readStoredScene, writeStoredScene, type StoredScene } from "@/lib/draw/storage";

/**
 * DrawCanvas - the single boundary between Archestra and Excalidraw.
 *
 * No other module imports `@excalidraw/excalidraw` at runtime; the rest of
 * the app talks to this wrapper, so the engine can be replaced without
 * rewriting callers.
 *
 * Reload-safety lives here too: the current scene restores from IndexedDB
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

export interface DrawCanvasProps {
  /** Called with the live scene elements when the user sends to System. */
  onSendToSystem: (elements: unknown[]) => void;
}

export function DrawCanvas({ onSendToSystem }: DrawCanvasProps) {
  // Kick off once per mount: a fresh promise every render would reset the editor.
  const [initialScene] = useState<Promise<ExcalidrawInitialDataState | null>>(readInitialScene);
  const saveTimer = useRef<number | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const sendRef = useRef(onSendToSystem);
  sendRef.current = onSendToSystem;

  const fireSend = () => {
    const api = apiRef.current;
    const elements = api ? [...api.getSceneElements()] : [];
    sendRef.current(elements as unknown[]);
  };

  const sendButton = (
    <button
      type="button"
      onClick={fireSend}
      title="Parse this board into a System Design draft"
      className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-ink)] hover:border-[var(--color-accent)] transition-colors cursor-pointer"
    >
      Send to System
    </button>
  );

  return (
    <Excalidraw
      initialData={initialScene}
      excalidrawAPI={(api) => {
        apiRef.current = api;
        // Command-palette entry mirroring the button. `name` is cast: the
        // closed ActionName union only knows built-ins, but the runtime
        // registry is a plain name-keyed map (verified in the bundle).
        api.registerAction({
          name: "sendToSystemDesign" as Action["name"],
          label: "Send to System Design",
          paletteName: "Send to System Design",
          keywords: ["system", "topology", "integration", "send"],
          trackEvent: false,
          perform: () => {
            fireSend();
            return false;
          },
        } as Action);
      }}
      renderTopRightUI={() => sendButton}
      onChange={(elements, appState, files) => {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          void writeStoredScene(serializeAsJSON(elements, appState, files, "local"));
        }, 500);
      }}
    />
  );
}
