import { describe, it, expect } from "vitest";
import { parseJsonInput, formatBytes, formatJson } from "./studio";

describe("parseJsonInput", () => {
  it("parses valid JSON", () => {
    const r = parseJsonInput('{"a": 1}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1 });
  });
  it("rejects empty input", () => {
    const r = parseJsonInput("   ");
    expect(r.ok).toBe(false);
  });
  it("reports syntax errors readably", () => {
    const r = parseJsonInput('{\n"a": }');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not valid JSON|line 2/);
  });
});

describe("formatBytes", () => {
  it("formats B/KB/MB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});

describe("formatJson", () => {
  it("pretty-prints with 2-space indent", () => {
    expect(formatJson({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}');
  });
});
