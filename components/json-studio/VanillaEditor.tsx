"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { enumerateTextMatches, enumerateTreeMatches, type FindMatch } from "@/lib/json/find";

// Lazily loaded - vanilla-jsoneditor touches the DOM and weighs ~10MB
// unpacked, so it must never join the initial bundle.

type JsonPath = (string | number)[];

interface EditorHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: () => any;
  expand: (path: JsonPath) => Promise<void> | void;
  scrollTo: (path: JsonPath) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: (sel: any) => void;
}

interface LibRefs {
  SelectionType: { text: string };
  createKeySelection: (path: JsonPath) => unknown;
  createValueSelection: (path: JsonPath) => unknown;
}

export function VanillaEditor({
  value,
  onChange,
  findSignal,
}: {
  value: unknown;
  onChange?: (value: unknown) => void;
  /** Increment to open the find bar (toolbar button). */
  findSignal?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorHandle | null>(null);
  const libRef = useRef<LibRefs | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [mode, setMode] = useState<"tree" | "text">("tree");
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [contentSnap, setContentSnap] = useState<{ json?: unknown; text?: string }>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const mod = await import("vanilla-jsoneditor");
      if (!alive || !hostRef.current || editorRef.current) return;
      libRef.current = {
        SelectionType: mod.SelectionType as unknown as LibRefs["SelectionType"],
        createKeySelection: mod.createKeySelection as LibRefs["createKeySelection"],
        createValueSelection: mod.createValueSelection as LibRefs["createValueSelection"],
      };
      const editor = mod.createJSONEditor({
        target: hostRef.current,
        props: {
          content: { json: value as Record<string, unknown> },
          mode: mod.Mode.tree,
          onChange: (content: unknown) => {
            const c = content as { json?: unknown; text?: string };
            setContentSnap({ json: c.json, text: c.text });
            if (c.json !== undefined) onChangeRef.current?.(c.json);
          },
          onChangeMode: (m: unknown) => {
            const next = String((m as { mode?: string }).mode ?? "tree");
            setMode(next === "text" ? "text" : "tree");
          },
          onRenderMenu: (items: { text?: string; title?: string }[]) => {
            const filtered = items.filter((item) => {
              const label = `${item.text ?? ""} ${item.title ?? ""}`.toLowerCase();
              return !label.includes("search");
            });
            return filtered.length === items.length ? undefined : filtered;
          },
        },
      });
      editorRef.current = editor as unknown as EditorHandle;
    })();
    return () => {
      alive = false;
      try {
        (editorRef.current as unknown as { destroy?: () => void })?.destroy?.();
      } catch {
        /* already gone */
      }
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (findSignal !== undefined && findSignal > 0) setFindOpen(true);
  }, [findSignal]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
      if (e.key === "Escape") setFindOpen(false);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);

  const matches: FindMatch[] = (() => {
    if (query === "") return [];
    if (mode === "text") {
      const text =
        contentSnap.text ??
        (typeof contentSnap.json !== "undefined" ? JSON.stringify(contentSnap.json, null, 2) : "");
      return enumerateTextMatches(text, query, matchCase);
    }
    const json = contentSnap.json ?? value;
    if (typeof json === "undefined") return [];
    return enumerateTreeMatches(json, query, matchCase);
  })();

  const clampedIndex = matches.length === 0 ? 0 : matchIndex % matches.length;

  const gotoMatch = useCallback(
    async (index: number) => {
      const editor = editorRef.current;
      const lib = libRef.current;
      const match = matches[index];
      if (!editor || !lib || !match) return;
      setMatchIndex(index);
      try {
        if (mode === "text") {
          await editor.select({
            type: lib.SelectionType.text,
            ranges: [{ anchor: match.offset, head: match.offset + match.length }],
            main: 0,
          });
        } else {
          // Expand every ancestor so the match is rendered, then reveal it.
          for (let depth = 1; depth <= match.path.length; depth++) {
            await editor.expand(match.path.slice(0, depth));
          }
          await editor.scrollTo(match.path);
          editor.select(
            match.key ? lib.createKeySelection(match.path) : lib.createValueSelection(match.path)
          );
        }
      } catch {
        /* navigation is best-effort */
      }
    },
    [matches, mode]
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (matches.length === 0) return;
      const next = (clampedIndex + dir + matches.length) % matches.length;
      void gotoMatch(next);
    },
    [matches, clampedIndex, gotoMatch]
  );

  useEffect(() => {
    setMatchIndex(0);
  }, [query, matchCase, mode]);

  useEffect(() => {
    if (findOpen && matches.length > 0) void gotoMatch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findOpen]);

  return (
    <div ref={wrapRef} className="relative">
      {findOpen && (
        <div className="absolute left-3 right-3 top-3 z-30 flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E8E2D8] bg-white/95 px-2.5 py-2 shadow-[0_16px_40px_-16px_rgba(24,20,12,0.4)] backdrop-blur-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="shrink-0 text-[#A39B8E]">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") step(e.shiftKey ? -1 : 1);
            }}
            placeholder="Find in JSON… (Enter ↵ · ⇧Enter ↑)"
            aria-label="Find in JSON"
            spellCheck={false}
            className="min-w-[140px] flex-1 rounded-md border border-[#E8E2D8] px-2 py-1 font-mono text-[13px] focus:border-[#A98450] focus:outline-none"
          />
          <span className="font-mono text-[11px] text-[#A39B8E]" aria-live="polite">
            {matches.length === 0 ? (query === "" ? "" : "0 found") : `${clampedIndex + 1}/${matches.length}`}
          </span>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={matches.length === 0}
            aria-label="Previous match"
            title="Previous (Shift+Enter)"
            className="rounded-md p-1.5 text-[#777168] hover:bg-[#F5F1E8] hover:text-[#27241F] transition-colors cursor-pointer disabled:opacity-30"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={matches.length === 0}
            aria-label="Next match"
            title="Next (Enter)"
            className="rounded-md p-1.5 text-[#777168] hover:bg-[#F5F1E8] hover:text-[#27241F] transition-colors cursor-pointer disabled:opacity-30"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-[#777168]" title="Match case">
            <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} className="h-3 w-3 rounded" />
            Aa
          </label>
          <button
            type="button"
            onClick={() => {
              setFindOpen(false);
              setQuery("");
            }}
            aria-label="Close find"
            title="Close (Esc)"
            className="rounded-md p-1.5 text-[#777168] hover:bg-[#F5F1E8] hover:text-[#27241F] transition-colors cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}
      <div
        ref={hostRef}
        className="min-h-[480px] overflow-hidden rounded-xl border border-[#E8E2D8]"
        style={{
          ["--jse-theme-color" as string]: "#49381B",
          ["--jse-theme-color-highlight" as string]: "#3A2C15",
          ["--jse-menu-color" as string]: "#FFFFFF",
          ["--jse-background-color" as string]: "#FAF8F2",
          ["--jse-panel-background" as string]: "#FFFFFF",
          ["--jse-main-background-color" as string]: "#FFFFFF",
        }}
      />
    </div>
  );
}
