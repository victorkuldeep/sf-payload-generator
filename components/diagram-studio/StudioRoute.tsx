"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { toPng } from "html-to-image";
import Button from "../ui/Button";
import { blankSketch, sketchToSystemProject, type StudioSketch } from "@/lib/diagram-studio/sketch";
import { deleteSketch, listSketches, saveSketch } from "@/lib/diagram-studio/sketchStore";
import { STUDIO_THEMES, studioTheme } from "@/lib/diagram-studio/themes";
import { studioItemPngFileName } from "@/lib/diagram-studio/types";
import { SYSTEM_DRAFT_KEY } from "@/lib/draw/toSystemDraft";
import { StudioCanvas } from "./StudioCanvas";

type SaveState = "saved" | "saving" | "unsaved" | "error";

const inputCls =
  "rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[13px] focus:border-[#A98450] focus:outline-none";

/**
 * Diagram Studio route: freehand architecture sketching. Boxes (systems,
 * flowchart shapes, notes) with static labeled links - pure diagrams, no
 * animation. System sketches promote to the System tab for real APIs;
 * flowcharts export and deliver as-is.
 */
export function StudioRoute() {
  const router = useRouter();
  const [sketches, setSketches] = useState<StudioSketch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [newName, setNewName] = useState("");
  const [themeId, setThemeId] = useState("premium-light");
  const [scale, setScale] = useState<2 | 3>(2);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void listSketches().then(setSketches).catch(() => setSketches([]));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const sketch = sketches.find((s) => s.id === activeId) ?? null;
  const theme = studioTheme(themeId);
  const systemCount = sketch?.nodes.filter((n) => n.kind === "system").length ?? 0;

  const persist = useCallback(async (next: StudioSketch) => {
    setSaveState("saving");
    const ok = await saveSketch(next);
    setSaveState(ok ? "saved" : "error");
    if (ok) setSketches((prev) => prev.map((s) => (s.id === next.id ? { ...next, updatedAt: Date.now() } : s)));
  }, []);

  const mutateSketch = useCallback(
    (fn: (s: StudioSketch) => StudioSketch) => {
      const cur = sketches.find((s) => s.id === activeId);
      if (!cur) return;
      const next = fn(cur);
      setSketches((prev) => prev.map((s) => (s.id === next.id ? next : s)));
      setSaveState("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist(next), 900);
    },
    [sketches, activeId, persist]
  );

  const createSketch = () => {
    const s = blankSketch(newName);
    setNewName("");
    setConfirmDelete(false);
    void saveSketch(s).then(() => {
      setSketches((prev) => [s, ...prev]);
      setActiveId(s.id);
    });
  };

  const deleteActive = async () => {
    if (!sketch) return;
    await deleteSketch(sketch.id).catch(() => undefined);
    setSketches((prev) => prev.filter((s) => s.id !== sketch.id));
    setActiveId(null);
    setConfirmDelete(false);
  };

  const exportPng = async () => {
    if (!sketch || busy) return;
    const el = shotRef.current;
    if (!el) return;
    setBusy(true);
    setExportError(null);
    try {
      const dataUrl = await toPng(el, { backgroundColor: theme.background, pixelRatio: scale, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = studioItemPngFileName(sketch.name, scale);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setExportError("Export failed - try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendToSystem = () => {
    if (!sketch || systemCount === 0) return;
    const promotion = sketchToSystemProject(sketch);
    try {
      sessionStorage.setItem(SYSTEM_DRAFT_KEY, JSON.stringify(promotion.project));
    } catch {
      setExportError("Browser storage refused the handoff - try again.");
      return;
    }
    router.push("/system");
  };

  const saveBadge = (
    <span
      role="status"
      className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${
        saveState === "saved"
          ? "border-[#BFD9C6] bg-[#E9F3EC] text-[#2F7D4F]"
          : saveState === "error"
            ? "border-[#E5B8B2] bg-[#F9E8E6] text-[#B3261E]"
            : "border-[#DCC99A] bg-[#F5EEDF] text-[#8A6A2F]"
      }`}
    >
      {saveState === "saved" ? "Saved locally" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Unsaved changes"}
    </span>
  );

  return (
    <div className="grid min-h-0 flex-1 items-stretch gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex h-full max-h-[calc(100vh-140px)] min-h-[420px] flex-col rounded-xl border border-[#E8E2D8] bg-white p-3" aria-label="Sketches inventory">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Sketches · {sketches.length}</p>
          {saveBadge}
        </div>
        <div className="mb-2 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createSketch();
            }}
            placeholder="New sketch - e.g. Order flow"
            aria-label="New sketch name"
            className={inputCls}
          />
          <Button size="sm" onClick={createSketch} title="Create sketch">
            + New
          </Button>
        </div>
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {sketches.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveId(s.id);
                  setConfirmDelete(false);
                                setExportError(null);
                }}
                aria-current={s.id === activeId ? "true" : undefined}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                  s.id === activeId ? "border-[#211F1B] bg-[#211F1B] text-white" : "border-[#E8E2D8] bg-white hover:border-[#A98450]"
                }`}
              >
                <p className="truncate text-[13px] font-semibold">{s.name}</p>
                <p className={`font-mono text-[10px] ${s.id === activeId ? "text-white/70" : "text-[#A39B8E]"}`}>
                  {s.nodes.filter((n) => n.kind === "system").length} systems · {s.edges.length} links
                </p>
              </button>
            </li>
          ))}
          {sketches.length === 0 && (
            <li className="rounded-lg border border-dashed border-[#D8CFC0] p-4 text-center">
              <p className="text-[13px] font-semibold text-[#27241F]">No sketches yet</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#777168]">
                Name a sketch above - place system boxes and flowchart shapes, link them, then send systems to the System tab for real APIs.
              </p>
            </li>
          )}
        </ul>
      </aside>

      <section className="min-h-0 rounded-xl border border-[#E8E2D8] bg-white p-4" aria-label="Sketch editor">
        {!sketch ? (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
            <p className="text-[16px] font-semibold text-[#27241F]">Diagram Studio</p>
            <p className="mt-2 max-w-md text-[12px] leading-relaxed text-[#777168]">
              Figma-for-systems sketching: drop boxes, connect them in seconds, no backend ceremony.
              System sketches promote to the System tab for real APIs; flowcharts export and deliver as-is.
              The AI dock draws here too - ask it to place your boxes, adjust by hand.
            </p>
          </div>
        ) : (
          <div className="flex h-full max-h-[calc(100vh-140px)] min-h-[460px] flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={sketch.id}
                defaultValue={sketch.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== sketch.name) mutateSketch((p) => ({ ...p, name: v }));
                }}
                aria-label="Sketch name"
                className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-[15px] font-semibold text-[#27241F] hover:border-[#E8E2D8] focus:border-[#A98450] focus:outline-none"
              />
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#777168]">
                Theme
                <select
                  value={themeId}
                  onChange={(e) => setThemeId(e.target.value)}
                  className="rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[12px] font-normal text-[#27241F] focus:border-[#A98450] focus:outline-none"
                >
                  {STUDIO_THEMES.map((t) => (
                    <option key={t.id} value={t.id} title={t.blurb}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#777168]">
                Scale
                <select
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value) as 2 | 3)}
                  className="rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[12px] font-normal text-[#27241F] focus:border-[#A98450] focus:outline-none"
                >
                  <option value={2}>2x PNG</option>
                  <option value={3}>3x PNG</option>
                </select>
              </label>
              <Button size="sm" variant="secondary" onClick={exportPng} disabled={busy || sketch.nodes.length === 0} title="Download this sketch as PNG">
                {busy ? "Exporting…" : "PNG"}
              </Button>
              <Button
                size="sm"
                onClick={sendToSystem}
                disabled={systemCount === 0}
                title={systemCount === 0 ? "Place at least one system box first - flowcharts export directly" : "Promote system boxes + links into a runnable System project"}
              >
                Send to System
              </Button>
              {confirmDelete ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </Button>
                  <Button size="sm" variant="danger" onClick={deleteActive}>
                    Confirm delete
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} title="Delete this sketch">
                  Delete
                </Button>
              )}
            </div>
            {exportError && (
              <p className={`rounded-lg border px-3 py-2 text-[11px] ${exportError ? "border-[#E5B8B2] bg-[#F9E8E6] text-[#B3261E]" : "border-[#BFD9C6] bg-[#E9F3EC] text-[#2F7D4F]"}`} role="status">
                {exportError}
              </p>
            )}
            <ReactFlowProvider>
              <div ref={shotRef} className="flex min-h-0 flex-1 flex-col">
                <StudioCanvas sketch={sketch} onChange={(next) => mutateSketch(() => next)} />
              </div>
            </ReactFlowProvider>
          </div>
        )}
      </section>
    </div>
  );
}
