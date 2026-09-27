import type { ApiProject, Decision } from "./types";
import { newDecisionId } from "./decision-model";

/**
 * Rule-based Architecture Assistant. Deterministic facilitation - no LLM,
 * no network. Produces PROPOSED decisions with stable ids (re-runs never
 * duplicate); the architect accepts/rejects/deferrs. Nothing proposed
 * compiles until accepted (see approvedDecisions).
 */

export function suggestForProject(
  project: ApiProject,
  metaFieldCounts: Map<string, number>
): Decision[] {
  const out: Decision[] = [];
  const propose = (d: Omit<Decision, "id" | "status" | "suggested" | "createdAt" | "revision"> & { id: string }) => {
    out.push({ ...d, status: "proposed", suggested: true, createdAt: 0, revision: project.version });
  };

  for (const op of project.operations) {
    if (!op.description) {
      propose({
        id: `sug-desc-${op.id}`,
        topic: "Documentation",
        question: `Add a description for ${op.method} ${op.route}?`,
        options: ["Add description", "Defer"],
        chosen: "",
        rationale: "Undocumented operations fail architecture review.",
        owner: "",
        relatedOps: [op.id],
      });
    }
    if (op.errorResponses.length === 0) {
      propose({
        id: `sug-errors-${op.id}`,
        topic: "Error model",
        question: `Which error responses does ${op.method} ${op.route} document?`,
        options: ["400 Bad Request", "401 Unauthorized", "404 Not Found", "422 Unprocessable", "Defer"],
        chosen: "",
        rationale: "Every operation needs an explicit error strategy before approval.",
        owner: "",
        relatedOps: [op.id],
      });
    }
    if (op.security.length === 0) {
      propose({
        id: `sug-sec-${op.id}`,
        topic: "Security",
        question: `What secures ${op.method} ${op.route}?`,
        options: ["OAuth2", "API key", "None (document why)", "Defer"],
        chosen: "",
        rationale: "Unspecified security blocks approval.",
        owner: "",
        relatedOps: [op.id],
      });
    }
  }

  if (project.defaultSecurity.length === 0) {
    propose({
      id: "sug-default-sec",
      topic: "Security",
      question: "Set a default security requirement for the API?",
      options: ["OAuth2", "API key", "Per-operation only", "Defer"],
      chosen: "",
      rationale: "A default removes per-operation ambiguity.",
      owner: "",
      relatedOps: [],
    });
  }

  // Overexposure: schema covering most of an object's fields.
  for (const s of project.schemas) {
    const sources = new Set(
      s.properties.flatMap((p) => (p.source ? [p.source.objectApiName] : []))
    );
    for (const obj of sources) {
      const total = metaFieldCounts.get(obj) ?? 0;
      const covered = s.properties.filter((p) => p.source?.objectApiName === obj).length;
      if (total > 5 && covered / total > 0.8) {
        propose({
          id: `sug-exposure-${s.name}-${obj}`,
          topic: "Overexposure",
          question: `Schema ${s.name} covers ${covered}/${total} ${obj} fields - intentional?`,
          options: ["Intentional, approve", "Narrow the schema", "Defer"],
          chosen: "",
          rationale: "Metadata is a catalog, not a ready-made public API.",
          owner: "",
          relatedOps: [],
        });
      }
    }
  }

  return out;
}

/** Merge suggestions without duplicating stable ids. Returns added count. */
export function mergeSuggestions(project: ApiProject, suggestions: Decision[]): { project: ApiProject; added: number } {
  const have = new Set(project.decisions.map((d) => d.id));
  const fresh = suggestions.filter((s) => !have.has(s.id));
  if (fresh.length === 0) return { project, added: 0 };
  return {
    project: { ...project, updatedAt: Date.now(), decisions: [...project.decisions, ...fresh] },
    added: fresh.length,
  };
}

export { newDecisionId };
