/**
 * Mapping Studio - Excel workbook, CSV and Copy-as-Excel handoff.
 * Design-time artifact: exact API names + canonical paths, frozen panes,
 * filters, no merged cells in data. States its own limitations.
 */

import * as XLSX from "xlsx";
import type { Diagnostic, MappingProject } from "./types";
import { analyzeRow } from "./diagnostics";

const LIMIT_NOTE =
  "Design-time mapping artifact - represents agreed field correspondence and metadata constraints, not proof of runtime behavior. Salesforce validation rules, flows, triggers, permissions and data state may impose additional requirements.";

function fieldOf(project: MappingProject, objectName: string, fieldName: string) {
  return project.sfSnapshot?.objects.find((o) => o.name === objectName)?.fields.find((f) => f.name === fieldName);
}

function sourceOf(project: MappingProject, path: string) {
  return project.source?.paths.find((p) => p.id === path);
}

export interface HandoffCounts {
  mapped: number;
  unmapped: number;
  openDecisions: number;
  errors: number;
  warnings: number;
}

export function handoffCounts(project: MappingProject, findings: Diagnostic[]): HandoffCounts {
  const leaves = project.source?.paths.filter((p) => p.kind === "scalar" || p.kind === "null") ?? [];
  const mapped = new Set(project.mappings.filter((m) => m.kind !== "excluded").map((m) => m.sourcePath));
  return {
    mapped: project.mappings.filter((m) => m.kind !== "excluded").length,
    unmapped: leaves.filter((p) => !mapped.has(p.id)).length,
    openDecisions: project.decisions.filter((d) => d.status === "open").length,
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
  };
}

function mappingSheet(project: MappingProject): unknown[][] {
  const header = [
    "Record Plan", "Target Object API Name", "Source JSON Path", "Source Type", "Example Value",
    "Target Field API Name", "Target Field Label", "Target Field Type", "Nillable", "Createable",
    "Updateable", "Length", "Precision", "Scale", "Mapping Kind", "Mapping Status",
    "Transformation / Enum Mapping", "Rationale", "Notes", "Metadata Snapshot Ref",
  ];
  const rows: unknown[][] = [header];
  for (const m of project.mappings) {
    const src = sourceOf(project, m.sourcePath);
    const field = m.fieldName ? fieldOf(project, m.objectName, m.fieldName) : undefined;
    const plan = m.planId ? project.recordPlans.find((p) => p.id === m.planId)?.name ?? "" : "";
    const enumText = (m.enumMap ?? []).map((e) => `${e.sourceValue}→${e.targetValue}${e.decided ? "" : " (open)"}`).join("; ");
    rows.push([
      plan, m.objectName, m.sourcePath, src?.jsonType ?? "", src?.example ?? "",
      m.fieldName, field?.label ?? "", field?.type ?? "",
      field ? String(field.nillable) : "", field ? String(field.createable) : "", field ? String(field.updateable) : "",
      field?.length ?? "", field?.precision ?? "", field?.scale ?? "",
      m.kind, analyzeRow(project, m).suggested,
      enumText || (m.kind === "hardcoded" ? `hardcoded: ${String(m.hardcodedValue ?? "")}` : ""),
      m.rationale ?? "", m.notes ?? "", project.sfSnapshot?.fingerprint ?? "",
    ]);
  }
  return rows;
}

function styleSheet(ws: XLSX.WorkSheet, widths: number[]): void {
  ws["!cols"] = widths.map((wch) => ({ wch }));
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" };
  void range;
}

