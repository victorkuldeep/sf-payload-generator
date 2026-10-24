import type { Experience } from "@/lib/wireframe/model";
import type { MappingProject } from "@/lib/mapping/types";
import type { StudioProject } from "@/lib/studio/types";
import { STORES, withStore } from "@/lib/db";
import { listExperiences } from "@/lib/wireframe/store";
import { listStoredProfiles } from "@/lib/contracts/persistence";

/**
 * Composable inventory - one searchable index across every attachable
 * artifact an architect authored separately: wireframe screens, integration
 * mappings, contract profiles. References are by id, never copies; the
 * `usedIn` backlinks make consumption visible before detach/delete.
 */

export type ArtifactKind = "wireframe-screen" | "integration-mapping" | "contract-profile";

export interface ArtifactEntry {
  kind: ArtifactKind;
  /** Stable row key: kind + underlying ids. */
  key: string;
  label: string;
  detail: string;
  status?: string;
  /** Owning project for attached mappings; null = standalone library. */
  projectName?: string | null;
  /** True when the mapping carries a metadata snapshot. */
  hasSnapshot?: boolean;
  // Targets for attach actions.
  experienceId?: string;
  screenId?: string;
  mappingId?: string;
  profileId?: string;
  /** Workspace names consuming this artifact (backlinks). */
  usedIn: string[];
}

export interface ArtifactSources {
  wireframes: Experience[];
  /** Standalone library mappings (not under any project). */
  standaloneMappings: MappingProject[];
  /** Project roots with their attached child mappings. */
  projects: { root: StudioProject; children: MappingProject[] }[];
  contracts: { id: string; name: string; targetObjectApiName: string }[];
}

function studioNames(projects: { root: StudioProject }[], ids: Set<string>): string[] {
  return projects.filter((p) => ids.has(p.root.id)).map((p) => p.root.name);
}

/** Pure index builder - every backlink derived from stored references. */
export function buildArtifactIndex(sources: ArtifactSources): ArtifactEntry[] {
  const entries: ArtifactEntry[] = [];
  const childIds = new Set(sources.projects.flatMap((p) => p.root.mappingIds));

  for (const exp of sources.wireframes) {
    for (const s of exp.screens) {
      const users = new Set<string>();
      for (const p of sources.projects) {
        const screens = p.root.experience?.screens ?? [];
        if (screens.some((x) => x.wireframeRef?.experienceId === exp.id && x.wireframeRef?.screenId === s.id)) {
          users.add(p.root.id);
        }
      }
      const onScreen = exp.components.filter((c) => c.parentId === s.id).length;
      entries.push({
        kind: "wireframe-screen",
        key: `wire:${exp.id}:${s.id}`,
        label: `${exp.name} → ${s.name}`,
        detail: `${onScreen} components · ${exp.status}`,
        status: exp.status,
        experienceId: exp.id,
        screenId: s.id,
        usedIn: studioNames(sources.projects, users),
      });
    }
  }

  const pushMapping = (m: MappingProject, projectName: string | null) => {
    const users = new Set<string>();
    for (const p of sources.projects) {
      if (p.root.mappingIds.includes(m.id)) users.add(p.root.id);
      const screens = p.root.experience?.screens ?? [];
      if (screens.some((x) => x.payloadMappingId === m.id)) users.add(p.root.id);
    }
    entries.push({
      kind: "integration-mapping",
      key: `map:${m.id}`,
      label: projectName ? `${projectName} / ${m.name}` : m.name,
      detail: `${m.mappings.length} rows${m.sourceApi ? ` · ${m.sourceApi}` : ""}${projectName ? "" : " · standalone"}`,
      status: m.status,
      mappingId: m.id,
      projectName: projectName ?? null,
      hasSnapshot: !!m.sfSnapshot,
      usedIn: studioNames(sources.projects, users),
    });
  };
  for (const m of sources.standaloneMappings) {
    if (childIds.has(m.id)) continue; // attached - listed under its project
    pushMapping(m, null);
  }
  for (const p of sources.projects) {
    for (const m of p.children) pushMapping(m, p.root.name);
  }

  for (const c of sources.contracts) {
    entries.push({
      kind: "contract-profile",
      key: `contract:${c.id}`,
      label: c.name,
      detail: c.targetObjectApiName ? `→ ${c.targetObjectApiName}` : "no target object",
      profileId: c.id,
      usedIn: [],
    });
  }
  return entries;
}

