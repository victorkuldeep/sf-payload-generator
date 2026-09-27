"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../ui/Button";
import { ProjectWizard } from "./ProjectWizard";
import { SourceExplorer } from "./SourceExplorer";
import { SfExplorer } from "./SfExplorer";
import { FieldInspector } from "./FieldInspector";
import { MappingTable } from "./MappingTable";
import { RecordPlans } from "./RecordPlans";
import { ExportDialog, ImportDialog } from "./ProjectExchange";
import { DriftReview } from "./DriftReview";
import { ReviewPanel } from "./ReviewPanel";
import { ensureExperience } from "@/lib/experience/migrate";
import { ExperienceWorkspace } from "@/components/experience/ExperienceWorkspace";
import { ApiCatalogPanel } from "@/components/experience/ApiCatalogPanel";
import { DecisionsPanel } from "@/components/experience/DecisionsPanel";
import { useMappingMetadata } from "./useMappingMetadata";
import { buildSnapshot } from "@/lib/mapping/snapshot";
import { deleteProject, duplicateProject, listProjects, loadProject, saveProject, type ProjectSummary } from "@/lib/mapping/store";
import type { MappingProject, MappingRow, RecordPlan, RelationshipDef, SnapshotField } from "@/lib/mapping/types";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type SaveState = "saved" | "saving" | "unsaved" | "error";
type View = "start" | "wizard" | "library";

