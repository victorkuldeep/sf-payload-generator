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
