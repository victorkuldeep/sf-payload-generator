"use client";

import { useEffect, useRef } from "react";

// Lazily loaded - vanilla-jsoneditor touches the DOM and weighs ~10MB
// unpacked, so it must never join the initial bundle.
export function VanillaEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange?: (value: unknown) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<{ destroy: () => void } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let alive = true;
    (async () => {
      const { createJSONEditor, Mode } = await import("vanilla-jsoneditor");
      if (!alive || !hostRef.current || editorRef.current) return;
      const editor = createJSONEditor({
        target: hostRef.current,
        props: {
          content: { json: value as Record<string, unknown> },
          mode: Mode.tree,
          onChange: (content: unknown) => {
            const v = (content as { json?: unknown })?.json;
            if (v !== undefined) onChangeRef.current?.(v);
          },
        },
      });
      editorRef.current = editor as unknown as { destroy: () => void };
    })();
    return () => {
      alive = false;
      try {
        editorRef.current?.destroy();
      } catch {
        /* already gone */
      }
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      className="jse-ivory min-h-[420px] overflow-hidden rounded-xl border border-[#E8E2D8]"
      style={{
        // Ivory override attempt - scoped to the spike wrapper.
        ["--jse-background-color" as string]: "#FAF8F2",
        ["--jse-panel-background" as string]: "#FFFFFF",
        ["--jse-main-background-color" as string]: "#FFFFFF",
      }}
    />
  );
}
