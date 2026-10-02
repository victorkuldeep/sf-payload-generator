"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Controls,
  useReactFlow,
  MarkerType,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Badge from "../ui/Badge";
import {
  SYSTEM_TEMPLATES,
  newProject,
  newSystemFromTemplate,
  newId,
  validateProject,
  exportProject,
  importProject,
  projectFileName,
  connectionReadiness,
  operationsForSystem,
  type SystemNode,
  type SystemConnection,
  type SystemProject,
  type SystemTemplate,
  type SystemInterface,
  type SystemOperation,
  type OperationMethod,
} from "@/lib/system-design/model";
import {
  saveSystemProject,
  listSystemProjects,
  loadSystemProject,
  deleteSystemProject,
} from "@/lib/system-design/store";
import { buildDemoProject, buildGroqSampleProject } from "@/lib/system-design/demo";
import { SystemNodeView, SystemGlyph, type SystemNodeData } from "./SystemNode";
import { TestRunner } from "./TestRunner";
import { RunEdgeDialog } from "./RunEdgeDialog";
import { ChainRunDialog } from "./ChainRunDialog";
import { ProjectNotesModal } from "./ProjectNotesModal";
import { CredentialsModal } from "./CredentialsModal";
import { TemplatesModal } from "./TemplatesModal";
import {
  findMissingVars,
  resolveEnvVars,
  looksLikeSecret,
  type CredVault,
} from "@/lib/system-design/credentials";

const CRED_VAULT_KEY = "sd_cred_vault";

function loadCredVault(): CredVault {
  try {
    const raw = sessionStorage.getItem(CRED_VAULT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: CredVault = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v) out[k] = v;
      }
      return out;
    }
  } catch {
    /* corrupted vault never blocks the canvas */
  }
  return {};
}
import type { CanvasTodo } from "@/lib/inbox/types";

const nodeTypes = { system: SystemNodeView } as const;

type SubTab = "canvas" | "flow" | "api" | "transform" | "scenarios" | "runs" | "settings";

const PLANNED_TABS: { id: Exclude<SubTab, "canvas">; label: string; why: string }[] = [
  { id: "flow", label: "Flow Lab", why: "Planned - workflow orchestration arrives after the API layer." },
  { id: "api", label: "API Catalog", why: "Planned - interfaces and operations attach to systems next." },
  { id: "transform", label: "Transformations", why: "Planned - declarative mappings arrive with workflows." },
  { id: "scenarios", label: "Scenarios", why: "Planned - environments and test inputs arrive with execution." },
  { id: "runs", label: "Runs & Observability", why: "Planned - nothing executes in the design slice." },
  { id: "settings", label: "Settings", why: "Planned - environments, policies and retention arrive with execution." },
];

interface Snapshot {
  systems: SystemNode[];
  connections: SystemConnection[];
}

const snapOf = (p: SystemProject): Snapshot => ({
  systems: JSON.parse(JSON.stringify(p.systems)) as SystemNode[],
  connections: JSON.parse(JSON.stringify(p.connections)) as SystemConnection[],
});

function toFlowNodes(project: SystemProject): Node<SystemNodeData>[] {
  return project.systems.map((s) => ({
    id: s.id,
    type: "system",
    position: s.position,
    data: { name: s.name, systemType: s.systemType, iconKey: s.iconKey, draft: true },
  }));
}

function toFlowEdges(project: SystemProject, viz?: Record<string, "running" | "ok" | "failed">): Edge[] {
  return project.connections.map((c) => {
    const ready = connectionReadiness(c, project) === "ready";
    const v = viz?.[c.id];
    const color = v === "failed" ? "#B84C42" : v === "running" ? "#A98450" : v === "ok" || ready ? "#32815B" : undefined;
    return {
      id: c.id,
      source: c.sourceId,
      target: c.targetId,
      label: c.label || undefined,
      animated: !!v || ready,
      // Fat invisible hit area: dashed links are one pixel wide visually.
      interactionWidth: 40,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: color ?? "#8A8070",
      },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 6,
      labelBgStyle: { fill: "#FFFFFF", fillOpacity: 0.92 },
      labelStyle: { fontSize: 10, fontFamily: "monospace" },
      style: color ? { stroke: color, strokeWidth: 2 } : undefined,
    };
  });
}

