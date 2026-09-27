"use client";

import { useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import {
  assetDisplayUrl,
  checkImageFile,
  decodeDimensions,
  deleteAssetRecord,
  getAssetRecord,
  hashBlob,
  makeThumbnail,
  revokeDisplayUrl,
  saveAssetRecord,
} from "@/lib/experience/assets";
import { logChange } from "@/lib/experience/migrate";
import { AddScreenDialog, EditScreenDialog, ReplaceImage } from "./ScreenDialogs";
import { ComponentInspector } from "./ComponentInspector";
import { CoveragePanel } from "./CoveragePanel";
import { JourneyPanel } from "./JourneyPanel";
import { ScreenCanvas } from "./ScreenCanvas";
import type { Rect } from "@/lib/experience/geometry";
import { deleteScreenCascade, reorderScreens, screenImpact } from "@/lib/experience/screens";
import type { MappingProject } from "@/lib/mapping/types";
import type { Screen, ScreenAsset } from "@/lib/experience/types";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Stamp project + experience updatedAt. */
function touch(p: MappingProject): MappingProject {
  const now = new Date().toISOString();
  if (p.experience) p.experience.updatedAt = now;
  p.updatedAt = now;
  return p;
}

/** Cache of thumbnail storageKey -> object URL. Revoked on unmount. */
function useAssetUrls(keys: string[]): Map<string, string> {
  const cache = useRef<Map<string, string>>(new Map());
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const suffixed of keys) {
        if (cache.current.has(suffixed)) continue;
        const storageKey = suffixed.endsWith(":thumb") ? suffixed.slice(0, -6) : suffixed;
        try {
          const rec = await getAssetRecord(storageKey);
          if (!cancelled && rec?.thumbnail) {
            cache.current.set(suffixed, assetDisplayUrl(rec.thumbnail));
            force((n) => n + 1);
          }
        } catch {
          /* asset unreadable - list shows placeholder */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join("|")]);

  useEffect(
    () => () => {
      for (const url of cache.current.values()) revokeDisplayUrl(url);
      cache.current.clear();
    },
    []
  );

  return new Map(cache.current);
}

