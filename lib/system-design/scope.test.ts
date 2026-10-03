import { describe, expect, it } from "vitest";
import {
  coerceRunScope,
  newProject,
  resolveRunScope,
  validateProject,
} from "./model";

describe("run scope", () => {
  it("coerces stored scopes, dropping garbage without failing", () => {
    expect(coerceRunScope(undefined)).toBeUndefined();
    expect(coerceRunScope(null)).toBeUndefined();
    expect(coerceRunScope("nope")).toBeUndefined();
    expect(
      coerceRunScope({ startEdgeId: "e1", lanes: [1, 2, -1, 1.5, "x"], opByEdge: { e1: "op1", e2: 42 } })
    ).toEqual({ startEdgeId: "e1", lanes: [1, 2], opByEdge: { e1: "op1" } });
    expect(coerceRunScope({})).toEqual({ startEdgeId: null, lanes: [], opByEdge: {} });
  });

  it("reuses the saved scope for the same start edge, defaults otherwise", () => {
    const p = {
      ...newProject("s"),
      runScope: { startEdgeId: "e1", lanes: [2], opByEdge: { e9: "op9" } },
    };
    expect(resolveRunScope(p, "e1", 3)).toEqual({ lanes: [2], opByEdge: { e9: "op9" } });
    expect(resolveRunScope(p, "e2", 3)).toEqual({ lanes: [1, 2, 3], opByEdge: {} });
    expect(resolveRunScope(p, "e1", 1)).toEqual({ lanes: [1], opByEdge: {} });
  });

  it("survives import validation with scope intact", () => {
    const p = {
      ...newProject("s"),
      runScope: { startEdgeId: "e1", lanes: [1], opByEdge: {} },
    };
    const v = validateProject(JSON.parse(JSON.stringify(p)));
    expect(v.project?.runScope).toEqual({ startEdgeId: "e1", lanes: [1], opByEdge: {} });
    const bad = { ...p, runScope: { lanes: "all" } };
    const v2 = validateProject(JSON.parse(JSON.stringify(bad)));
    expect(v2.project).not.toBeNull();
    expect(v2.project?.runScope).toEqual({ startEdgeId: null, lanes: [], opByEdge: {} });
  });
});
