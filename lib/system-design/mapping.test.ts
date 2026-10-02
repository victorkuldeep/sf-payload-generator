"use client";

import { describe, it, expect } from "vitest";
import { resolvePath, renderTemplate, compileMapping } from "./mapping";

describe("step mapping", () => {
  it("resolves dotted paths with array indices", () => {
    const data = { order: { id: "1", lines: [{ sku: "a" }, { sku: "b" }] } };
    expect(resolvePath(data, "order.id")).toBe("1");
    expect(resolvePath(data, "order.lines.1.sku")).toBe("b");
    expect(resolvePath(data, "order.nope")).toBeUndefined();
    expect(resolvePath(data, "order.lines.9.sku")).toBeUndefined();
    expect(resolvePath(null, "a")).toBeUndefined();
  });

  it("renders templates and reports missing refs", () => {
    const { text, missing } = renderTemplate('{"x": {{order.id}}, "y": {{gone.deep}}}', { order: { id: 7 } });
    expect(text).toBe('{"x": 7, "y": null}');
    expect(missing).toEqual(["gone.deep"]);
  });

  it("compiles passthrough only for JSON sources", () => {
    expect(compileMapping("passthrough", "", '{"x":"hello"}').ok).toBe(true);
    const bad = compileMapping("passthrough", "", "not json{{{");
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/not JSON/);
    expect(compileMapping("passthrough", "", "   ").ok).toBe(false);
  });

  it("validates rendered templates as JSON", () => {
    const good = compileMapping("template", '{"x": {{v}}}', '{"v": "hello world"}');
    expect(good.ok).toBe(true);
    expect(JSON.parse(good.body)).toEqual({ x: "hello world" });
    const bad = compileMapping("template", '{"x": {{v}}}', "nope");
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/Source response is not JSON/);
    const broken = compileMapping("template", "{oops {{v}}", '{"v":1}');
    expect(broken.ok).toBe(false);
    expect(broken.error).toMatch(/not valid JSON/);
  });
});