/** Load every inventory from IndexedDB and index it. Degrades to empties off-browser. */
export async function loadArtifactIndex(): Promise<ArtifactEntry[]> {
  const [wireframes, mappings, roots, contracts] = await Promise.all([
    listExperiences().catch(() => []),
    withStore<MappingProject[]>(STORES.mappingProjects, "readonly", (s) => s.getAll()).catch(() => [] as MappingProject[]),
    withStore<StudioProject[]>(STORES.studioProjects, "readonly", (s) => s.getAll()).catch(() => [] as StudioProject[]),
    listStoredProfiles().catch(() => []),
  ]);
  const byId = new Map((mappings ?? []).map((m) => [m.id, m]));
  return buildArtifactIndex({
    wireframes: wireframes ?? [],
    standaloneMappings: mappings ?? [],
    projects: (roots ?? []).map((root) => ({
      root,
      children: root.mappingIds.map((id) => byId.get(id)).filter((m): m is MappingProject => !!m),
    })),
    contracts: (contracts ?? []).map((c) => ({ id: c.id, name: c.profile.name, targetObjectApiName: c.profile.targetObjectApiName })),
  });
}

/** Case-insensitive search across label + detail + kind. */
export function searchArtifacts(entries: ArtifactEntry[], query: string, kind: ArtifactKind | "all"): ArtifactEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter(
    (e) =>
      (kind === "all" || e.kind === kind) &&
      (!q || e.label.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q) || e.kind.includes(q))
  );
}

/**
 * Subsequence fuzzy score for the command palette. Higher is better;
 * word-start and adjacency earn bonuses, gaps cost. Zero = no match.
 */
export function fuzzyScore(hay: string, needle: string): number {
  const h = hay.toLowerCase();
  const n = needle.trim().toLowerCase();
  if (!n) return 1;
  let score = 0;
  let hi = 0;
  let prev = -2;
  for (let ni = 0; ni < n.length; ni++) {
    const found = h.indexOf(n[ni], hi);
    if (found < 0) return 0;
    if (found === 0 || h[found - 1] === " " || h[found - 1] === "/" || h[found - 1] === "→" || h[found - 1] === "-" || h[found - 1] === "_") score += 3;
    else if (found === prev + 1) score += 2;
    else score += 1;
    if (found < 8) score += 1;
    prev = found;
    hi = found + 1;
  }
  return score;
}

export type AttachMode = "screen" | "project";
export type AttachState = "attach" | "attached" | "open";

/** Whether a palette/dialog row attaches, is already attached, or just opens. */
export function artifactAttachState(
  e: ArtifactEntry,
  opts: { kind: AttachMode; attachedMappingIds: string[]; attachedWireKey: string | null }
): AttachState {
  if (e.kind === "contract-profile") return "open";
  if (opts.kind === "project") {
    if (e.kind !== "integration-mapping") return "open";
    return opts.attachedMappingIds.includes(e.mappingId!) ? "attached" : "attach";
  }
  if (e.kind === "wireframe-screen") {
    return `wire:${e.experienceId}:${e.screenId}` === opts.attachedWireKey ? "attached" : "attach";
  }
  return opts.attachedMappingIds.includes(e.mappingId!) ? "attached" : "attach";
}

/** Navigate target for an artifact row (attach flows keep this for discovery). */
export function artifactTarget(e: ArtifactEntry): string {
  if (e.kind === "wireframe-screen") return "/wireframe";
  if (e.kind === "contract-profile") return "/contracts";
  if (e.projectName) return "/mapping";
  return e.mappingId ? `/mapping?project=${e.mappingId}` : "/mapping";
}

/** Fuzzy-ranked palette results across label + detail. */
export function rankEntries(entries: ArtifactEntry[], query: string): { entry: ArtifactEntry; score: number }[] {
  const q = query.trim();
  if (!q) return entries.map((entry) => ({ entry, score: 1 }));
  return entries
    .map((entry) => ({ entry, score: Math.max(fuzzyScore(entry.label, q), fuzzyScore(entry.detail, q)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
