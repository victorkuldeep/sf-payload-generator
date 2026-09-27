/**
 * Experience Mapping - lazy project migration.
 *
 * Pre-experience projects (schemaVersion absent/1) load untouched.
 * Experience structures materialize only when the architect opens the
 * Experience module - never as an eager full-project rewrite.
 */

import { blankApiCatalog, blankExperienceModule } from "./types";
import { MAPPING_SCHEMA_VERSION, type MappingProject } from "../mapping/types";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Ensure the Experience module exists. Returns the project (mutated in place). */
export function ensureExperience(project: MappingProject, now: string): MappingProject {
  if (!project.experience) {
    project.experience = blankExperienceModule(uid("exp"), now);
  }
  if (!project.apiCatalog) {
    project.apiCatalog = blankApiCatalog(uid("api"), now);
  }
  if (!project.archDecisions) project.archDecisions = [];
  if (!project.assumptions) project.assumptions = [];
  if (!project.changeLog) project.changeLog = [];
  if (!project.schemaVersion || project.schemaVersion < MAPPING_SCHEMA_VERSION) {
    project.schemaVersion = MAPPING_SCHEMA_VERSION;
    logChange(project, "project", project.id, "migration", `Migrated to schema v${MAPPING_SCHEMA_VERSION} (experience-ready).`, now, "migration");
  }
  project.updatedAt = now;
  return project;
}

/** Append a change-history entry. Meaningful edits only - never keystrokes. */
export function logChange(
  project: MappingProject,
  entityType: string,
  entityId: string,
  changeType: string,
  summary: string,
  now: string,
  origin: "manual" | "import" | "migration" | "system" = "manual"
): void {
  if (!project.changeLog) project.changeLog = [];
  project.changeLog.push({
    id: uid("chg"),
    timestamp: now,
    entityType,
    entityId,
    changeType,
    summary,
    origin,
  });
}
