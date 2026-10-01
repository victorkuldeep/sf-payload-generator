"use client";

import { describe, it, expect } from "vitest";
import {
  newProject,
  validateProject,
  exportProject,
  importProject,
  projectFileName,
  SYSTEM_TEMPLATES,
  SYSTEM_DESIGN_SCHEMA_VERSION,
} from "./model";
import { buildDemoProject } from "./demo";

describe("system design model", () => {
  it("creates a versioned empty project", () => {
    const p = newProject("Acme");
    expect(p.name).toBe("Acme");
    expect(p.schemaVersion).toBe(SYSTEM_DESIGN_SCHEMA_VERSION);
    expect(p.systems).toEqual([]);
    expect(p.connections).toEqual([]);
  });

  it("ships ten templates with icon keys", () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(10);
    for (const t of SYSTEM_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.iconKey.length).toBeGreaterThan(0);
    }
  });

  it("rejects dangling connection references", () => {
    const p = newProject();
    const sys = { id: "s1", name: "A", systemType: "rest" as const, description: "", position: { x: 0, y: 0 }, iconKey: "bolt" };
    const { project, issues } = validateProject({
      ...p,
      systems: [sys],
      connections: [{ id: "c1", sourceId: "s1", targetId: "ghost", label: "", status: "draft" }],
    });
    expect(project).toBeNull();
    expect(issues.some((i) => i.path === "$.connections[0].targetId")).toBe(true);
  });

  it("rejects duplicate system ids and bad positions", () => {
    const p = newProject();
    const base = { name: "A", systemType: "rest" as const, description: "", iconKey: "bolt" };
    const { issues } = validateProject({
      ...p,
      systems: [
        { ...base, id: "s1", position: { x: 0, y: 0 } },
        { ...base, id: "s1", position: { x: "far", y: 0 } },
      ],
      connections: [],
    });
    expect(issues.some((i) => i.message.includes("Duplicate"))).toBe(true);
    expect(issues.some((i) => i.path.includes("position"))).toBe(true);
  });

  it("round-trips export/import and forces draft status", () => {
    const p = buildDemoProject();
    const file = exportProject(p);
    expect(file.kind).toBe("sobject-studio-system-design");
    const back = importProject(JSON.parse(JSON.stringify(file)));
    expect(back.issues).toEqual([]);
    expect(back.project?.systems).toHaveLength(4);
    expect(back.project?.connections).toHaveLength(3);
    expect(back.project?.connections.every((c) => c.status === "draft")).toBe(true);
  });

  it("rejects foreign files and version drift", () => {
    expect(importProject({ kind: "nope" }).project).toBeNull();
    expect(importProject(null).project).toBeNull();
    const file = exportProject(buildDemoProject());
    expect(importProject({ ...file, version: 999, project: { ...file.project, schemaVersion: 999 } }).project).toBeNull();
  });

  it("demo topology is internally consistent", () => {
    const demo = buildDemoProject();
    const { project, issues } = validateProject(JSON.parse(JSON.stringify(demo)));
    expect(issues).toEqual([]);
    expect(project?.systems.length).toBeGreaterThanOrEqual(3);
  });

  it("slugifies file names", () => {
    expect(projectFileName("Lead Triage Flow!")).toBe("lead-triage-flow.sobject-system.json");
    expect(projectFileName("  ")).toBe("architecture.sobject-system.json");
  });
});