function DesignerCanvas({
  project,
  onMoveSystems,
  onDragStartNode,
  onConnectSystems,
  onSelect,
  selNodeId,
  selEdgeId,
  onDropTemplate,
  emptyAction,
  present,
  onTogglePresent,
  runVis,
  miniMapOn,
  onToggleMiniMap,
}: {
  project: SystemProject;
  onMoveSystems: (moves: { id: string; x: number; y: number }[]) => void;
  onDragStartNode: () => void;
  onConnectSystems: (sourceId: string, targetId: string) => void;
  onSelect: (nodeId: string | null, edgeId: string | null) => void;
  selNodeId: string | null;
  selEdgeId: string | null;
  onDropTemplate: (t: SystemTemplate, at: { x: number; y: number }) => void;
  emptyAction: () => void;
  present: boolean;
  onTogglePresent: () => void;
  runVis: Record<string, "running" | "ok" | "failed">;
  miniMapOn: boolean;
  onToggleMiniMap: () => void;
}) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const nodes = useMemo(() => toFlowNodes(project), [project]);
  // Selection is derived from parent state so inspector and canvas agree.
  const selNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selNodeId })),
    [nodes, selNodeId]
  );
  const edges = useMemo(() => toFlowEdges(project, runVis), [project, runVis]);
  const selEdges = useMemo(
    () => edges.map((e) => ({ ...e, selected: e.id === selEdgeId })),
    [edges, selEdgeId]
  );

  return (
    <div
      className="relative h-full min-h-[420px] w-full overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)]"
      onDrop={(e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData("application/sd-system");
        if (!raw) return;
        const t = SYSTEM_TEMPLATES.find((x) => x.systemType === raw);
        if (!t) return;
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        onDropTemplate(t, screenToFlowPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top }));
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
    >
      <ReactFlow
        nodes={selNodes}
        edges={selEdges}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={(changes) => {          const moves: { id: string; x: number; y: number }[] = [];
          for (const c of changes) {
            if (c.type === "position" && c.position && !c.dragging) {
              moves.push({ id: c.id, x: c.position.x, y: c.position.y });
            }
          }
          if (moves.length > 0) onMoveSystems(moves);
        }}
        onNodeDragStart={onDragStartNode}
        onConnect={(c: Connection) => {
          if (c.source && c.target && c.source !== c.target) onConnectSystems(c.source, c.target);
        }}
        onSelectionChange={({ nodes: ns, edges: es }) => {
          onSelect(ns[0]?.id ?? null, es[0]?.id ?? null);
        }}
        onPaneClick={() => onSelect(null, null)}
        minZoom={0.15}
        fitView
      >
        <Background gap={22} size={1.2} color="#DDD3BC" bgColor="#FAF8F2" />
        {miniMapOn && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor="#D9CFB6"
            nodeStrokeColor="#9A7653"
            style={{ background: "#FFFFFF", border: "1px solid #DDD3BC", borderRadius: 8 }}
            maskColor="rgba(250, 248, 242, 0.75)"
          />
        )}
        <Controls position="bottom-left" />
      </ReactFlow>
      {project.systems.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 pointer-events-none">
          <div className="pointer-events-auto max-w-sm rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-5 text-center shadow-[0_12px_36px_-16px_rgba(24,20,12,0.4)]">
            <p className="text-[11px] font-bold uppercase tracking-[1.8px] text-[var(--color-accent-dark)]">
              System Design
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ivory-700">
              Drag a system in from the inventory - or start from a template.
            </p>
            <p className="mt-2.5 text-[11px] text-ivory-500">⌘/Ctrl+Z undo · Del removes · drag between nodes to connect</p>
            <Button size="sm" className="mt-3" onClick={emptyAction}>
              Browse templates
            </Button>
          </div>
        </div>
      )}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        <span
          className="hidden sm:flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] text-ivory-600"
          title="Draft edges are static; fully-bound edges flow. Bind operations in the inspector."
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" /> draft
          <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[#32815B]" aria-hidden="true" /> ready
        </span>
        <button
          type="button"
          onClick={onTogglePresent}
          aria-label={present ? "Exit full screen" : "Enter full screen"}
          title={present ? "Exit full screen" : "Full screen: hide header, footer and bars for presenting"}
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1.5 text-ivory-700 hover:border-[var(--color-accent)] hover:text-ivory-950 transition-colors cursor-pointer"
        >
          {present ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => fitView({ padding: 0.18, maxZoom: 1 })}
          title="Fit canvas to view"
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-ivory-700 hover:border-[var(--color-accent)] hover:text-ivory-950 transition-colors cursor-pointer"
        >
          Fit view
        </button>
        <button
          type="button"
          onClick={onToggleMiniMap}
          aria-pressed={miniMapOn}
          title={miniMapOn ? "Hide the overview map" : "Show the overview map"}
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${miniMapOn ? "border-bronze-500 bg-bronze-100 text-bronze-700" : "border-[var(--color-line)] bg-[var(--color-surface)] text-ivory-700 hover:border-[var(--color-accent)] hover:text-ivory-950"}`}
        >
          Map
        </button>
      </div>
      {project.systems.length > 0 && project.connections.length === 0 && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
          <p className="rounded-full border border-bronze-300 bg-bronze-100 px-3 py-1.5 text-[11px] font-semibold text-bronze-700 shadow-sm">
            Drag from a bronze dot to another node - or pick Connect to… in the inspector
          </p>
        </div>
      )}
    </div>
  );
}

export function SystemDesigner() {
  const [project, setProject] = useState<SystemProject | null>(null);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const [selEdgeId, setSelEdgeId] = useState<string | null>(null);
  const [testOpId, setTestOpId] = useState<string | null>(null);
  const [runChainEdgeId, setRunChainEdgeId] = useState<string | null>(null);
  /** Ephemeral execution paint: edgeId -> run status. Cleared on close/rerun. */
  const [runVis, setRunVis] = useState<Record<string, "running" | "ok" | "failed">>({});
  const [notesOpen, setNotesOpen] = useState(false);
  const [credOpen, setCredOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  /** Overview map: hidden by default, toggle lives on the canvas. Choice persists per browser. */
  const [miniMapOn, setMiniMapOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sd_minimap") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("sd_minimap", miniMapOn ? "1" : "0");
    } catch {
      /* private mode - session default stands */
    }
  }, [miniMapOn]);
  /** Session credential vault: tab memory + sessionStorage mirror, never in IDB/projects/exports. */
  const [vault, setVault] = useState<CredVault>(() => loadCredVault());
  useEffect(() => {
    try {
      if (Object.keys(vault).length === 0) sessionStorage.removeItem(CRED_VAULT_KEY);
      else sessionStorage.setItem(CRED_VAULT_KEY, JSON.stringify(vault));
    } catch {
      /* private mode etc - memory still holds the tab session */
    }
  }, [vault]);
  const [runEdgeId, setRunEdgeId] = useState<string | null>(null);
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("sf-present", present);
    return () => {
      document.body.classList.remove("sf-present");
    };
  }, [present]);
  const [inventoryOpen, setInventoryOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inventorySearch, setInventorySearch] = useState("");
  const [showList, setShowList] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [importIssues, setImportIssues] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Autosave: debounced IDB write on every change + flush on tab hide/close,
  // so refresh never loses canvas work. Explicit Save stays for certainty +
  // project-list refresh. Guards: never before the initial load completes.
  const readyRef = useRef(false);
  const projectRef = useRef<SystemProject | null>(null);
  projectRef.current = project;

  // Initial load: most recent project, else a fresh one (unsaved until Save).
  useEffect(() => {
    void (async () => {
      const list = await listSystemProjects();
      setProjectList(list);
      if (list.length > 0) {
        const loaded = await loadSystemProject(list[0].id);
        if (loaded) {
          const { project: valid, issues } = validateProject(loaded);
          if (valid) {
            setProject(valid);
            return;
          }
          void issues;
        }
      }
      setProject(newProject());
    })();
    readyRef.current = true;
  }, []);

  // Debounced autosave: every mutation persists ~800ms later. Guards keep the
  // initial load from ever being overwritten by a blank state.
  useEffect(() => {
    if (!readyRef.current || !project) return;
    const t = window.setTimeout(() => {
      const p = projectRef.current;
      if (!p) return;
      void (async () => {
        try {
          await saveSystemProject(p);
          setSaveState((s) => (s === "dirty" ? "saved" : s));
          setProjectList(await listSystemProjects());
        } catch {
          setSaveState("error");
          setSaveError("Autosave failed - hit Save to retry (IndexedDB unavailable or quota exceeded).");
        }
      })();
    }, 800);
    return () => window.clearTimeout(t);
  }, [project]);

  // Flush on tab hide/close so the last strokes survive.
  useEffect(() => {
    const flush = () => {
      const p = projectRef.current;
      if (p && readyRef.current) void saveSystemProject(p).catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const pushHistory = useCallback((p: SystemProject | null) => {
    if (!p) return;
    setPast((prev) => [...prev.slice(-49), snapOf(p)]);
    setFuture([]);
  }, []);

  const mutate = useCallback((fn: (p: SystemProject) => SystemProject) => {    setProject((prev) => {
      if (!prev) return prev;
      pushHistory(prev);
      const next = fn({ ...prev, systems: [...prev.systems], connections: [...prev.connections] });
      return next;
    });
    setSaveState("dirty");
  }, [pushHistory]);

  const undo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0 || !project) return prevPast;
      setFuture((prevFuture) => [snapOf(project), ...prevFuture].slice(0, 50));
      const last = prevPast[prevPast.length - 1];
      setProject((prev) => (prev ? { ...prev, systems: last.systems, connections: last.connections } : prev));
      setSaveState("dirty");
      setSelNodeId(null);
      setSelEdgeId(null);
      return prevPast.slice(0, -1);
    });
  }, [project]);

  const redo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0 || !project) return prevFuture;
      setPast((prevPast) => [...prevPast.slice(-49), snapOf(project)]);
      const [next, ...rest] = prevFuture;
      setProject((prev) => (prev ? { ...prev, systems: next.systems, connections: next.connections } : prev));
      setSaveState("dirty");
      setSelNodeId(null);
      setSelEdgeId(null);
      return rest;
    });
  }, [project]);

  // Keyboard: delete selection, undo/redo, escape clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        setSelNodeId(null);
        setSelEdgeId(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && (selNodeId || selEdgeId)) {
        e.preventDefault();
        const nid = selNodeId;
        const eid = selEdgeId;
        mutate((p) => ({
          ...p,
          systems: nid ? p.systems.filter((s) => s.id !== nid) : p.systems,
          connections: eid
            ? p.connections.filter((c) => c.id !== eid)
            : p.connections.filter((c) => c.sourceId !== nid && c.targetId !== nid),
        }));
        setSelNodeId(null);
        setSelEdgeId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selNodeId, selEdgeId, mutate, undo, redo]);

  const addSystem = useCallback((t: SystemTemplate, at?: { x: number; y: number }) => {
    mutate((p) => {
      const n = p.systems.filter((s) => s.systemType === t.systemType).length + 1;
      const pos = at ?? { x: 120 + (p.systems.length % 5) * 60, y: 120 + (p.systems.length % 5) * 60 };
      return { ...p, systems: [...p.systems, newSystemFromTemplate(t, pos, n)] };
    });
  }, [mutate]);

  const connectSystems = useCallback((sourceId: string, targetId: string) => {
    if (!project || !project.systems.some((s) => s.id === sourceId) || !project.systems.some((s) => s.id === targetId)) return;
    const id = newId("conn");
    mutate((p) => ({
      ...p,
      connections: [...p.connections, { id, sourceId, targetId, label: "", status: "draft" as const }],
    }));
    // Reveal the new edge in the inspector immediately: label it, bind
    // operations, watch readiness flip. A drawn edge is topology - it never
    // creates interfaces; those are defined per system and bound explicitly.
    setSelEdgeId(id);
    setSelNodeId(null);
  }, [mutate, project]);

  const moveSystems = useCallback((moves: { id: string; x: number; y: number }[]) => {
    setProject((prev) => {
      if (!prev) return prev;
      const byId = new Map(moves.map((m) => [m.id, m]));
      let changed = false;
      const systems = prev.systems.map((s) => {
        const m = byId.get(s.id);
        if (!m) return s;
        if (s.position.x === m.x && s.position.y === m.y) return s;
        changed = true;
        return { ...s, position: { x: m.x, y: m.y } };
      });
      if (!changed) return prev;
      return { ...prev, systems };
    });
    setSaveState("dirty");
  }, []);

  const save = useCallback(async () => {
    if (!project) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      await saveSystemProject(project);
      setSaveState("saved");
      setProjectList(await listSystemProjects());
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    }
  }, [project]);

  const loadDemo = useCallback(() => {
    if (project && (project.systems.length > 0 || saveState === "dirty")) {
      if (!window.confirm("Replace the current canvas with the demo architecture? Unsaved work will be lost.")) return;
    }
    const demo = buildDemoProject();
    setProject(demo);
    setPast([]);
    setFuture([]);
    setSelNodeId(null);
    setSelEdgeId(null);
    setSaveState("dirty");
  }, [project, saveState]);

  const loadGroqSample = useCallback(() => {
    if (project && (project.systems.length > 0 || saveState === "dirty")) {
      if (!window.confirm("Replace the current canvas with the GROQ chat sample? Unsaved work will be lost.")) return;
    }
    setProject(buildGroqSampleProject());
    setPast([]);
    setFuture([]);
    setSelNodeId(null);
    setSelEdgeId(null);
    setSaveState("dirty");
  }, [project, saveState]);

  const newCanvas = useCallback(() => {
    if (project && (project.systems.length > 0 || saveState === "dirty")) {
      if (!window.confirm("Start a blank canvas? Unsaved work will be lost.")) return;
    }
    setProject(newProject());
    setPast([]);
    setFuture([]);
    setSelNodeId(null);
    setSelEdgeId(null);
    setSaveState("dirty");
  }, [project, saveState]);

  const openProject = useCallback(async (id: string) => {
    const loaded = await loadSystemProject(id);
    if (!loaded) return;
    const { project: valid } = validateProject(loaded);
    if (!valid) return;
    setProject(valid);
    setPast([]);
    setFuture([]);
    setSelNodeId(null);
    setSelEdgeId(null);
    setSaveState("saved");
  }, []);

  const removeProject = useCallback(async (id: string) => {
    const target = projectList.find((p) => p.id === id);
    if (!window.confirm(`Delete project "${target?.name ?? id}"? This cannot be undone.`)) return;
    await deleteSystemProject(id);
    const list = await listSystemProjects();
    setProjectList(list);
    if (project?.id === id) {
      setProject(list.length > 0 ? (await loadSystemProject(list[0].id)) ?? newProject() : newProject());
      setPast([]);
      setFuture([]);
      setSaveState("saved");
    }
  }, [projectList, project]);

  const doExport = useCallback(() => {
    if (!project) return;
    const blob = new Blob([JSON.stringify(exportProject(project), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = projectFileName(project.name);
    a.click();
    URL.revokeObjectURL(url);
  }, [project]);

  const doImportFile = useCallback(async (file: File) => {
    setImportIssues(null);
    try {
      const raw = JSON.parse(await file.text());
      const { project: valid, issues } = importProject(raw);
      if (!valid) {
        setImportIssues(issues.map((i) => `${i.path}: ${i.message}`));
        return;
      }
      // Fresh id on import: never clobber an existing saved project.
      const named = { ...valid, id: newId("proj"), name: `${valid.name} (imported)` };
      setProject(named);
      setPast([]);
      setFuture([]);
      setSelNodeId(null);
      setSelEdgeId(null);
      setSaveState("dirty");
    } catch {
      setImportIssues(["$: File is not valid JSON."]);
    }
  }, []);

  const filteredTemplates = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return SYSTEM_TEMPLATES;
    return SYSTEM_TEMPLATES.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [inventorySearch]);

  const selNode = project?.systems.find((s) => s.id === selNodeId) ?? null;
  const selEdge = project?.connections.find((c) => c.id === selEdgeId) ?? null;
  const edgeName = (id: string) => project?.systems.find((s) => s.id === id)?.name ?? id;
  const testOp = testOpId ? project?.operations.find((o) => o.id === testOpId) ?? null : null;
  const testIface = testOp ? project?.interfaces.find((i) => i.id === testOp.interfaceId) ?? null : null;
  const testSystem = testIface ? project?.systems.find((s) => s.id === testIface.systemId) ?? null : null;
  const runEdge = runEdgeId ? project?.connections.find((c) => c.id === runEdgeId) ?? null : null;
  const openTodoCount = project?.todos.filter((t) => t.status !== "done").length ?? 0;

  const patchProjectTodo = useCallback((id: string, patch: Partial<CanvasTodo>) => {
    mutate((p) => ({
      ...p,
      todos: p.todos.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
    }));
  }, [mutate]);

  const addProjectTodo = useCallback((): string => {
    const id = newId("todo");
    const now = Date.now();
    mutate((p) => ({
      ...p,
      todos: [{ id, title: "", status: "open" as const, createdAt: now, updatedAt: now }, ...p.todos],
    }));
    return id;
  }, [mutate]);

  if (!project) {
    return (
      <div className="arch-card px-6 py-12 text-center text-sm text-ivory-600">
        Loading System Design workspace…
      </div>
    );
  }

  return (
    <div className={present ? "" : "space-y-3"}>
      {present && (
        <button
          type="button"
          onClick={() => setPresent(false)}
          aria-label="Exit full-screen presentation"
          title="Exit full screen"
          className="fixed bottom-5 right-5 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-ivory-950 text-ivory-100 shadow-xl hover:bg-bronze-600 transition-colors cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
          </svg>
        </button>
      )}
      {/* Project bar */}
      {!present && (
      <>
      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={project.id}
            onChange={(e) => void openProject(e.target.value)}
            aria-label="Open project"
            title="Open a saved project"
            className="max-w-[220px] cursor-pointer truncate rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 text-xs font-semibold text-ivory-950"
          >
            {projectList.every((p) => p.id !== project.id) && (
              <option value={project.id}>{project.name} (unsaved)</option>
            )}
            {projectList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span
            title={saveState === "saved" ? "All changes saved" : saveState === "dirty" ? "Unsaved changes" : saveState === "saving" ? "Saving…" : "Save failed"}
            aria-label={saveState === "saved" ? "Saved" : "Unsaved changes"}
            className={`h-2 w-2 rounded-full ${saveState === "saved" ? "bg-green-600" : saveState === "error" ? "bg-red-600" : saveState === "saving" ? "bg-amber-500 animate-pulse" : "bg-amber-500"}`}
          />
          <Button size="sm" onClick={() => void save()} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="secondary" onClick={newCanvas} title="Start a blank canvas">
            New
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setTplOpen(true)} title="Browse starter canvases - demo architecture and runnable samples">
            Templates
          </Button>
          <Button size="sm" variant="secondary" onClick={doExport} title="Download the project as portable JSON (no secrets exist in this slice)">
            Export
          </Button>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} title="Import a project file - validated before anything changes">
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Import project file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void doImportFile(f);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void removeProject(project.id)}
            title="Delete this saved project"
          >
            Delete
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCredOpen(true)}
            title="Session credentials ($env.NAME) - one-time setup, kept for this tab only"
          >
            <span className="inline-flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              Credentials
              {Object.keys(vault).length > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-bronze-500 px-1 text-[9px] font-bold text-white">
                  {Object.keys(vault).length}
                </span>
              )}
            </span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setNotesOpen(true)}
            title="Project design notes and TODOs (markdown, autosaved with the project)"
          >
            <span className="inline-flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
                <path d="m13.5 6.5 3 3" />
              </svg>
              Notes
              {openTodoCount > 0 ? (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {openTodoCount}
                </span>
              ) : project.notes.trim() ? (
                <span className="h-2 w-2 rounded-full bg-bronze-500" aria-hidden="true" />
              ) : null}
            </span>
          </Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)">
            Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={redo}
            disabled={future.length === 0}
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowList((v) => !v)}
            aria-pressed={showList}
            title="Toggle an accessible list view of systems and connections"
          >
            {showList ? "Canvas" : "List"}
          </Button>
        </div>
        {saveState === "error" && saveError && (
          <p className="mt-1.5 text-xs text-red-700" role="alert">{saveError}</p>
        )}
        {importIssues && (
          <div className="mt-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-2" role="alert">
            <p className="text-xs font-semibold text-red-700">Import blocked - nothing changed:</p>
            <ul className="mt-1 space-y-0.5">
              {importIssues.map((m) => (
                <li key={m} className="font-mono text-[11px] text-red-700">{m}</li>
              ))}
            </ul>
            <button type="button" onClick={() => setImportIssues(null)} className="mt-1 text-[11px] text-ivory-600 underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Secondary navigation */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="System Design sections">
        <span role="tab" aria-selected className="rounded-lg border border-ivory-950 bg-ivory-950 px-3 py-1.5 text-[12px] font-semibold text-ivory-100">
          Canvas
        </span>
        {PLANNED_TABS.map((t) => (
          <span
            key={t.id}
            role="tab"
            aria-selected={false}
            aria-disabled
            title={t.why}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-medium text-ivory-400 cursor-not-allowed"
          >
            {t.label}
          </span>
        ))}
      </div>
      </>
      )}

      {/* Workbench */}
      <div className="flex gap-3" style={present ? { height: "calc(100vh - 12px)" } : { height: "calc(100vh - 240px)", minHeight: 480 }}>
        {inventoryOpen ? (
          <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]" aria-label="Systems inventory">
            <div className="flex items-center gap-2 border-b border-[var(--color-line-soft)] px-3.5 py-2">
              <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-ivory-950">Systems Inventory</h2>
              <button
                type="button"
                onClick={() => setInventoryOpen(false)}
                aria-label="Collapse inventory"
                title="Collapse inventory"
                className="shrink-0 rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="m14 6-6 6 6 6" />
                </svg>
              </button>
            </div>
            <div className="border-b border-[var(--color-line-soft)] px-3.5 py-2">
              <Input
                placeholder="Search systems…"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                aria-label="Search systems inventory"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
              {filteredTemplates.length === 0 && (
                <p className="px-1 py-3 text-xs text-ivory-600">No systems match.</p>
              )}
              <ul className="space-y-1.5">
                {filteredTemplates.map((t) => (
                  <li
                    key={t.systemType}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/sd-system", t.systemType);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="flex cursor-grab items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)] p-2.5 hover:border-bronze-500 transition-colors active:cursor-grabbing"
                    title="Drag onto the canvas, or use Add"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bronze-100 text-bronze-700">
                      <SystemGlyph iconKey={t.iconKey} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-ivory-950">{t.name}</span>
                      <span className="block truncate text-[10px] text-ivory-600">{t.description}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => addSystem(t)}
                      aria-label={`Add ${t.name} to canvas`}
                      title={`Add ${t.name} to canvas`}
                      className="shrink-0 rounded-lg bg-ivory-950 px-2 py-1 text-[11px] font-semibold text-ivory-100 hover:bg-bronze-600 transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        ) : (
          <div className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] py-3">
            <button
              type="button"
              onClick={() => setInventoryOpen(true)}
              aria-label="Expand inventory"
              title="Expand inventory"
              className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="m10 6 6 6-6 6" />
              </svg>
            </button>
            <span className="text-[10px] font-bold text-ivory-500" style={{ writingMode: "vertical-rl" }}>
              Inventory
            </span>
          </div>
        )}

        <div className="min-w-0 min-h-0 flex-1">
          <ReactFlowProvider>
            {showList ? (
              <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ivory-700">
                    Systems ({project.systems.length})
                  </h3>
                  {project.systems.length === 0 ? (
                    <p className="mt-2 text-xs text-ivory-600">No systems yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {project.systems.map((s) => (
                        <li key={s.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-2.5 py-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ivory-950">
                            {s.name} <span className="font-mono font-normal text-ivory-500">· {s.systemType}</span>
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => { setSelNodeId(s.id); setSelEdgeId(null); }}>
                            Select
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ivory-700">
                    Connections ({project.connections.length})
                  </h3>
                  {project.connections.length === 0 ? (
                    <p className="mt-2 text-xs text-ivory-600">No connections yet - drag between nodes on the canvas.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {project.connections.map((c) => (
                        <li key={c.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-2.5 py-1.5">
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ivory-800">
                            {edgeName(c.sourceId)} → {edgeName(c.targetId)}
                            {c.label ? <span className="text-ivory-600"> · {c.label}</span> : null}
                          </span>
                          <Badge variant={connectionReadiness(c, project) === "ready" ? "success" : connectionReadiness(c, project) === "partial" ? "warning" : "default"}>
                            {connectionReadiness(c, project)}
                          </Badge>
                          <Button size="sm" variant="ghost" onClick={() => { setSelEdgeId(c.id); setSelNodeId(null); }}>
                            Select
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <DesignerCanvas
                project={project}
                onMoveSystems={moveSystems}
                onDragStartNode={() => pushHistory(project)}
                onConnectSystems={connectSystems}
                onSelect={(n, e) => {
                  // Compare-before-set: React Flow echoes prop-applied
                  // selection back through onSelectionChange - committing
                  // identical values would ping-pong into an update loop.
                  setSelNodeId((prev) => (prev === n ? prev : n));
                  setSelEdgeId((prev) => (prev === e ? prev : e));
                }}
                selNodeId={selNodeId}
                selEdgeId={selEdgeId}
                onDropTemplate={(t, at) => addSystem(t, at)}
                emptyAction={() => setTplOpen(true)}
                present={present}
                onTogglePresent={() => setPresent((v) => !v)}
                runVis={runVis}
                miniMapOn={miniMapOn}
                onToggleMiniMap={() => setMiniMapOn((v) => !v)}
              />
            )}
          </ReactFlowProvider>
          </div>

        {inspectorOpen ? (
        <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]" aria-label="Inspector">
          <div className="flex items-center gap-2 border-b border-[var(--color-line-soft)] px-3.5 py-2">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-bold text-ivory-950">Inspector</h2>
              <p className="truncate font-mono text-[10px] text-ivory-600">
                {selNode ? selNode.name : selEdge ? `edge · ${selEdge.id.slice(-6)}` : `${project.systems.length} systems · ${project.connections.length} links`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              aria-label="Collapse inspector"
              title="Collapse inspector - canvas goes full width"
              className="shrink-0 rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="m10 6 6 6-6 6" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
            {selNode ? (
              <NodeInspector
                node={selNode}
                project={project}                onPatch={(patch) => mutate((p) => ({
                  ...p,
                  systems: p.systems.map((s) => (s.id === selNode.id ? { ...s, ...patch } : s)),
                }))}
                onMutateProject={(fn) => mutate(fn)}
                onTestOperation={(opId) => setTestOpId(opId)}
                onConnectTo={(targetId) => connectSystems(selNode.id, targetId)}
                onDuplicate={() => {
                  mutate((p) => ({
                    ...p,
                    systems: [
                      ...p.systems,
                      { ...selNode, id: newId("sys"), name: `${selNode.name} copy`, position: { x: selNode.position.x + 120, y: selNode.position.y + 80 } },
                    ],
                  }));
                }}
                onDelete={() => {
                  mutate((p) => ({
                    ...p,
                    systems: p.systems.filter((s) => s.id !== selNode.id),
                    connections: p.connections.filter((c) => c.sourceId !== selNode.id && c.targetId !== selNode.id),
                  }));
                  setSelNodeId(null);
                }}
                onSelectEdge={(edgeId) => {
                  setSelNodeId((prev) => (prev === null ? prev : null));
                  setSelEdgeId((prev) => (prev === edgeId ? prev : edgeId));
                }}
              />
            ) : selEdge ? (
              <EdgeInspector
                edge={selEdge}
                project={project}
                sourceName={edgeName(selEdge.sourceId)}
                targetName={edgeName(selEdge.targetId)}
              onPatch={(patch) => mutate((p) => ({
                ...p,
                connections: p.connections.map((c) => (c.id === selEdge.id ? { ...c, ...patch } : c)),
              }))}
              onRun={() => setRunEdgeId(selEdge.id)}
              onRunChain={() => {
                setRunChainEdgeId(selEdge.id);
                setRunVis({});
              }}
              runReady={connectionReadiness(selEdge, project) === "ready"}
              onDelete={() => {
                mutate((p) => ({ ...p, connections: p.connections.filter((c) => c.id !== selEdge.id) }));
                setSelEdgeId(null);
              }}
            />
            ) : (
              <div>
                <p className="text-xs leading-relaxed text-ivory-700">
                  Select a system or connection to edit it. Links turn green once both ends bind
                  operations - then they run end-to-end or as full chains.
                </p>
                <div className="mt-3 rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-canvas)] p-2.5 font-mono text-[11px] text-ivory-700">
                  {project.systems.length} systems · {project.connections.length} connections ·{" "}
                  {project.connections.filter((c) => c.label.trim()).length} labeled ·{" "}
                  {project.connections.filter((c) => connectionReadiness(c, project) === "ready").length} ready
                </div>
                {project.connections.length > 0 && (
                  <div className="mt-2.5">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
                      Links - click to inspect and run
                    </p>
                    <ul className="space-y-1">
                      {project.connections.map((c) => {
                        const ready = connectionReadiness(c, project) === "ready";
                        const sName = project.systems.find((s) => s.id === c.sourceId)?.name ?? "?";
                        const tName = project.systems.find((s) => s.id === c.targetId)?.name ?? "?";
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => {
                                // Same guard as canvas selection: identical
                                // commits ping-pong with React Flow's echo.
                                setSelNodeId((prev) => (prev === null ? prev : null));
                                setSelEdgeId((prev) => (prev === c.id ? prev : c.id));
                              }}
                              title={ready ? "Inspect and run this link" : "Inspect - bind both ends to run"}
                              className="flex w-full items-center gap-1.5 rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-2 py-1.5 text-left hover:border-bronze-500 transition-colors cursor-pointer"
                            >
                              <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? "bg-[#32815B]" : "bg-amber-500"}`}
                              />
                              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ivory-950">
                                {c.label || "Unlabeled link"}
                                <span className="font-mono font-normal text-ivory-500"> · {sName} → {tName}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <div className="mt-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
                      Environment
                    </p>
                    <button
                      type="button"
                      onClick={() => mutate((p) => {
                        const env = { id: newId("env"), name: `Env ${p.environments.length + 1}`, baseUrl: "" };
                        return { ...p, environments: [...p.environments, env], activeEnvironmentId: p.activeEnvironmentId ?? env.id };
                      })}
                      className="text-[11px] font-semibold text-bronze-600 hover:text-bronze-700 cursor-pointer"
                    >
                      + Environment
                    </button>
                  </div>
                  {project.environments.length === 0 ? (
                    <p className="text-[11px] text-ivory-500">No environments - runs target named environments in Phase 3.</p>
                  ) : (
                    <div className="space-y-1.5">
                      <select
                        value={project.activeEnvironmentId ?? ""}
                        onChange={(e) => mutate((p) => ({ ...p, activeEnvironmentId: e.target.value || null }))}
                        aria-label="Active environment"
                        title="Active environment - test runs target this in Phase 3"
                        className="w-full cursor-pointer rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 text-xs font-semibold text-ivory-950"
                      >
                        <option value="">No active environment</option>
                        {project.environments.map((e) => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                      {project.environments.map((e) => (
                        <div key={e.id} className="flex items-center gap-1">
                          <input
                            value={e.name}
                            onChange={(ev) => mutate((p) => ({
                              ...p,
                              environments: p.environments.map((x) => (x.id === e.id ? { ...x, name: ev.target.value } : x)),
                            }))}
                            spellCheck={false}
                            aria-label="Environment name"
                            className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1 text-[11px] font-semibold text-ivory-950 focus:border-bronze-500 focus:outline-none"
                          />
                          <input
                            value={e.baseUrl}
                            onChange={(ev) => mutate((p) => ({
                              ...p,
                              environments: p.environments.map((x) => (x.id === e.id ? { ...x, baseUrl: ev.target.value } : x)),
                            }))}
                            placeholder="https://…"
                            spellCheck={false}
                            aria-label="Environment base URL"
                            className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1 font-mono text-[10px] text-ivory-800 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => mutate((p) => ({
                              ...p,
                              environments: p.environments.filter((x) => x.id !== e.id),
                              activeEnvironmentId: p.activeEnvironmentId === e.id ? null : p.activeEnvironmentId,
                            }))}
                            aria-label={`Delete environment ${e.name}`}
                            title="Delete environment"
                            className="rounded p-1 text-ivory-400 hover:text-red-700 hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                              <path d="M6 6l12 12M18 6 6 18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <p className="text-[10px] text-ivory-500">Base URLs only - secrets are referenced at runtime, never stored (Phase 3).</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
        ) : (
          <div className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] py-3">
            <button
              type="button"
              onClick={() => setInspectorOpen(true)}
              aria-label="Expand inspector"
              title="Expand inspector"
              className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="m14 6-6 6 6 6" />
              </svg>
            </button>
            <span className="text-[10px] font-bold text-ivory-500" style={{ writingMode: "vertical-rl" }}>
              Inspector
            </span>
          </div>
        )}
      </div>

      {testOp && testIface && testSystem && project && (
        <TestRunner
          operation={testOp}
          iface={testIface}
          system={testSystem}
          environments={project.environments}
          activeEnvironmentId={project.activeEnvironmentId}
          vault={vault}
          onClose={() => setTestOpId(null)}
        />
      )}

      {runEdge && project && (
        <RunEdgeDialog
          edge={runEdge}
          project={project}
          environments={project.environments}
          activeEnvironmentId={project.activeEnvironmentId}
          vault={vault}
          onClose={() => setRunEdgeId(null)}
          onSaveSample={(opId, body) => mutate((p) => ({
            ...p,
            operations: p.operations.map((o) => (o.id === opId ? { ...o, sampleBody: body } : o)),
          }))}
        />
      )}

      {runChainEdgeId && project && (
        <ChainRunDialog
          startEdgeId={runChainEdgeId}
          project={project}
          environments={project.environments}
          activeEnvironmentId={project.activeEnvironmentId}
          vault={vault}
          onClose={() => {
            setRunChainEdgeId(null);
            setRunVis({});
          }}
          onVisUpdate={(edgeId, status) => {
            if (status === null) {
              setRunVis((prev) => {
                const next = { ...prev };
                delete next[edgeId];
                return next;
              });
              return;
            }
            setRunVis((prev) => ({ ...prev, [edgeId]: status }));
          }}
        />
      )}

      {project && (
        <TemplatesModal
          open={tplOpen}
          onClose={() => setTplOpen(false)}
          onLoadDemo={loadDemo}
          onLoadGroq={loadGroqSample}
        />
      )}

      {project && (
        <CredentialsModal
          open={credOpen}
          onClose={() => setCredOpen(false)}
          vault={vault}
          onSet={(name, value) => setVault((v) => ({ ...v, [name]: value }))}
          onRemove={(name) =>
            setVault((v) => {
              const next = { ...v };
              delete next[name];
              return next;
            })
          }
          onClear={() => setVault({})}
        />
      )}

      {project && (
        <ProjectNotesModal
          open={notesOpen}
          onClose={() => setNotesOpen(false)}
          projectName={project.name}
          notes={project.notes}
          todos={project.todos}
          onNotes={(text) => mutate((p) => ({ ...p, notes: text }))}
          onAddTodo={addProjectTodo}
          onPatchTodo={patchProjectTodo}
          onDeleteTodo={(id) => mutate((p) => ({ ...p, todos: p.todos.filter((t) => t.id !== id) }))}
        />
      )}
    </div>
  );
}

function NodeInspector({
  node,
  project,
  onPatch,
  onMutateProject,
  onTestOperation,
  onConnectTo,
  onDuplicate,
  onDelete,
  onSelectEdge,
}: {
  node: SystemNode;
  project: SystemProject;
  onPatch: (patch: Partial<SystemNode>) => void;
  onMutateProject: (fn: (p: SystemProject) => SystemProject) => void;
  onTestOperation: (opId: string) => void;
  onConnectTo: (targetId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSelectEdge: (edgeId: string) => void;
}) {
  const groups = operationsForSystem(project, node.id);
  const opCount = groups.reduce((n, g) => n + g.ops.length, 0);
  const [connectTarget, setConnectTarget] = useState<string>("");
  const connectables = project.systems.filter((s) => s.id !== node.id);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-canvas)] p-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bronze-100 text-bronze-700">
          <SystemGlyph iconKey={node.iconKey} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-ivory-950">{node.name}</p>
          <p className="font-mono text-[10px] text-ivory-500">{node.id}</p>
        </div>
      </div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
        Name
        <input
          value={node.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          spellCheck={false}
          className="mt-0.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 text-xs font-medium normal-case tracking-normal text-ivory-950 focus:border-bronze-500 focus:outline-none"
        />
      </label>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
        Type
        <select
          value={node.systemType}
          onChange={(e) => {
            const t = SYSTEM_TEMPLATES.find((x) => x.systemType === e.target.value);
            onPatch({ systemType: e.target.value as SystemNode["systemType"], iconKey: t?.iconKey ?? "plus" });
          }}
          className="mt-0.5 w-full cursor-pointer rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 text-xs font-medium normal-case tracking-normal text-ivory-950"
        >
          {SYSTEM_TEMPLATES.map((t) => (
            <option key={t.systemType} value={t.systemType}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
        Description
        <textarea
          value={node.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          rows={3}
          spellCheck={false}
          className="mt-0.5 w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-2 text-xs leading-relaxed text-ivory-950 focus:border-bronze-500 focus:outline-none"
        />
      </label>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
        Base URL
        <input
          value={node.baseUrl ?? ""}
          onChange={(e) => onPatch({ baseUrl: e.target.value })}
          placeholder="https://… (falls back to environment)"
          spellCheck={false}
          aria-label="System base URL"
          className="mt-0.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 font-mono text-[11px] normal-case tracking-normal text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
        />
      </label>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" onClick={onDuplicate} className="flex-1">
          Duplicate
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="flex-1">
          Delete
        </Button>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ivory-600" title="Or drag from the bronze dot on the node's right edge to another node">
          Connect to…
        </p>
        {connectables.length === 0 ? (
          <p className="text-[11px] text-ivory-500">Add another system first.</p>
        ) : (
          <div className="flex gap-1.5">
            <select
              value={connectTarget}
              onChange={(e) => setConnectTarget(e.target.value)}
              aria-label="Target system to connect"
              className="min-w-0 flex-1 cursor-pointer rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 text-xs font-medium text-ivory-950"
            >
              <option value="">Pick a system…</option>
              {connectables.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!connectTarget}
              onClick={() => {
                if (connectTarget) {
                  onConnectTo(connectTarget);
                  setConnectTarget("");
                }
              }}
            >
              Link
            </Button>
          </div>
        )}
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
            Interfaces · {groups.length} · {opCount} ops
          </p>
          <button
            type="button"
            onClick={() => onMutateProject((p) => ({
              ...p,
              interfaces: [...p.interfaces, {
                id: newId("iface"), systemId: node.id, name: "REST API",
                protocol: "REST" as const, basePath: "",
              }],
            }))}
            className="text-[11px] font-semibold text-bronze-600 hover:text-bronze-700 cursor-pointer"
          >
            + Interface
          </button>
        </div>
        {groups.length === 0 && (
          <p className="text-[11px] text-ivory-500">No interfaces yet - add one to expose operations for edge binding.</p>
        )}
        <div className="space-y-2">
          {groups.map(({ iface, ops }) => (
            <div key={iface.id} className="rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-canvas)] p-2">
              <div className="flex items-center gap-1.5">
                <input
                  value={iface.name}
                  onChange={(e) => onMutateProject((p) => ({
                    ...p,
                    interfaces: p.interfaces.map((f) => (f.id === iface.id ? { ...f, name: e.target.value } : f)),
                  }))}
                  spellCheck={false}
                  aria-label="Interface name"
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs font-bold text-ivory-950 hover:border-[var(--color-line)] focus:border-bronze-500 focus:outline-none"
                />
                <select
                  value={iface.protocol}
                  onChange={(e) => onMutateProject((p) => ({
                    ...p,
                    interfaces: p.interfaces.map((f) => (f.id === iface.id ? { ...f, protocol: e.target.value as SystemInterface["protocol"] } : f)),
                  }))}
                  aria-label="Interface protocol"
                  className="cursor-pointer rounded-md border border-[var(--color-line)] bg-white px-1 py-1 font-mono text-[10px] text-ivory-800"
                >
                  {(["REST", "GraphQL", "SOAP", "Events", "Other"] as const).map((pr) => (
                    <option key={pr} value={pr}>{pr}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onMutateProject((p) => ({
                    ...p,
                    interfaces: p.interfaces.filter((f) => f.id !== iface.id),
                    operations: p.operations.filter((o) => o.interfaceId !== iface.id),
                  }))}
                  aria-label={`Delete interface ${iface.name}`}
                  title="Delete interface and its operations (edge bindings to them read as unbound)"
                  className="rounded p-1 text-ivory-400 hover:text-red-700 hover:bg-red-500/10 transition-colors cursor-pointer"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13h10l1-13" />
                  </svg>
                </button>
              </div>
              <input
                value={iface.basePath}
                onChange={(e) => onMutateProject((p) => ({
                  ...p,
                  interfaces: p.interfaces.map((f) => (f.id === iface.id ? { ...f, basePath: e.target.value } : f)),
                }))}
                placeholder="Base path, e.g. /services/data/v66.0"
                spellCheck={false}
                aria-label="Interface base path"
                className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 font-mono text-[10px] text-ivory-800 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
              />
              <ul className="mt-1.5 space-y-1">
                {ops.map((op) => (
                  <li key={op.id} className="rounded-md border border-transparent">
                    <div className="flex items-center gap-1">
                    <select
                      value={op.method}
                      onChange={(e) => onMutateProject((p) => ({
                        ...p,
                        operations: p.operations.map((o) => (o.id === op.id ? { ...o, method: e.target.value as OperationMethod } : o)),
                      }))}
                      aria-label={`Method for ${op.name}`}
                      className="cursor-pointer rounded-md border border-[var(--color-line)] bg-white px-1 py-1 font-mono text-[10px] font-bold text-ivory-800"
                    >
                      {(["GET", "POST", "PUT", "PATCH", "DELETE", "EVENT", "QUERY"] as const).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <input
                      value={op.name}
                      onChange={(e) => onMutateProject((p) => ({
                        ...p,
                        operations: p.operations.map((o) => (o.id === op.id ? { ...o, name: e.target.value } : o)),
                      }))}
                      spellCheck={false}
                      aria-label="Operation name"
                      placeholder="Operation name"
                      className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 text-[11px] font-semibold text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
                    />
                    <input
                      value={op.path}
                      onChange={(e) => onMutateProject((p) => ({
                        ...p,
                        operations: p.operations.map((o) => (o.id === op.id ? { ...o, path: e.target.value } : o)),
                      }))}
                      spellCheck={false}
                      aria-label="Operation path"
                      placeholder="/path"
                      className="w-24 rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 font-mono text-[10px] text-ivory-800 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onMutateProject((p) => ({
                        ...p,
                        operations: p.operations.filter((o) => o.id !== op.id),
                      }))}
                      aria-label={`Delete operation ${op.name}`}
                      title="Delete operation (edge bindings to it read as unbound)"
                      className="rounded p-1 text-ivory-400 hover:text-red-700 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => onTestOperation(op.id)}
                      aria-label={`Test operation ${op.name}`}
                      title="Run this operation in Test mode (preflight + redacted history)"
                      className="shrink-0 rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 font-mono text-[10px] font-bold text-bronze-700 hover:border-bronze-500 transition-colors cursor-pointer"
                    >
                      Test
                    </button>
                    </div>
                    <OperationHttpConfig
                      op={op}
                      nodeId={node.id}
                      project={project}
                      onMutateProject={onMutateProject}
                      onSelectEdge={onSelectEdge}
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onMutateProject((p) => ({
                  ...p,
                  operations: [...p.operations, {
                    id: newId("op"), interfaceId: iface.id, name: "New operation",
                    method: "GET" as const, path: "/", version: "v1",
                  }],
                }))}
                className="mt-1 text-[11px] font-semibold text-bronze-600 hover:text-bronze-700 cursor-pointer"
              >
                + Operation
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OperationHttpConfig({
  op,
  nodeId,
  project,
  onMutateProject,
  onSelectEdge,
}: {
  op: SystemOperation;
  nodeId: string;
  project: SystemProject;
  onMutateProject: (fn: (p: SystemProject) => SystemProject) => void;
  onSelectEdge: (edgeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const headerCount = (op.headers ?? []).length;
  const isEvent = op.method === "EVENT";
  const incoming = project.connections.find(
    (c) => c.targetId === nodeId && (c.targetOperationId === op.id || !c.targetOperationId)
  );

  const patchOp = (patch: Partial<SystemOperation>) =>
    onMutateProject((p) => ({
      ...p,
      operations: p.operations.map((o) => (o.id === op.id ? { ...o, ...patch } : o)),
    }));

  const setHeader = (i: number, patch: Partial<{ key: string; value: string }>) =>
    patchOp({ headers: (op.headers ?? []).map((h, j) => (j === i ? { ...h, ...patch } : h)) });

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={isEvent ? "Seed payload for chain runs starting here" : "Stored headers and sample body - sent by every runner"}
        className="flex items-center gap-1 text-[10px] font-bold text-bronze-700 hover:text-bronze-800 cursor-pointer"
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        {isEvent ? "Seed payload" : "Headers & body"}
        {headerCount > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-bronze-500 px-1 text-[9px] font-bold text-white">
            {headerCount}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-surface)] p-2">
          {!isEvent && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
                Headers - stored on the operation, sent by every runner
              </p>
              <div className="space-y-1">
                {(op.headers ?? []).map((h, i) => (
                  <div key={i}>
                    <div className="flex gap-1">
                    <input
                      value={h.key}
                      onChange={(e) => setHeader(i, { key: e.target.value })}
                      placeholder="Header"
                      spellCheck={false}
                      aria-label={`Stored header ${i + 1} name`}
                      className="w-28 rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 font-mono text-[10px] text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
                    />
                    <input
                      value={h.value}
                      onChange={(e) => setHeader(i, { value: e.target.value })}
                      placeholder="Value or $env.NAME"
                      spellCheck={false}
                      aria-label={`Stored header ${i + 1} value`}
                      className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 font-mono text-[10px] text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => patchOp({ headers: (op.headers ?? []).filter((_, j) => j !== i) })}
                      aria-label="Remove stored header"
                      className="rounded p-1 text-ivory-400 hover:text-red-700 transition-colors cursor-pointer"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                    </div>
                    {looksLikeSecret(h.value) && (
                      <p className="mt-0.5 rounded-md border border-red-300 bg-red-50 px-1.5 py-1 text-[10px] leading-snug text-red-700" role="alert">
                        Looks like a literal secret - it saves and exports with the project. Replace with{" "}
                        <span className="font-mono font-bold">$env.NAME</span> from Credentials and rotate this key.
                      </p>
                    )}
                    {["authorization", "cookie", "set-cookie", "proxy-authorization"].includes(h.key.trim().toLowerCase()) && (
                      <p className="mt-0.5 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1 text-[10px] leading-snug text-amber-800" role="alert">
                        Never forwarded - the execution backend drops auth headers from stored config. Auth travels
                        per run via the Bearer token field (+ vault).
                      </p>
                    )}
                  </div>
                ))}
                {(op.headers ?? []).length < 20 && (
                  <button
                    type="button"
                    onClick={() => patchOp({ headers: [...(op.headers ?? []), { key: "", value: "" }] })}
                    className="text-[11px] font-semibold text-bronze-600 hover:text-bronze-700 cursor-pointer"
                  >
                    + Header
                  </button>
                )}
              </div>
              <p className="mt-1 text-[10px] text-ivory-500">
                $env.NAME resolves at send time. Auth/cookie headers are never forwarded - use the run token
                field. Values export with the project - never paste secrets, use the vault.
              </p>
            </div>
          )}
          {op.method !== "GET" && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
                {isEvent ? "Seed payload - prefills chain runs starting here" : "Sample body - prefills test and edge runs"}
              </p>
              <textarea
                value={op.sampleBody ?? ""}
                onChange={(e) => patchOp({ sampleBody: e.target.value })}
                spellCheck={false}
                rows={3}
                aria-label={isEvent ? "Seed payload" : "Sample body"}
                placeholder={isEvent ? '{ "prompt": "Ask anything…" }' : '{ "key": "value" }'}
                className="w-full resize-y rounded-md border border-[var(--color-line)] bg-white p-1.5 font-mono text-[10px] leading-relaxed text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
              />
            </div>
          )}
          {!isEvent && (
            <div className="rounded-md bg-[var(--color-canvas)] px-2 py-1.5">
              {incoming ? (
                <button
                  type="button"
                  onClick={() => onSelectEdge(incoming.id)}
                  title="Open the link that feeds this operation - its mapping builds this step's body from previous outputs"
                  className="text-left text-[11px] font-semibold text-bronze-700 hover:text-bronze-800 cursor-pointer"
                >
                  Body from previous step → edit incoming mapping
                  <span className="block font-mono font-normal text-ivory-500">
                    {incoming.label || "unlabeled link"} · {incoming.mapping ? incoming.mapping.mode : "no mapping yet (passthrough)"}
                  </span>
                </button>
              ) : (
                <p className="text-[10px] text-ivory-500">
                  No incoming link feeds this operation yet - link another system to it and the edge mapping will
                  build this step&apos;s body from previous outputs ({"{{response}}, {{seed}}, {{steps.*}}"}).
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VariableChips({
  project,
  edge,
  onInsert,
}: {
  project: SystemProject;
  edge: SystemConnection;
  onInsert: (ref: string) => void;
}) {
  const upstream = useMemo(() => {
    const names: { id: string; name: string }[] = [];
    const seen = new Set<string>([edge.targetId]);
    const queue = [edge.sourceId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const sys = project.systems.find((s) => s.id === cur);
      if (sys) names.push({ id: sys.id, name: sys.name });
      for (const c of project.connections) {
        if (c.targetId === cur) queue.push(c.sourceId);
      }
    }
    return names;
  }, [project, edge]);

  const chip = (label: string, ref: string, title: string) => (
    <button
      key={ref}
      type="button"
      onClick={() => onInsert(ref)}
      title={`${title} - click to insert`}
      className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[10px] text-ivory-800 hover:border-bronze-500 hover:text-ivory-950 transition-colors cursor-pointer"
    >
      {label}
    </button>
  );

  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
        Variables available here - click to insert
      </p>
      <div className="flex flex-wrap gap-1">
        {chip("response", "{{response}}", "Previous hop output")}
        {chip("seed", "{{seed}}", "Flow seed payload")}
        {upstream.map((u) => chip(u.name, `{{steps.${u.id}}}`, `Output of the hop targeting ${u.name}`))}
        {chip("$env", "$env.", "Session credential prefix")}
      </div>
    </div>
  );
}

function EdgeInspector({
  edge,
  project,
  sourceName,
  targetName,
  onPatch,
  onDelete,
  onRun,
  onRunChain,
  runReady,
}: {
  edge: SystemConnection;
  project: SystemProject;
  sourceName: string;
  targetName: string;
  onPatch: (patch: Partial<SystemConnection>) => void;
  onDelete: () => void;
  onRun: () => void;
  onRunChain: () => void;
  runReady: boolean;
}) {
  const tplRef = useRef<HTMLTextAreaElement>(null);
  const readiness = connectionReadiness(edge, project);
  const sourceGroups = operationsForSystem(project, edge.sourceId);
  const targetGroups = operationsForSystem(project, edge.targetId);
  const opLabel = (ifaceName: string, opName: string, method: string) => `${method} ${opName} (${ifaceName})`;
  const bindSelect = (
    side: "source" | "target",
    value: string | undefined,
    groups: { iface: SystemInterface; ops: SystemOperation[] }[],
    ownerName: string
  ) => (
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
      {side === "source" ? `Source op · ${ownerName}` : `Target op · ${ownerName}`}
      <select
        value={value ?? ""}
        onChange={(e) => onPatch(side === "source"
          ? { sourceOperationId: e.target.value || undefined }
          : { targetOperationId: e.target.value || undefined })}
        className="mt-0.5 w-full cursor-pointer rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-1.5 py-1.5 text-xs font-medium normal-case tracking-normal text-ivory-950"
      >
        <option value="">Unbound</option>
        {groups.map((g) => (
          <optgroup key={g.iface.id} label={g.iface.name}>
            {g.ops.map((o) => (
              <option key={o.id} value={o.id}>{opLabel(g.iface.name, o.name, o.method)}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-canvas)] p-2.5 font-mono text-[11px] text-ivory-800">
        {sourceName} → {targetName}
      </div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
        Label
        <input
          value={edge.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="e.g. Lead created event"
          spellCheck={false}
          className="mt-0.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 text-xs font-medium normal-case tracking-normal text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
        />
      </label>
      <div className="flex items-center gap-1.5">
        <Badge variant={readiness === "ready" ? "success" : readiness === "partial" ? "warning" : "default"}>
          {readiness}
        </Badge>
        <p className="text-[11px] leading-relaxed text-ivory-600">
          {readiness === "ready"
            ? "Both ends bound - executable once a runner exists (Phase 3)."
            : readiness === "partial"
              ? "One end bound - bind the other to finish this edge."
              : "Not executable - bind operations to run this edge (Phase 2)."}
        </p>
      </div>
      {bindSelect("source", edge.sourceOperationId, sourceGroups, sourceName)}
      {bindSelect("target", edge.targetOperationId, targetGroups, targetName)}
      <details className="rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-canvas)]">
        <summary className="cursor-pointer px-2.5 py-2 text-[11px] font-semibold text-ivory-900 hover:text-ivory-950">
          Mapping {edge.mapping ? `· ${edge.mapping.mode}` : "· none (passthrough at run)"}
        </summary>
        <div className="space-y-1.5 border-t border-[var(--color-line-soft)] p-2.5">
          <div className="flex gap-1.5" role="radiogroup" aria-label="Mapping mode">
            {(["passthrough", "template"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={(edge.mapping?.mode ?? "passthrough") === m}
                onClick={() => onPatch({ mapping: { mode: m, template: edge.mapping?.template ?? '{\n  "data": {{response}}\n}' } })}
                className={`rounded-lg border px-2 py-1 text-[11px] font-semibold capitalize transition-colors cursor-pointer ${((edge.mapping?.mode ?? "passthrough") === m) ? "bg-ivory-950 text-ivory-100 border-ivory-950" : "bg-[var(--color-surface)] border-[var(--color-line)] text-ivory-600 hover:text-ivory-950"}`}
              >
                {m === "passthrough" ? "Pass-through" : "Template"}
              </button>
            ))}
          </div>
          {(edge.mapping?.mode ?? "passthrough") === "template" && (
            <>
              <VariableChips
                project={project}
                edge={edge}
                onInsert={(ref) => {
                  const ta = tplRef.current;
                  const cur = edge.mapping?.template ?? "";
                  if (!ta) {
                    onPatch({ mapping: { mode: "template", template: cur + ref } });
                    return;
                  }
                  const start = ta.selectionStart ?? cur.length;
                  const end = ta.selectionEnd ?? cur.length;
                  const next = cur.slice(0, start) + ref + cur.slice(end);
                  onPatch({ mapping: { mode: "template", template: next } });
                  const caret = start + ref.length;
                  window.setTimeout(() => {
                    tplRef.current?.focus();
                    tplRef.current?.setSelectionRange(caret, caret);
                  }, 0);
                }}
              />
              <textarea
                ref={tplRef}
                value={edge.mapping?.template ?? ""}
              onChange={(e) => onPatch({ mapping: { mode: "template", template: e.target.value } })}
              spellCheck={false}
              rows={4}
              aria-label="Mapping template"
              placeholder={'{\n  "x": {{field}}\n}'}
              className="w-full resize-y rounded-lg border border-[var(--color-line)] bg-white p-2 font-mono text-[11px] leading-relaxed text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
              />
            </>
          )}
          <p className="text-[10px] text-ivory-500">
            Stored on the edge - chains run unattended. {"{{response}}"} is the previous hop, {"{{seed}}"} the
            flow input, {"{{steps.<system>}}"} any earlier hop output.
          </p>
        </div>
      </details>
      <Button
        size="sm"
        onClick={onRun}
        disabled={!runReady}
        title={runReady ? "Run this edge end-to-end: source call → mapping → target call, with trace" : "Bind both ends first - only ready edges run"}
        className="w-full"
      >
        Run edge end-to-end
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={onRunChain}
        disabled={!runReady}
        title={runReady ? "Run the full downstream flow from this edge - every branch, with trace on canvas" : "Bind both ends first - chains start from ready edges"}
        className="w-full"
      >
        Run chain from here
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete} className="w-full">
        Delete connection
      </Button>
    </div>
  );
}
