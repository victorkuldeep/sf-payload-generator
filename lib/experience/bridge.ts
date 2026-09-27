/**
 * Experience Mapping - cross-module integrity + lineage (pure).
 * References are validated, never silently redirected. Broken refs keep
 * their last-known label as historical context.
 */

import type { MappingProject } from "../mapping/types";
import type { BackendDependency } from "./types";

export interface IntegrityProblem {
  dependencyId: string;
  operationId: string;
  message: string;
}

/** Check every backend dependency against live project state. */
export function checkDependencies(project: MappingProject): IntegrityProblem[] {
  const out: IntegrityProblem[] = [];
  const deps = project.apiCatalog?.dependencies ?? [];
  const ops = new Set(project.apiCatalog?.operations.map((o) => o.id) ?? []);
  const snapshotObjects = new Map((project.sfSnapshot?.objects ?? []).map((o) => [o.name, o]));
  const mappingRows = new Map(project.mappings.map((m) => [m.id, m]));
  const plans = new Set(project.recordPlans.map((p) => p.id));

  for (const d of deps) {
    if (!ops.has(d.operationId)) {
      out.push({ dependencyId: d.id, operationId: d.operationId, message: `Dependency "${d.label}" references missing operation ${d.operationId}.` });
      continue;
    }
    const ref = d.reference;
    if (!ref) continue;
    if (d.kind === "salesforce-object") {
      if (ref.objectApiName && !snapshotObjects.has(ref.objectApiName)) {
        out.push({ dependencyId: d.id, operationId: d.operationId, message: `Salesforce object ${ref.objectApiName} is not in the project snapshot.` });
      }
    } else if (d.kind === "salesforce-field") {
      const obj = ref.objectApiName ? snapshotObjects.get(ref.objectApiName) : undefined;
      if (ref.objectApiName && !obj) {
        out.push({ dependencyId: d.id, operationId: d.operationId, message: `Salesforce object ${ref.objectApiName} is not in the project snapshot.` });
      } else if (obj && ref.fieldApiName && !obj.fields.some((f) => f.name === ref.fieldApiName)) {
        out.push({ dependencyId: d.id, operationId: d.operationId, message: `Field ${ref.objectApiName}.${ref.fieldApiName} is not in the project snapshot.` });
      }
    } else if (d.kind === "integration-mapping") {
      if (ref.artifactId && !mappingRows.has(ref.artifactId) && !plans.has(ref.artifactId)) {
        out.push({ dependencyId: d.id, operationId: d.operationId, message: `Integration artifact ${ref.artifactId} was deleted or never existed.` });
      }
    } else if (d.kind === "api-operation") {
      if (ref.artifactId && !ops.has(ref.artifactId)) {
        out.push({ dependencyId: d.id, operationId: d.operationId, message: `Chained operation ${ref.artifactId} no longer exists.` });
      }
    }
  }
  return out;
}

export interface LineageNode {
  requirementId: string;
  requirementName: string;
  bindingId: string;
  operationId: string;
  operationName: string;
  operationKey: string;
  dependencies: { id: string; label: string; kind: string; broken: boolean }[];
}

/** Component lineage: requirement → binding → operation → dependencies. */
export function componentLineage(project: MappingProject, componentId: string): LineageNode[] {
  const exp = project.experience;
  if (!exp) return [];
  const ops = new Map(project.apiCatalog?.operations.map((o) => [o.id, o]) ?? []);
  const broken = new Set(checkDependencies(project).map((p) => p.dependencyId));
  const out: LineageNode[] = [];
  for (const req of exp.requirements.filter((r) => r.componentId === componentId)) {
    const bindings = exp.bindings.filter(
      (b) => b.componentId === componentId && (b.requestRequirementIds.includes(req.id) || b.responseRequirementIds.includes(req.id))
    );
    for (const b of bindings) {
      const op = ops.get(b.operationId);
      if (!op) continue;
      out.push({
        requirementId: req.id,
        requirementName: req.name,
        bindingId: b.id,
        operationId: op.id,
        operationName: op.name,
        operationKey: op.operationKey,
        dependencies: (project.apiCatalog?.dependencies ?? [])
          .filter((d) => d.operationId === op.id)
          .map((d) => ({ id: d.id, label: d.label, kind: d.kind, broken: broken.has(d.id) })),
      });
    }
  }
  return out;
}
