import { describe, expect, it } from "vitest";
import { loadContract } from "./load";
import { resolveTarget } from "./target";
import { SAMPLE_SPEC } from "./sample";

async function sampleContract() {
  const c = await loadContract("example.json", SAMPLE_SPEC, SAMPLE_SPEC.length);
  if (c.status === "invalid" || c.status === "unsupported") throw new Error("sample failed to load");
  return c;
}

describe("resolveTarget", () => {
  it("resolves the exact request schema", async () => {
    const c = await sampleContract();
    const r = resolveTarget(c, "POST /orders", "request", undefined, "application/json");
    expect(r.target?.operationId).toBe("POST /orders");
    expect(r.target?.schema).toBeDefined();
  });

  it("resolves the exact 201 response schema", async () => {
    const c = await sampleContract();
    const r = resolveTarget(c, "POST /orders", "response", "201", "application/json");
    expect(r.target?.statusCode).toBe("201");
  });

  it("never substitutes another status code", async () => {
    const c = await sampleContract();
    const r = resolveTarget(c, "POST /orders", "response", "200", "application/json");
    expect(r.target).toBeUndefined();
    expect(r.blocked).toMatch(/200/);
  });

  it("explains body-less statuses instead of validating", async () => {
    const c = await sampleContract();
    const r = resolveTarget(c, "POST /orders", "response", "400", "application/json");
    expect(r.target).toBeUndefined();
    expect(r.blocked).toBeTruthy();
  });

  it("blocks unknown operations", async () => {
    const c = await sampleContract();
    const r = resolveTarget(c, "DELETE /nope", "request", undefined, "application/json");
    expect(r.blocked).toBeTruthy();
  });
});
