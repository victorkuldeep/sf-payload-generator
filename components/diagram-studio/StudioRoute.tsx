"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import Button from "../ui/Button";
import {
  blankStudioProject,
  newStudioId,
  orphanedItems,
  studioSetFileName,
  type StudioItem,
  type StudioItemKind,
  type StudioProject,
} from "@/lib/diagram-studio/types";
import { STUDIO_THEMES, studioTheme } from "@/lib/diagram-studio/themes";
import { deleteDiagramStudio, listDiagramStudios, saveDiagramStudio } from "@/lib/diagram-studio/store";
import { listSequences } from "@/lib/sequence/store";
import type { SequenceDocument } from "@/lib/sequence/model";
import { listSystemProjects, loadSystemProject } from "@/lib/system-design/store";
import type { SystemProject } from "@/lib/system-design/model";
import { SequenceSourceView, SystemSourceView } from "./SourceViews";

type SaveState = "saved" | "saving" | "unsaved" | "error";

const inputCls =
  "rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[13px] focus:border-[#A98450] focus:outline-none";

/**
 * Diagram Studio route: deliverable packs referencing Sequence + System
 * canvases. Items are references - the canvases stay source of truth.
 * PNG capture runs on the same toPng pipeline as the canvas buttons.
 */
export function StudioRoute() {
  const [studios, setStudios] = useState<StudioProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sequences, setSequences] = useState<SequenceDocument[]>([]);
  const [systems, setSystems] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [sysCache, setSysCache] = useState<Record<string, SystemProject>>({});
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [newName, setNewName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scale, setScale] = useState<2 | 3>(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const registerNode = useCallback(
    (itemId: string) => (el: HTMLElement | null) => {
      if (el) nodeRefs.current.set(itemId, el);
      else nodeRefs.current.delete(itemId);
    },
    []
  );

  const refresh = useCallback(() => {
    void listDiagramStudios().then(setStudios).catch(() => setStudios([]));
    void listSequences().then(setSequences).catch(() => setSequences([]));
    void listSystemProjects().then(setSystems).catch(() => setSystems([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const project = studios.find((s) => s.id === activeId) ?? null;
  const theme = studioTheme(project?.themeId ?? "premium-light");

  // Lazily load referenced system canvases for preview + capture.
  useEffect(() => {
    if (!project) return;
    for (const item of project.items) {
      if (item.kind === "sequence" || sysCache[item.refId]) continue;
      void loadSystemProject(item.refId)
        .then((p) => {
          if (p) setSysCache((prev) => (prev[item.refId] ? prev : { ...prev, [item.refId]: p }));
        })
        .catch(() => undefined);
    }
  }, [project, sysCache]);

  const liveIds = useMemo(
    () => new Set([...sequences.map((d) => d.id), ...systems.map((s) => s.id)]),
    [sequences, systems]
  );
  const orphanIds = useMemo(
    () => new Set(project ? orphanedItems(project.items, liveIds).map((o) => o.id) : []),
    [project, liveIds]
  );
  const seqById = useMemo(() => new Map(sequences.map((d) => [d.id, d])), [sequences]);
  const sysName = useCallback(
    (refId: string) => systems.find((s) => s.id === refId)?.name ?? sysCache[refId]?.name ?? "System canvas",
    [systems, sysCache]
  );
  const itemTitle = useCallback(
    (item: StudioItem) =>
      item.titleOverride ??
      (item.kind === "sequence" ? seqById.get(item.refId)?.name : sysName(item.refId)) ??
      "Untitled",
    [seqById, sysName]
  );

  const persist = useCallback(
    async (next: StudioProject) => {
      setSaveState("saving");
      const ok = await saveDiagramStudio(next);
      setSaveState(ok ? "saved" : "error");
      refresh();
    },
    [refresh]
  );

  const mutate = useCallback(
    (fn: (p: StudioProject) => StudioProject) => {
      const cur = studios.find((s) => s.id === activeId);
      if (!cur) return;
      const next = fn(cur);
      setSaveState("unsaved");
      setStudios((prev) => prev.map((s) => (s.id === next.id ? next : s)));
      void persist(next);
    },
    [studios, activeId, persist]
  );

  const createStudio = () => {
    const p = blankStudioProject(newName);
    setNewName("");
    setConfirmDelete(false);
    void saveDiagramStudio(p).then(() => {
      refresh();
      setActiveId(p.id);
    });
  };

  const addItem = (kind: StudioItemKind, refId: string) => {
    mutate((p) => ({ ...p, items: [...p.items, { id: newStudioId("item"), kind, refId, addedAt: Date.now() }] }));
  };

  const removeItem = (itemId: string) =>
    mutate((p) => ({ ...p, items: p.items.filter((i) => i.id !== itemId) }));

  const relinkItem = (itemId: string, refId: string) =>
    mutate((p) => ({ ...p, items: p.items.map((i) => (i.id === itemId ? { ...i, refId, titleOverride: undefined } : i)) }));

  const download = (dataUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const captureItem = async (item: StudioItem, index: number): Promise<boolean> => {
    const el = nodeRefs.current.get(item.id);
    if (!el) return false;
    try {
      const dataUrl = await toPng(el, { backgroundColor: theme.background, pixelRatio: scale, cacheBust: true });
      download(dataUrl, studioSetFileName(index, itemTitle(item), scale));
      return true;
    } catch {
      return false;
    }
  };

  const exportItem = async (item: StudioItem, index: number) => {
    if (busy) return;
    setBusy(item.id);
    setExportError(null);
    const ok = await captureItem(item, index);
    if (!ok) setExportError("Export failed for this diagram - try again.");
    setBusy(null);
  };

  const exportSet = async () => {
    if (!project || busy) return;
    setBusy("set");
    setExportError(null);
    let failed = 0;
    let n = 0;
    for (const item of project.items) {
      if (orphanIds.has(item.id)) continue;
      n += 1;
      const ok = await captureItem(item, n - 1);
      if (!ok) failed += 1;
    }
    if (n === 0) setExportError("Nothing exportable - add a diagram first.");
    else if (failed > 0) setExportError(`${failed} of ${n} exports failed - retry the missing ones.`);
    setBusy(null);
  };

  const deleteActive = async () => {
    if (!project) return;
    await deleteDiagramStudio(project.id).catch(() => undefined);
    setActiveId(null);
    setConfirmDelete(false);
    refresh();
  };

  const addedKeys = useMemo(() => new Set(project?.items.map((i) => `${i.kind}:${i.refId}`) ?? []), [project]);
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
      <aside className="flex h-full max-h-[calc(100vh-140px)] min-h-[420px] flex-col rounded-xl border border-[#E8E2D8] bg-white p-3" aria-label="Studio packs inventory">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Packs · {studios.length}</p>
          {saveBadge}
        </div>
        <div className="mb-2 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createStudio();
            }}
            placeholder="New pack - e.g. RCA review"
            aria-label="New studio pack name"
            className={inputCls}
          />
          <Button size="sm" onClick={createStudio} title="Create pack">
            + New
          </Button>
        </div>
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {studios.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveId(s.id);
                  setConfirmDelete(false);
                }}
                aria-current={s.id === activeId ? "true" : undefined}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                  s.id === activeId ? "border-[#211F1B] bg-[#211F1B] text-white" : "border-[#E8E2D8] bg-white hover:border-[#A98450]"
                }`}
              >
                <p className="truncate text-[13px] font-semibold">{s.name}</p>
                <p className={`font-mono text-[10px] ${s.id === activeId ? "text-white/70" : "text-[#A39B8E]"}`}>
                  {s.items.length} diagram{s.items.length === 1 ? "" : "s"} · {studioTheme(s.themeId).name}
                </p>
              </button>
            </li>
          ))}
          {studios.length === 0 && (
            <li className="rounded-lg border border-dashed border-[#D8CFC0] p-4 text-center">
              <p className="text-[13px] font-semibold text-[#27241F]">No packs yet</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#777168]">
                Name a pack above - then pull in Sequence diagrams and System canvases as one themed deliverable set.
              </p>
            </li>
          )}
        </ul>
      </aside>

      <section className="min-h-0 rounded-xl border border-[#E8E2D8] bg-white p-4" aria-label="Studio pack editor">
        {!project ? (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
            <p className="text-[16px] font-semibold text-[#27241F]">Diagram Studio</p>
            <p className="mt-2 max-w-md text-[12px] leading-relaxed text-[#777168]">
              Compose Sequence diagrams and System canvases into one themed pack and export the set as PNGs.
              Lightweight one-offs stay on the Sequence tab - the studio is for complex, multi-diagram deliverables.
            </p>
          </div>
        ) : (
          <div className="flex h-full max-h-[calc(100vh-140px)] min-h-[420px] flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={project.id}
                defaultValue={project.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== project.name) mutate((p) => ({ ...p, name: v }));
                }}
                aria-label="Pack name"
                className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-[15px] font-semibold text-[#27241F] hover:border-[#E8E2D8] focus:border-[#A98450] focus:outline-none"
              />
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#777168]">
                Theme
                <select
                  value={project.themeId}
                  onChange={(e) => mutate((p) => ({ ...p, themeId: e.target.value }))}
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
              <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)} title="Add a Sequence or System canvas">
                + Diagram
              </Button>
              <Button size="sm" onClick={exportSet} disabled={busy !== null || project.items.length === 0} title="Download every diagram as PNG, in order">
                {busy === "set" ? "Exporting…" : "Export set"}
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
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} title="Delete this pack (canvases are untouched)">
                  Delete
                </Button>
              )}
            </div>
            {exportError && (
              <p className="rounded-lg border border-[#E5B8B2] bg-[#F9E8E6] px-3 py-2 text-[11px] text-[#B3261E]" role="alert">
                {exportError}
              </p>
            )}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
              {project.items.map((item, index) => {
                const orphaned = orphanIds.has(item.id);
                const seq = item.kind === "sequence" ? seqById.get(item.refId) : undefined;
                const sys = item.kind === "system" ? sysCache[item.refId] : undefined;
                return (
                  <article key={item.id} className="overflow-hidden rounded-xl border border-[#E8E2D8]">
                    <div className="flex flex-wrap items-center gap-2 border-b border-[#EFE9DC] bg-[#FCFBF7] px-3 py-2">
                      <span className="font-mono text-[10px] font-bold text-[#A39B8E]">{String(index + 1).padStart(2, "0")}</span>
                      <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${item.kind === "sequence" ? "border-[#BFD9C6] bg-[#E9F3EC] text-[#2F7D4F]" : item.kind === "flow" ? "border-[#C9B8E0] bg-[#F1EAF9] text-[#6B4FA1]" : "border-[#DCC99A] bg-[#F5EEDF] text-[#8A6A2F]"}`}>
                        {item.kind === "sequence" ? "SEQUENCE" : item.kind === "flow" ? "FLOW" : "SYSTEM"}
                      </span>
                      <input
                        key={item.id}
                        defaultValue={item.titleOverride ?? ""}
                        placeholder={itemTitle(item)}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          const cur = item.titleOverride ?? "";
                          if (v !== cur) mutate((p) => ({ ...p, items: p.items.map((i) => (i.id === item.id ? { ...i, titleOverride: v || undefined } : i)) }));
                        }}
                        aria-label="Diagram title override"
                        title="Optional title override - blank falls back to the canvas name"
                        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] font-semibold text-[#27241F] hover:border-[#E8E2D8] focus:border-[#A98450] focus:outline-none"
                      />
                      <a
                        href={item.kind === "sequence" ? "/sequence" : "/system"}
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#777168] hover:text-[#27241F] hover:bg-[#F5F1E8] transition-colors"
                        title={item.kind === "sequence" ? "Open in the Sequence tab" : "Open in the System tab"}
                      >
                        Open in canvas ↗
                      </a>
                      {!orphaned && (
                        <Button size="sm" variant="ghost" onClick={() => void exportItem(item, index)} disabled={busy !== null} title={`Download this diagram as PNG (${scale}x)`}>
                          {busy === item.id ? "Exporting…" : "PNG"}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => removeItem(item.id)} title="Remove from pack (canvas untouched)">
                        Remove
                      </Button>
                    </div>
                    {orphaned ? (
                      <div className="flex flex-wrap items-center gap-2 bg-white px-3 py-3">
                        <p className="text-[12px] text-[#777168]">
                          Source {item.kind} canvas was deleted - nothing to render. Relink to a live canvas or remove this slot.
                        </p>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) relinkItem(item.id, e.target.value);
                          }}
                          aria-label="Relink to a live canvas"
                          className="rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[12px] text-[#27241F] focus:border-[#A98450] focus:outline-none"
                        >
                          <option value="">Relink to…</option>
                          {item.kind === "sequence"
                            ? sequences.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))
                            : systems.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                        </select>
                      </div>
                    ) : item.kind === "sequence" ? (
                      seq ? (
                        <SequenceSourceView doc={seq} registerNode={registerNode(item.id)} />
                      ) : (
                        <p className="bg-white px-3 py-6 text-center text-[12px] text-[#777168]">Loading sequence…</p>
                      )
                    ) : sys ? (
                      <SystemSourceView project={sys} registerNode={registerNode(item.id)} />
                    ) : (
                      <p className="bg-white px-3 py-6 text-center text-[12px] text-[#777168]">Loading system canvas…</p>
                    )}
                  </article>
                );
              })}
              {project.items.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#D8CFC0] p-8 text-center">
                  <p className="text-[14px] font-semibold text-[#27241F]">Empty pack</p>
                  <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-[#777168]">
                    Add Sequence diagrams and System canvases - they render here live, themed, ready to export as one PNG set.
                  </p>
                  <div className="mt-3">
                    <Button size="sm" onClick={() => setPickerOpen(true)}>
                      + Add your first diagram
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {pickerOpen && project && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Add diagram to pack" onClick={(e) => {
          if (e.target === e.currentTarget) setPickerOpen(false);
        }}>
          <div className="mx-auto max-w-2xl rounded-2xl border border-[#E8E2D8] bg-white p-6 shadow-[0_2px_24px_rgba(169,132,80,0.08)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[16px] font-semibold text-[#27241F]">Add diagram</p>
              <Button size="sm" variant="ghost" onClick={() => setPickerOpen(false)}>
                ✕ Close
              </Button>
            </div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Sequences · {sequences.length}</p>
            <ul className="mb-5 max-h-48 space-y-1.5 overflow-y-auto">
              {sequences.map((d) => {
                const added = addedKeys.has(`sequence:${d.id}`);
                return (
                  <li key={d.id} className="flex items-center gap-2 rounded-lg border border-[#E8E2D8] px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[#27241F]">{d.name}</span>
                    <Button size="sm" variant="ghost" disabled={added} onClick={() => addItem("sequence", d.id)}>
                      {added ? "Added" : "+ Add"}
                    </Button>
                  </li>
                );
              })}
              {sequences.length === 0 && <li className="text-[12px] text-[#777168]">No sequences yet - create one on the Sequence tab.</li>}
            </ul>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">System canvases · {systems.length}</p>
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {systems.map((s) => {
                const added = addedKeys.has(`system:${s.id}`);
                return (
                  <li key={s.id} className="flex items-center gap-2 rounded-lg border border-[#E8E2D8] px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[#27241F]">{s.name}</span>
                    <Button size="sm" variant="ghost" disabled={added} onClick={() => addItem("system", s.id)}>
                      {added ? "Added" : "+ Add"}
                    </Button>
                  </li>
                );
              })}
              {systems.length === 0 && <li className="text-[12px] text-[#777168]">No system canvases yet - design one on the System tab.</li>}
            </ul>
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Flows · {systems.length}</p>
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {systems.map((s) => {
                const added = addedKeys.has(`flow:${s.id}`);
                return (
                  <li key={s.id} className="flex items-center gap-2 rounded-lg border border-[#E8E2D8] px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[#27241F]">{s.name}</span>
                    <Button size="sm" variant="ghost" disabled={added} onClick={() => addItem("flow", s.id)}>
                      {added ? "Added" : "+ Add"}
                    </Button>
                  </li>
                );
              })}
              {systems.length === 0 && <li className="text-[12px] text-[#777168]">Flows are a lens on system canvases - design one first.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