export function buildWorkbook(project: MappingProject, findings: Diagnostic[], exportedAt: string): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const counts = handoffCounts(project, findings);

  const summary: unknown[][] = [
    ["Mapping Summary", ""],
    ["Project name", project.name],
    ["Source API / system", `${project.sourceApi ?? ""} / ${project.sourceSystem ?? ""}`],
    ["Target system", project.targetSystem],
    ["Project status", project.status],
    ["Project versions", project.versions.length],
    ["Export timestamp", exportedAt],
    ["Metadata snapshot", project.sfSnapshot ? `${project.sfSnapshot.capturedAt} · ${project.sfSnapshot.fingerprint}` : "none"],
    ["Record plans", project.recordPlans.length],
    ["Mapped rows", counts.mapped],
    ["Unmapped source leaves", counts.unmapped],
    ["Open decisions", counts.openDecisions],
    ["Review errors / warnings", `${counts.errors} / ${counts.warnings}`],
    ["Limitations", LIMIT_NOTE],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  styleSheet(wsSummary, [28, 90]);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  const wsMap = XLSX.utils.aoa_to_sheet(mappingSheet(project));
  styleSheet(wsMap, [18, 22, 30, 12, 20, 22, 22, 14, 10, 10, 10, 8, 10, 8, 12, 14, 30, 30, 30, 20]);
  XLSX.utils.book_append_sheet(wb, wsMap, "Field Mappings");

  const plans: unknown[][] = [["Plan", "Target Object", "Intent", "Source Path", "Cardinality", "Parent Plan", "Match Key", "Mappings", "Notes"]];
  for (const p of project.recordPlans) {
    plans.push([
      p.name, p.objectName, p.intent, p.sourcePath, p.cardinality,
      p.parentPlanId ? (project.recordPlans.find((x) => x.id === p.parentPlanId)?.name ?? p.parentPlanId) : "",
      p.matchKey ?? "", project.mappings.filter((m) => m.planId === p.id).length, p.notes ?? "",
    ]);
  }
  const wsPlans = XLSX.utils.aoa_to_sheet(plans);
  styleSheet(wsPlans, [20, 20, 10, 28, 12, 20, 18, 10, 30]);
  XLSX.utils.book_append_sheet(wb, wsPlans, "Record Plans");

  const rels: unknown[][] = [["Child Plan", "Parent Plan", "Relationship Field", "Strategy", "Confirmed", "Notes"]];
  for (const r of project.relationships) {
    rels.push([
      project.recordPlans.find((p) => p.id === r.childPlanId)?.name ?? r.childPlanId,
      project.recordPlans.find((p) => p.id === r.parentPlanId)?.name ?? r.parentPlanId,
      r.fieldName, r.strategy, r.confirmed ? "yes" : "no", r.notes ?? "",
    ]);
  }
  const wsRels = XLSX.utils.aoa_to_sheet(rels);
  styleSheet(wsRels, [20, 20, 24, 22, 10, 30]);
  XLSX.utils.book_append_sheet(wb, wsRels, "Relationships");

  const decs: unknown[][] = [["Question", "Status", "Owner", "Source Paths", "Target", "Decision", "Rationale", "Created", "Updated"]];
  for (const d of project.decisions) {
    decs.push([d.title, d.status, d.owner ?? "", d.sourcePaths.join("; "), [d.planId ?? "", d.fieldName ?? ""].filter(Boolean).join("."), d.decision ?? "", d.rationale ?? "", d.createdAt, d.updatedAt]);
  }
  const wsDecs = XLSX.utils.aoa_to_sheet(decs);
  styleSheet(wsDecs, [32, 10, 14, 30, 22, 30, 30, 22, 22]);
  XLSX.utils.book_append_sheet(wb, wsDecs, "Decisions");

  const snap: unknown[][] = [["Object", "Field", "Label", "Type", "Length", "Precision", "Scale", "Nillable", "Createable", "Updateable", "External ID", "Reference To", "Picklist (value:active)"]];
  for (const o of project.sfSnapshot?.objects ?? []) {
    for (const f of o.fields) {
      snap.push([o.name, f.name, f.label, f.type, f.length, f.precision, f.scale, String(f.nillable), String(f.createable), String(f.updateable), String(f.externalId), f.referenceTo.join(","), f.picklistValues.map((p) => `${p.value}:${p.active ? 1 : 0}`).join("; ")]);
    }
  }
  const wsSnap = XLSX.utils.aoa_to_sheet(snap);
  styleSheet(wsSnap, [18, 24, 24, 14, 8, 10, 8, 10, 10, 10, 10, 20, 40]);
  XLSX.utils.book_append_sheet(wb, wsSnap, "Schema Snapshot");

  const log: unknown[][] = [["Version", "Timestamp", "Summary", "Fingerprint"]];
  for (const v of project.versions) {
    log.push([v.label, v.createdAt, v.summary, v.fingerprint]);
  }
  const wsLog = XLSX.utils.aoa_to_sheet(log);
  styleSheet(wsLog, [30, 24, 60, 20]);
  XLSX.utils.book_append_sheet(wb, wsLog, "Change Log");

  return wb;
}

export function downloadWorkbook(project: MappingProject, findings: Diagnostic[]): void {
  const wb = buildWorkbook(project, findings, new Date().toISOString());
  const safe = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mapping";
  XLSX.writeFile(wb, `${safe}-handoff.xlsx`);
}

const CSV_COLS = ["Record Plan", "Target Object", "Source Path", "Source Type", "Example", "Target Field", "Field Label", "Field Type", "Kind", "Status", "Rationale", "Notes"];

function csvEscape(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function mappingsCsv(project: MappingProject): string {
  const lines = [CSV_COLS.map(csvEscape).join(",")];
  for (const m of project.mappings) {
    const src = sourceOf(project, m.sourcePath);
    const field = m.fieldName ? fieldOf(project, m.objectName, m.fieldName) : undefined;
    const plan = m.planId ? project.recordPlans.find((p) => p.id === m.planId)?.name ?? "" : "";
    lines.push(
      [plan, m.objectName, m.sourcePath, src?.jsonType ?? "", src?.example ?? "", m.fieldName, field?.label ?? "", field?.type ?? "", m.kind, analyzeRow(project, m).suggested, m.rationale ?? "", m.notes ?? ""]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

export function downloadCsv(project: MappingProject): void {
  const blob = new Blob([mappingsCsv(project)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mapping";
  a.href = url;
  a.download = `${safe}-mappings.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Tab-separated copy of mapping rows - pastes straight into Excel. */
export function mappingsTsv(project: MappingProject): { text: string; count: number } {
  const lines = [CSV_COLS.join("\t")];
  for (const m of project.mappings) {
    const src = sourceOf(project, m.sourcePath);
    const field = m.fieldName ? fieldOf(project, m.objectName, m.fieldName) : undefined;
    const plan = m.planId ? project.recordPlans.find((p) => p.id === m.planId)?.name ?? "" : "";
    const cells = [plan, m.objectName, m.sourcePath, src?.jsonType ?? "", String(src?.example ?? ""), m.fieldName, field?.label ?? "", field?.type ?? "", m.kind, analyzeRow(project, m).suggested, m.rationale ?? "", m.notes ?? ""];
    lines.push(cells.map((c) => String(c).replace(/\t/g, " ").replace(/\n/g, " ")).join("\t"));
  }
  return { text: lines.join("\n"), count: project.mappings.length };
}
