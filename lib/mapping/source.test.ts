import { describe, expect, it } from "vitest";
import { extractPaths, parseSourceJson, reconcilePaths } from "./source";

describe("parseSourceJson", () => {
  it("parses valid JSON", () => {
    expect(parseSourceJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });
  it("reports line/column when the parser gives a position", () => {
    const r = parseSourceJson('{\n"a": 1} x');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/line 2/);
  });
  it("rejects empty input", () => {
    expect(parseSourceJson("  ").ok).toBe(false);
  });
});

describe("extractPaths", () => {
  it("extracts flat + nested objects with canonical paths", () => {
    const paths = extractPaths({ ponr: "false", order: { orderNumber: "A1", total: 9.5 } });
    const ids = paths.map((p) => p.id);
    expect(ids).toContain("$");
    expect(ids).toContain("$.ponr");
    expect(ids).toContain("$.order.orderNumber");
    expect(paths.find((p) => p.id === "$.order")?.kind).toBe("object");
    expect(paths.find((p) => p.id === "$.order.total")?.jsonType).toBe("number");
    expect(paths.find((p) => p.id === "$.ponr")?.example).toBe("false"); // string preserved, not boolean
  });

  it("collapses arrays to one [] element path", () => {
    const paths = extractPaths({ orderItem: [{ id: "1", quantity: 2 }, { id: "2", quantity: 3 }] });
    const ids = paths.map((p) => p.id);
    expect(ids).toContain("$.orderItem");
    expect(ids).toContain("$.orderItem[]");
    expect(ids).toContain("$.orderItem[].id");
    expect(ids).toContain("$.orderItem[].quantity");
    expect(ids.filter((i) => i.includes("[0]") || i.includes("[1]"))).toEqual([]);
    expect(paths.find((p) => p.id === "$.orderItem[]")?.inArray).toBe(true);
  });

  it("handles nulls, empty objects and empty arrays", () => {
    const paths = extractPaths({ a: null, b: {}, c: [] });
    expect(paths.find((p) => p.id === "$.a")?.kind).toBe("null");
    expect(paths.find((p) => p.id === "$.b")?.kind).toBe("object");
    expect(paths.find((p) => p.id === "$.c")?.kind).toBe("array");
    // No element row for empty arrays.
    expect(paths.some((p) => p.id === "$.c[]")).toBe(false);
  });

  it("escapes unsafe keys unambiguously", () => {
    const paths = extractPaths({ "my.key": 1, "a b": 2 });
    expect(paths.map((p) => p.id)).toContain('$["my.key"]');
    expect(paths.map((p) => p.id)).toContain('$["a b"]');
  });

  it("marks every sample path requiredness unknown", () => {
    const paths = extractPaths({ a: 1 });
    expect(paths.every((p) => p.required === "unknown")).toBe(true);
  });

  it("distinguishes integer from number", () => {
    const paths = extractPaths({ i: 3, f: 3.5 });
    expect(paths.find((p) => p.id === "$.i")?.jsonType).toBe("integer");
    expect(paths.find((p) => p.id === "$.f")?.jsonType).toBe("number");
  });

  it("produces unique stable ids (reparse-safe)", () => {
    const doc = { order: { lines: [{ sku: "x" }] } };
    const a = extractPaths(doc).map((p) => p.id);
    const b = extractPaths(JSON.parse(JSON.stringify(doc))).map((p) => p.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("reconcilePaths", () => {
  it("splits live vs orphaned mappings without deleting", () => {
    const catalog = extractPaths({ a: 1 });
    expect(reconcilePaths(["$.a", "$.gone"], catalog)).toEqual({ live: ["$.a"], orphaned: ["$.gone"] });
  });
});
