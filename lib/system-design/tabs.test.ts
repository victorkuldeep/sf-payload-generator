import { describe, expect, it } from "vitest";

import {
  coerceFlows,
  coerceScenarios,
  coerceSettings,
  newProject,
  validateProject,
} from "./model";

describe("flows / scenarios / settings coercion", () => {
  it("new projects start with empty flows, scenarios, and default settings", () => {
    const p = newProject("x");
    expect(p.flows).toEqual([]);
    expect(p.scenarios).toEqual([]);
    expect(p.settings).toEqual({ retentionDays: 30 });
  });

  it("vintage records validate with coerced defaults", () => {
    const vintage = {
      id: "proj_1",
      name: "vintage",
      schemaVersion: 1,
      updatedAt: 1,
      systems: [],
      connections: [],
    };
    const { project, issues } = validateProject(vintage);
    expect(issues).toEqual([]);
    expect(project?.flows).toEqual([]);
    expect(project?.scenarios).toEqual([]);
    expect(project?.settings).toEqual({ retentionDays: 30 });
  });

  it("flows keep valid entries and drop malformed ones", () => {
    const flows = coerceFlows([
      { id: "f1", name: "TMF622 as-is", startEdgeId: "e1", lanes: [2, 1, 2, -1, "x"], opByEdge: { e1: "op1", bad: 7 } },
      { id: "", name: "no id" },
      { name: "no id at all" },
      "junk",
    ]);
    expect(flows).toHaveLength(1);
    expect(flows[0]).toEqual({ id: "f1", name: "TMF622 as-is", startEdgeId: "e1", lanes: [1, 2], opByEdge: { e1: "op1" } });
  });

  it("scenarios clamp mocks, payload, and expected status", () => {
    const [s] = coerceScenarios([
      {
        id: "s1",
        name: "happy",
        flowId: "f1",
        environmentId: "",
        inputPayload: '{"a":1}',
        mockOverrides: {
          op1: { status: 200, body: '{"ok":true}', latencyMs: 50 },
          bad: { status: "x", body: 1, latencyMs: 2 },
        },
        expectStatus: 200,
      },
      { id: "s2", name: "  ", flowId: 9, expectStatus: 99 },
    ]);
    expect(s.flowId).toBe("f1");
    expect(s.environmentId).toBeNull();
    expect(s.mockOverrides).toEqual({ op1: { status: 200, body: '{"ok":true}', latencyMs: 50 } });
    expect(s.expectStatus).toBe(200);
  });

  it("settings clamp retention to 1-365 days with a 30-day default", () => {
    expect(coerceSettings(undefined)).toEqual({ retentionDays: 30 });
    expect(coerceSettings({})).toEqual({ retentionDays: 30 });
    expect(coerceSettings({ retentionDays: 0 })).toEqual({ retentionDays: 1 });
    expect(coerceSettings({ retentionDays: 9999 })).toEqual({ retentionDays: 365 });
    expect(coerceSettings({ retentionDays: 7 })).toEqual({ retentionDays: 7 });
  });

  it("non-boolean production flags are import issues", () => {
    const raw = {
      id: "proj_1",
      name: "p",
      schemaVersion: 1,
      updatedAt: 1,
      systems: [],
      connections: [],
      environments: [{ id: "env1", name: "Prod", baseUrl: "", isProduction: "yes" }],
    };
    const { project, issues } = validateProject(raw);
    expect(project).toBeNull();
    expect(issues.some((i) => i.path.includes("isProduction"))).toBe(true);
  });
});
