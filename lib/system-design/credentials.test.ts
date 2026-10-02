"use client";

import { describe, it, expect } from "vitest";
import {
  isValidCredName,
  normalizeCredName,
  findEnvRefs,
  findMissingVars,
  resolveEnvVars,
  scrubSecrets,
} from "./credentials";

describe("credential vault", () => {
  it("validates env-style names", () => {
    expect(isValidCredName("SF_TOKEN")).toBe(true);
    expect(isValidCredName("A1_B2")).toBe(true);
    expect(isValidCredName("lower")).toBe(false);
    expect(isValidCredName("has space")).toBe(false);
    expect(isValidCredName("")).toBe(false);
    expect(normalizeCredName("  sf-token ")).toBe("SF_TOKEN");
  });

  it("finds $env refs without touching values", () => {
    expect(findEnvRefs("Bearer $env.SF_TOKEN and $env.OTHER end")).toEqual(["SF_TOKEN", "OTHER"]);
    expect(findEnvRefs("{{notenv}} $env")).toEqual([]);
    expect(findEnvRefs("$env.A $env.A")).toEqual(["A"]);
  });

  it("resolves known refs and reports missing ones", () => {
    const r = resolveEnvVars("a=$env.KNOWN b=$env.MISSING", { KNOWN: "v" });
    expect(r.text).toBe("a=v b=$env.MISSING");
    expect(r.missing).toEqual(["MISSING"]);
  });

  it("collects missing vars across texts", () => {
    expect(findMissingVars(["$env.A x", "no refs", "$env.B $env.A"], { A: "1" })).toEqual(["B"]);
    expect(findMissingVars(["plain"], {})).toEqual([]);
  });

  it("scrubs secret values before history persistence", () => {
    const vault = { SF_TOKEN: "secret-abc-123", OTHER: "xy" };
    expect(scrubSecrets("Bearer secret-abc-123 ok", vault)).toBe("Bearer *** ok");
    // short values are not scrubbed (avoid mangling common substrings)
    expect(scrubSecrets("has xy inside", vault)).toBe("has xy inside");
    expect(scrubSecrets("nothing here", vault)).toBe("nothing here");
  });
});