/** Experience workspace: inventory, canvas, journeys, coverage. */
export function ExperienceWorkspace({
  project,
  onMutate,
  onOpenApis,
}: {
  project: MappingProject;
  onMutate: (fn: (p: MappingProject) => MappingProject) => void;
  onOpenApis: () => void;
}) {
  const exp = project.experience!;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(exp.screens[0]?.id ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Screen | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const thumbKeys = exp.assets.filter((a) => a.thumbnailStorageKey).map((a) => `${a.thumbnailStorageKey}:thumb`);
  const urls = useAssetUrls(thumbKeys);

  const filtered = exp.screens.filter((s) => {
    const q = query.trim().toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.route?.toLowerCase().includes(q) || s.feature?.toLowerCase().includes(q);
  });

  const selected = exp.screens.find((s) => s.id === selectedId) ?? null;

  const removeScreen = (id: string) => {
    const assetKeys = exp.assets.filter((a) => a.screenId === id).flatMap((a) => [a.storageKey, a.thumbnailStorageKey].filter(Boolean) as string[]);
    onMutate((p) => {
      if (!p.experience) return p;
      const next = { ...p, experience: deleteScreenCascade(p.experience, id) };
      logChange(next, "screen", id, "deleted", "Screen deleted with its scoped artifacts.", new Date().toISOString());
      return touch(next);
    });
    for (const k of assetKeys) void deleteAssetRecord(k).catch(() => undefined);
    if (selectedId === id) setSelectedId(null);
    setConfirmDelete(null);
  };

  const move = (from: number, dir: -1 | 1) => {
    onMutate((p) => {
      if (!p.experience) return p;
      const idx = p.experience.screens.findIndex((s) => s.id === filtered[from]?.id);
      if (idx < 0) return p;
      return touch({ ...p, experience: { ...p.experience, screens: reorderScreens(p.experience.screens, idx, idx + dir) } });
    });
  };

  return (
    <div className="space-y-3">
    <div className="grid items-start gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Screen inventory */}
      <div className="rounded-xl border border-[#E8E2D8] bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">
            Screens · {exp.screens.length}
          </p>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            Add screen
          </Button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search screens…"
          aria-label="Search screens"
          spellCheck={false}
          className="mb-2 w-full rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[12px] focus:border-[#A98450] focus:outline-none"
        />
        <ul className="max-h-[520px] space-y-1.5 overflow-y-auto">
          {filtered.map((s, i) => {
            const asset = exp.assets.find((a) => a.screenId === s.id);
            const thumbUrl = asset?.thumbnailStorageKey ? urls.get(`${asset.thumbnailStorageKey}:thumb`) : undefined;
            const comps = exp.components.filter((c) => c.screenId === s.id).length;
            const binds = exp.bindings.filter((b) => b.screenId === s.id).length;
            const active = selectedId === s.id;
            return (
              <li key={s.id} className={`rounded-xl border ${active ? "border-[#A98450] bg-[#FAF3E3]" : "border-[#F0EBE0] bg-white"}`}>
                <button type="button" onClick={() => setSelectedId(s.id)} aria-pressed={active} className="flex w-full cursor-pointer items-center gap-2 p-2 text-left">
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl} alt="" aria-hidden="true" className="h-10 w-16 shrink-0 rounded-md border border-[#E8E2D8] object-cover" />
                  ) : (
                    <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-[#E8E2D8] font-mono text-[9px] text-[#A39B8E]">
                      no img
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-[#27241F]">{s.name}</span>
                    <span className="block truncate font-mono text-[10px] text-[#A39B8E]">
                      {s.status} · {comps} comps · {binds} APIs
                    </span>
                  </span>
                </button>
                <span className="flex items-center gap-1 px-2 pb-1.5">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.name} up`} className="rounded px-1 font-mono text-[11px] text-[#A39B8E] hover:text-[#27241F] disabled:opacity-30 cursor-pointer">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === filtered.length - 1} aria-label={`Move ${s.name} down`} className="rounded px-1 font-mono text-[11px] text-[#A39B8E] hover:text-[#27241F] disabled:opacity-30 cursor-pointer">
                    ↓
                  </button>
                  <button type="button" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`} className="rounded px-1 text-[11px] text-[#A98450] hover:bg-[#F5EEDF] cursor-pointer">
                    edit
                  </button>
                  {confirmDelete === s.id ? (
                    <span className="flex items-center gap-1 text-[10px]">
                      <span className="font-semibold text-[#B3261E]">
                        {(() => {
                          const imp = screenImpact(exp, s.id);
                          const total = imp.components + imp.annotations + imp.actions + imp.bindings;
                          return total > 0 ? `Delete + ${total} linked?` : "Delete?";
                        })()}
                      </span>
                      <button type="button" onClick={() => removeScreen(s.id)} className="rounded px-1 font-semibold text-[#B3261E] hover:bg-[#F9E8E6] cursor-pointer">
                        Yes
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="rounded px-1 text-[#777168] cursor-pointer">
                        No
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(s.id)} aria-label={`Delete ${s.name}`} className="rounded px-1 text-[11px] text-[#B3261E] hover:bg-[#F9E8E6] cursor-pointer">
                      delete
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="rounded-xl border border-dashed border-[#E8E2D8] p-6 text-center">
              <p className="text-[13px] font-semibold text-[#27241F]">Add your first screen</p>
              <p className="mx-auto mt-1 max-w-[220px] text-[11px] text-[#777168]">
                Upload a PNG/WebP export or paste a screenshot to start mapping the UI to backend APIs.
              </p>
            </li>
          )}
        </ul>
      </div>

      {/* Screen detail (canvas arrives Sprint 3) */}
      <div className="rounded-xl border border-[#E8E2D8] bg-white p-4">
        {!selected ? (
          <p className="py-10 text-center text-[13px] text-[#A39B8E]">Select a screen to inspect it.</p>
        ) : (
          <ScreenDetail
            project={project}
            screen={selected}
            onMutate={onMutate}
          />
        )}
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <JourneyPanel project={project} onMutate={onMutate} onOpenScreen={setSelectedId} />
        <CoveragePanel project={project} onOpenScreen={setSelectedId} onOpenApis={onOpenApis} />
      </div>

      {showAdd && (
        <AddScreenDialog
          projectId={project.id}
          onClose={() => setShowAdd(false)}
          onCreated={(screen, asset) => {
            onMutate((p) => {
              if (!p.experience) return p;
              const next = touch({
                ...p,
                experience: {
                  ...p.experience,
                  screens: [...p.experience.screens, screen],
                  assets: asset ? [...p.experience.assets, asset] : p.experience.assets,
                },
              });
              logChange(next, "screen", screen.id, "created", `Screen "${screen.name}" added.`, new Date().toISOString());
              return next;
            });
            setSelectedId(screen.id);
            setShowAdd(false);
          }}
        />
      )}

      {editing && (
        <EditScreenDialog
          screen={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            onMutate((p) => {
              if (!p.experience) return p;
              return touch({ ...p, experience: { ...p.experience, screens: p.experience.screens.map((s) => (s.id === editing.id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)) } });
            });
            setEditing(null);
          }}
        />
      )}
    </div>
    </div>
  );
}

function ScreenDetail({
  project,
  screen,
  onMutate,
}: {
  project: MappingProject;
  screen: Screen;
  onMutate: (fn: (p: MappingProject) => MappingProject) => void;
}) {
  const exp = project.experience!;
  const asset = exp.assets.find((a) => a.screenId === screen.id);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [selectedAnn, setSelectedAnn] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    if (asset) {
      void getAssetRecord(asset.storageKey)
        .then((rec) => {
          if (!cancelled && rec) {
            url = assetDisplayUrl(rec.blob);
            setImgUrl(url);
          }
        })
        .catch(() => undefined);
    } else {
      setImgUrl(null);
    }
    return () => {
      cancelled = true;
      if (url) revokeDisplayUrl(url);
    };
  }, [asset?.storageKey]);

  const comps = exp.components.filter((c) => c.screenId === screen.id);
  const anns = exp.annotations.filter((a) => a.screenId === screen.id).sort((a, b) => a.zIndex - b.zIndex);
  const selectedAnnotation = anns.find((a) => a.id === selectedAnn) ?? null;
  const linkedComponent = selectedAnnotation?.componentId
    ? (comps.find((c) => c.id === selectedAnnotation.componentId) ?? null)
    : null;

  const mutateAnn = (fn: (list: typeof anns) => typeof anns, summary: string, entityId: string) => {
    onMutate((p) => {
      if (!p.experience) return p;
      const ids = new Set(anns.map((a) => a.id));
      const kept = p.experience.annotations.filter((a) => !ids.has(a.id));
      const next = touch({ ...p, experience: { ...p.experience, annotations: [...kept, ...fn(anns)] } });
      logChange(next, "annotation", entityId, "updated", summary, new Date().toISOString());
      return next;
    });
  };

  const createAnn = (rect: Rect) => {
    const id = uid("ann");
    const label = `Region ${anns.length + 1}`;
    onMutate((p) => {
      if (!p.experience) return p;
      const maxZ = p.experience.annotations.reduce((m, a) => Math.max(m, a.zIndex), -1);
      const now = new Date().toISOString();
      const next = touch({
        ...p,
        experience: {
          ...p.experience,
          annotations: [
            ...p.experience.annotations,
            { id, screenId: screen.id, label, geometry: { ...rect, coordinateSpace: "source-pixels" as const }, zIndex: maxZ + 1, createdAt: now, updatedAt: now },
          ],
        },
      });
      logChange(next, "annotation", id, "created", `Region "${label}" drawn on ${screen.name}.`, now);
      return next;
    });
    setSelectedAnn(id);
  };

  return (
    <div>
      <p className="text-[15px] font-semibold text-[#27241F]">{screen.name}</p>
      <p className="font-mono text-[11px] text-[#A39B8E]">
        {screen.route ?? "no route"} · {screen.status}
        {asset ? ` · ${asset.width}×${asset.height} · ${(asset.byteSize / 1024).toFixed(0)} KB` : " · no image"}
      </p>
      {imgUrl && asset ? (
        <div className="mt-3">
          <ScreenCanvas
            imageUrl={imgUrl}
            imageAlt={`Screenshot of ${screen.name}`}
            sourceW={asset.width}
            sourceH={asset.height}
            annotations={anns}
            selectedId={selectedAnn}
            onSelect={setSelectedAnn}
            onCreate={createAnn}
            onMove={(id, rect) =>
              mutateAnn((list) => list.map((a) => (a.id === id ? { ...a, geometry: { ...rect, coordinateSpace: "source-pixels" as const }, updatedAt: new Date().toISOString() } : a)), `Region moved/resized on ${screen.name}.`, id)
            }
            onDelete={(id) => {
              onMutate((p) => {
                if (!p.experience) return p;
                const target = p.experience.annotations.find((a) => a.id === id);
                const next = touch({ ...p, experience: { ...p.experience, annotations: p.experience.annotations.filter((a) => a.id !== id) } });
                logChange(next, "annotation", id, "deleted", `Region "${target?.label ?? id}" deleted (components preserved).`, new Date().toISOString());
                return next;
              });
              if (selectedAnn === id) setSelectedAnn(null);
            }}
            onLabel={(id, label) =>
              mutateAnn((list) => list.map((a) => (a.id === id ? { ...a, label, updatedAt: new Date().toISOString() } : a)), `Region renamed to "${label}".`, id)
            }
          />
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-[#E8E2D8] p-8 text-center text-[12px] text-[#A39B8E]">
          No screenshot yet. Add an image to annotate regions.
        </p>
      )}
      <div className="mt-3">
        <Button size="sm" variant="ghost" onClick={() => setReplacing((v) => !v)}>
          {asset ? "Replace image…" : "Add image…"}
        </Button>
      </div>
      {replacing && asset && (
        <ReplaceImage
          projectId={project.id}
          screen={screen}
          oldAsset={asset}
            onDone={(next) => {
            onMutate((p) => {
              if (!p.experience) return p;
              const now = new Date().toISOString();
              const dimsChanged = next.width !== asset.width || next.height !== asset.height;
              const updated = touch({
                ...p,
                experience: {
                  ...p.experience,
                  assets: p.experience.assets.map((a) => (a.id === asset.id ? next : a)),
                  screens: p.experience.screens.map((s) =>
                    s.id === screen.id
                      ? {
                          ...s,
                          canvas: { sourceWidth: next.width, sourceHeight: next.height, aspectRatio: next.width / next.height },
                          status: dimsChanged ? "changed" : s.status,
                          updatedAt: now,
                        }
                      : s
                  ),
                },
              });
              logChange(updated, "asset", asset.id, dimsChanged ? "replaced-dimensions-changed" : "replaced", `Screenshot replaced${dimsChanged ? " - dimensions changed, annotations need review" : ""}.`, now);
              return updated;
            });
            setReplacing(false);
          }}
          onCancel={() => setReplacing(false)}
        />
      )}
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">
        Components · {comps.length}
      </p>

      {selectedAnnotation && !linkedComponent && (
        <LinkComponentPanel
          screenId={screen.id}
          annotationId={selectedAnnotation.id}
          defaultName={selectedAnnotation.label}
          candidates={comps}
          onMutate={onMutate}
        />
      )}

      {selectedAnnotation && linkedComponent && (
        <ComponentInspector
          project={project}
          component={linkedComponent}
          annotationLabel={selectedAnnotation.label}
          onMutate={onMutate}
        />
      )}

      {!selectedAnnotation && comps.length > 0 && (
        <ul className="mt-2 space-y-1">
          {comps.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-[#F0EBE0] px-2 py-1.5 text-[12px]">
              <span className="flex-1">
                <span className="font-semibold text-[#27241F]">{c.name}</span>{" "}
                <span className="font-mono text-[10px] text-[#A39B8E]">{c.componentType} · {c.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkComponentPanel({
  screenId,
  annotationId,
  defaultName,
  candidates,
  onMutate,
}: {
  screenId: string;
  annotationId: string;
  defaultName: string;
  candidates: { id: string; name: string }[];
  onMutate: (fn: (p: MappingProject) => MappingProject) => void;
}) {
  const [name, setName] = useState(defaultName.startsWith("Region ") ? "" : defaultName);
  const [linkId, setLinkId] = useState("");

  const link = () => {
    if (!linkId) return;
    const now = new Date().toISOString();
    onMutate((p) => {
      if (!p.experience) return p;
      const next = {
        ...p,
        experience: {
          ...p.experience,
          annotations: p.experience.annotations.map((a) => (a.id === annotationId ? { ...a, componentId: linkId, updatedAt: now } : a)),
          updatedAt: now,
        },
        updatedAt: now,
      };
      logChange(next, "annotation", annotationId, "linked", "Region linked to an existing component.", now);
      return next;
    });
  };

  const create = () => {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const id = uid("comp");
    onMutate((p) => {
      if (!p.experience) return p;
      const next = {
        ...p,
        experience: {
          ...p.experience,
          components: [
            ...p.experience.components,
            {
              id, screenId, name: name.trim(), componentType: "custom" as const,
              requirementIds: [], bindingIds: [], actionIds: [], stateIds: [],
              status: "draft" as const, tags: [], createdAt: now, updatedAt: now,
            },
          ],
          annotations: p.experience.annotations.map((a) => (a.id === annotationId ? { ...a, componentId: id, updatedAt: now } : a)),
          updatedAt: now,
        },
        updatedAt: now,
      };
      logChange(next, "component", id, "created", `Component "${name.trim()}" created from a region.`, now);
      return next;
    });
  };

  return (
    <div className="mt-3 rounded-xl border border-[#E8E2D8] bg-[#FAF8F2] p-3">
      <p className="mb-2 text-[12px] font-semibold text-[#27241F]">Region has no component yet</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Component name (e.g. OrderLineItems)"
          aria-label="New component name"
          spellCheck={false}
          className="min-w-[180px] flex-1 rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[12px] focus:border-[#A98450] focus:outline-none"
        />
        <Button size="sm" disabled={!name.trim()} onClick={create}>
          Create component
        </Button>
      </div>
      {candidates.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-[#777168]">or link to</span>
          <select value={linkId} onChange={(e) => setLinkId(e.target.value)} aria-label="Existing component" className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-[12px]">
            <option value="">choose…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" disabled={!linkId} onClick={link}>
            Link
          </Button>
        </div>
      )}
    </div>
  );
}