/** Mapping Studio route: start screen, library, and active workspace. */
export function MappingRoute() {
  const [view, setView] = useState<View>("start");
  const [project, setProject] = useState<MappingProject | null>(null);
  const [library, setLibrary] = useState<ProjectSummary[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ objectName: string; field: SnapshotField } | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [module, setModule] = useState<"overview" | "experience" | "apis" | "decisions" | "deliverables">("overview");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meta = useMappingMetadata();

  const refreshLibrary = useCallback(() => {
    void listProjects()
      .then(setLibrary)
      .catch(() => setLibrary([]));
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const persist = useCallback(async (next: MappingProject, state: SaveState = "saved") => {
    setSaveState("saving");
    try {
      await saveProject({ ...next, updatedAt: new Date().toISOString() });
      setSaveState(state === "saved" ? "saved" : "unsaved");
      refreshLibrary();
    } catch {
      setSaveState("error");
    }
  }, [refreshLibrary]);

  const mutate = useCallback(
    (fn: (p: MappingProject) => MappingProject) => {
      setProject((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setSaveState("unsaved");
        saveTimer.current = setTimeout(() => void persist(next), 900);
        return next;
      });
    },
    [persist]
  );

  const openProject = async (id: string) => {
    const p = await loadProject(id).catch(() => undefined);
    if (!p) return;
    setProject(p);
    setSelectedSource(null);
    setPicked(null);
    setSaveState("saved");
  };

  const confirmMap = (sourcePath: string) => {
    if (!picked) return;
    const now = new Date().toISOString();
    mutate((p) => {
      const existing = p.mappings.find((m) => m.sourcePath === sourcePath);
      if (existing) {
        return {
          ...p,
          mappings: p.mappings.map((m) =>
            m.id === existing.id ? { ...m, objectName: picked.objectName, fieldName: picked.field.name, kind: "direct" as const, updatedAt: now } : m
          ),
        };
      }
      const row: MappingRow = {
        id: uid("row"),
        sourcePath,
        planId: activePlanId,
        objectName: picked.objectName,
        fieldName: picked.field.name,
        kind: "direct",
        status: "mapped",
        updatedAt: now,
      };
      return { ...p, mappings: [...p.mappings, row] };
    });
    setSelectedSource(null);
  };

  const captureSnapshot = async () => {
    if (!project || !meta.session) return;
    setSnapshotBusy(true);
    try {
      const names = [...new Set([...project.mappings.map((m) => m.objectName), ...project.recordPlans.map((r) => r.objectName)])];
      if (names.length === 0) return;
      const entries = [];
      for (const name of names) {
        const describe = await meta.loadDescribe(name);
        const objMeta = meta.objects.find((o) => o.name === name);
        if (describe && objMeta) entries.push({ meta: objMeta, describe });
      }
      if (entries.length === 0) return;
      const now = new Date().toISOString();
      const snapshot = buildSnapshot(uid("snap"), entries, undefined, now);
      mutate((p) => ({ ...p, sfSnapshot: snapshot }));
    } finally {
      setSnapshotBusy(false);
    }
  };

  const switchModule = (m: typeof module) => {
    setModule(m);
    // Lazy migration: experience structures materialize on first open.
    if (m !== "overview") {
      mutate((p) => ensureExperience(p, new Date().toISOString()));
    }
  };

  const mappedCount = project?.mappings.length ?? 0;

  const objectsUsed = useMemo(
    () => [...new Set([...(project?.mappings.map((m) => m.objectName) ?? []), ...(project?.recordPlans.map((r) => r.objectName) ?? [])])],
    [project]
  );

  const activePlan = project?.recordPlans.find((p) => p.id === activePlanId) ?? null;
  const planMismatch =
    activePlan && picked && picked.objectName !== activePlan.objectName
      ? `Field is on ${picked.objectName}, but the active plan (${activePlan.name}) targets ${activePlan.objectName}. Switch plans or pick a ${activePlan.objectName} field.`
      : null;

  if (!project) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[#E8E2D8] bg-white px-4 py-4 text-center">
          <h2 className="text-[15px] font-semibold text-[#27241F]">Integration Mapping Studio</h2>
          <p className="mx-auto mt-1 max-w-xl text-xs text-[#777168]">
            Map an external JSON payload to Salesforce objects and fields in a live workshop. Projects stay in your browser - export a portable file to share.
          </p>
          {view === "start" && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => setView("wizard")}>New Mapping Project</Button>
              <Button variant="ghost" onClick={() => setView("library")}>
                Open Local Project ({library.length})
              </Button>
              <Button variant="ghost" onClick={() => setShowImport(true)}>
                Import Project Configuration
              </Button>
            </div>
          )}
        </div>
        {showImport && (
          <ImportDialog
            onClose={() => setShowImport(false)}
            onImported={(p) => {
              setShowImport(false);
              setProject(p);
              setSaveState("saved");
              refreshLibrary();
            }}
          />
        )}

        {view === "wizard" && (
          <ProjectWizard onCreate={(p) => { setProject(p); void persist(p); }} onCancel={() => setView("start")} />
        )}

        {view === "library" && (
          <LibraryList
            library={library}
            onOpen={(id) => void openProject(id)}
            onBack={() => setView("start")}
            onChanged={refreshLibrary}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Project header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[#E8E2D8] bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-[#27241F]">{project.name}</p>
          <p className="font-mono text-[10px] text-[#A39B8E]">
            {project.sourceApi ?? "no source API"} → {project.targetSystem} · {project.status} · v{project.versions.length} · {mappedCount} mappings
            {project.sfSnapshot ? ` · snapshot ${project.sfSnapshot.fingerprint}` : " · no metadata snapshot"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
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
            {saveState === "saved" ? "Saved locally" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed — Retry" : "Unsaved changes"}
          </span>
          {saveState === "error" && (
            <Button size="sm" variant="ghost" onClick={() => void persist(project)}>
              Retry
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void persist(project)}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowReview((v) => !v)} aria-pressed={showReview}>
            Review
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowExport(true)}>
            Export
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setProject(null);
              setView("library");
              refreshLibrary();
            }}
          >
            Close
          </Button>
        </div>
      </div>
      {showExport && <ExportDialog project={project} onClose={() => setShowExport(false)} />}

      {/* Module navigation - one project, five workspaces */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Project modules">
        {(
          [
            ["overview", "Overview"],
            ["experience", "Experience"],
            ["apis", "API Catalog"],
            ["decisions", "Decisions"],
            ["deliverables", "Deliverables"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={module === id}
            onClick={() => switchModule(id)}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer ${
              module === id
                ? "border-[#211F1B] bg-[#211F1B] text-white"
                : "border-[#E8E2D8] bg-white text-[#777168] hover:text-[#27241F]"
            }`}
          >
            {label}
            {id === "experience" && project.experience && project.experience.screens.length > 0 && (
              <span className="ml-1.5 font-mono text-[10px] opacity-70">{project.experience.screens.length}</span>
            )}
          </button>
        ))}
      </div>

      {module === "overview" && (
      <>
      {/* Three-region workspace */}
      <div id="mapping-workspace" className="grid items-start gap-3 xl:grid-cols-[23%_52%_25%] lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-xl border border-[#E8E2D8] bg-white p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">
            Source · {project.source?.paths.length ?? 0} paths
          </p>
          {project.source ? (
            <SourceExplorer paths={project.source.paths} mappings={project.mappings} selected={selectedSource} onSelect={setSelectedSource} />
          ) : (
            <p className="text-[12px] text-[#A39B8E]">No source loaded.</p>
          )}
        </div>

        <div className="rounded-xl border border-[#E8E2D8] bg-white p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Mapping table</p>
          <div className="mb-3">
            <RecordPlans
              project={project}
              activePlanId={activePlanId}
              onActivePlan={setActivePlanId}
              onAddPlan={(plan: RecordPlan) => {
                mutate((p) => ({ ...p, recordPlans: [...p.recordPlans, plan] }));
                setActivePlanId(plan.id);
              }}
              onRemovePlan={(id) =>
                mutate((p) => ({
                  ...p,
                  recordPlans: p.recordPlans.filter((r) => r.id !== id),
                  relationships: p.relationships.filter((r) => r.childPlanId !== id && r.parentPlanId !== id),
                  mappings: p.mappings.map((m) => (m.planId === id ? { ...m, planId: null } : m)),
                }))
              }
              onAddRelationship={(rel: RelationshipDef) =>
                mutate((p) => ({
                  ...p,
                  relationships: p.relationships.some((r) => r.id === rel.id)
                    ? p.relationships.map((r) => (r.id === rel.id ? rel : r))
                    : [...p.relationships, rel],
                }))
              }
              onRemoveRelationship={(id) => mutate((p) => ({ ...p, relationships: p.relationships.filter((r) => r.id !== id) }))}
              onToggleConfirm={(id) =>
                mutate((p) => ({ ...p, relationships: p.relationships.map((r) => (r.id === id ? { ...r, confirmed: !r.confirmed } : r)) }))
              }
            />
          </div>
          <MappingTable
            project={project}
            selectedSource={selectedSource}
            onSelectSource={setSelectedSource}
            pendingTarget={picked}
            planMismatch={planMismatch}
            onConfirmMap={confirmMap}
            onUpdateRow={(id, patch) => mutate((p) => ({ ...p, mappings: p.mappings.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m)) }))}
            onRemoveRow={(id) => mutate((p) => ({ ...p, mappings: p.mappings.filter((m) => m.id !== id) }))}
          />
        </div>

        <div className="space-y-3 lg:col-span-2 xl:col-span-1">
          <div className="rounded-xl border border-[#E8E2D8] bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Salesforce</p>
              <Button size="sm" variant="ghost" disabled={!meta.connected || snapshotBusy || objectsUsed.length === 0} onClick={() => void captureSnapshot()} title={objectsUsed.length === 0 ? "Map a field first" : "Freeze current metadata for mapped objects"}>
                {snapshotBusy ? "Capturing…" : "Capture snapshot"}
              </Button>
            </div>
            <SfExplorer
              connected={meta.connected}
              loading={meta.loading}
              objects={meta.objects}
              describes={meta.describes}
              snapshotObjects={project.sfSnapshot?.objects ?? []}
              onEnsureDescribe={(n) => void meta.loadDescribe(n)}
              onPickField={(objectName, field) => setPicked({ objectName, field })}
              activeObject={picked?.objectName ?? null}
              activeField={picked?.field.name ?? null}
            />
          </div>
          <div className="rounded-xl border border-[#E8E2D8] bg-white p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Inspector</p>
            <FieldInspector objectName={picked?.objectName ?? null} field={picked?.field ?? null} />
          </div>
        </div>
      </div>

      {/* Drift + review + handoff */}
      <DriftReview
        project={project}
        connected={meta.connected}
        objects={meta.objects}
        loadDescribe={meta.loadDescribe}
        onApplySnapshot={(snapshot, affected) =>
          mutate((p) => {
            const now = new Date().toISOString();
            return {
              ...p,
              sfSnapshot: snapshot,
              versions: [
                ...p.versions,
                {
                  id: uid("ver"),
                  label: `pre-refresh ${now}`,
                  createdAt: now,
                  summary: `Snapshot applied after drift check (${affected.length} findings). Previous snapshot ${p.sfSnapshot?.fingerprint ?? "none"}.`,
                  mappings: p.mappings,
                  decisions: p.decisions,
                  recordPlans: p.recordPlans,
                  relationships: p.relationships,
                  fingerprint: p.sfSnapshot?.fingerprint ?? "",
                },
              ],
            };
          })
        }
      />

      {showReview && (
        <ReviewPanel
          project={project}
          onMutate={mutate}
          onFocus={(path) => {
            setSelectedSource(path);
            if (path) {
              document.getElementById("mapping-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
        />
      )}
      </>
      )}

      {module === "experience" && project.experience && (
        <ExperienceWorkspace project={project} onMutate={mutate} onOpenApis={() => switchModule("apis")} />
      )}

      {module === "apis" && project.apiCatalog && (
        <ApiCatalogPanel project={project} onMutate={mutate} onOpenIntegration={() => switchModule("overview")} />
      )}

      {module === "decisions" && (
        <DecisionsPanel project={project} onMutate={mutate} />
      )}

      {module === "deliverables" && (
        <div className="rounded-xl border border-[#E8E2D8] bg-white p-8 text-center">
          <p className="text-[14px] font-semibold text-[#27241F]">Deliverables</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-[#777168]">
            Portable ZIP packages, the Word architecture pack and the experience workbook arrive in Sprints 9-10.
          </p>
        </div>
      )}
    </div>
  );
}

function LibraryList({
  library,
  onOpen,
  onBack,
  onChanged,
}: {
  library: ProjectSummary[];
  onOpen: (id: string) => void;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const act = async (fn: () => Promise<void>) => {
    await fn().catch(() => undefined);
    setConfirmDelete(null);
    setRenaming(null);
    onChanged();
  };

  return (
    <div className="rounded-xl border border-[#E8E2D8] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[#27241F]">Local projects · {library.length}</p>
        <Button size="sm" variant="ghost" onClick={onBack}>
          ← Start
        </Button>
      </div>
      {library.length === 0 && <p className="py-6 text-center text-[13px] text-[#A39B8E]">No saved projects yet.</p>}
      <ul className="space-y-2">
        {library.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#F0EBE0] px-3 py-2">
            <button type="button" onClick={() => onOpen(s.id)} className="min-w-0 flex-1 cursor-pointer text-left">
              <span className="block truncate text-[13px] font-semibold text-[#27241F] hover:underline">{s.name}</span>
              <span className="block font-mono text-[10px] text-[#A39B8E]">
                {s.sourceApi ?? "—"} · {s.status} · {s.mappingCount} mappings · {s.unmappedCount} unmapped · {s.decisionOpenCount} open decisions · v{s.versionCount}
              </span>
            </button>
            {renaming === s.id ? (
              <span className="flex items-center gap-1.5">
                <input
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  aria-label="New project name"
                  className="w-40 rounded-lg border border-[#E8E2D8] px-2 py-1 text-[12px] focus:border-[#A98450] focus:outline-none"
                />
                <Button
                  size="sm"
                  onClick={() =>
                    act(async () => {
                      const p = await loadProject(s.id);
                      if (p && renameText.trim()) await saveProject({ ...p, name: renameText.trim(), updatedAt: new Date().toISOString() });
                    })
                  }
                >
                  Save
                </Button>
              </span>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRenaming(s.id);
                    setRenameText(s.name);
                  }}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    act(async () => {
                      const p = await loadProject(s.id);
                      if (p) await saveProject(duplicateProject(p, `map-${Date.now().toString(36)}`, new Date().toISOString()));
                    })
                  }
                >
                  Duplicate
                </Button>
                {confirmDelete === s.id ? (
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[#B3261E] font-semibold">Delete?</span>
                    <Button size="sm" variant="ghost" onClick={() => act(() => deleteProject(s.id))}>
                      Yes
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                      No
                    </Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(s.id)}>
                    Delete
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
