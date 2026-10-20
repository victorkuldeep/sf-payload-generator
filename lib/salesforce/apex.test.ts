import { describe, it, expect } from "vitest";
import {
  toolingVersion,
  executeAnonymousPath,
  apexLogBodyPath,
  parseApexResult,
  apexSummary,
} from "./apex";

describe("anonymous apex paths", () => {
  it("normalizes the api version", () => {
    expect(toolingVersion("66.0")).toBe("v66.0");
    expect(toolingVersion("v66.0")).toBe("v66.0");
  });

  it("builds the executeAnonymous GET path with encoded body", () => {
    // encodeURIComponent leaves single quotes alone but encodes the semicolon.
    expect(executeAnonymousPath("v66.0", "System.debug('hi');")).toBe(
      "/services/data/v66.0/tooling/executeAnonymous/?anonymousBody=System.debug('hi')%3B"
    );
  });

  it("builds the ApexLog body path", () => {
    expect(apexLogBodyPath("66.0", "07Lxx0000012345")).toBe(
      "/services/data/v66.0/sobjects/ApexLog/07Lxx0000012345/Body"
    );
  });
});

describe("parseApexResult", () => {
  it("parses a clean execution", () => {
    expect(parseApexResult({ compiled: true, success: true, line: -1, column: -1, id: "07L1" })).toEqual({
      compiled: true,
      success: true,
      line: null,
      column: null,
      compileProblem: null,
      exceptionMessage: null,
      exceptionStackTrace: null,
      logId: "07L1",
    });
  });

  it("parses a compile failure with location", () => {
    const r = parseApexResult({ compiled: false, success: false, line: 3, column: 12, compileProblem: "Unexpected token" });
    expect(r.compiled).toBe(false);
    expect(r.line).toBe(3);
    expect(apexSummary(r)).toContain("line 3");
  });

  it("parses a runtime exception", () => {
    const r = parseApexResult({ compiled: true, success: false, exceptionMessage: "System.DmlException", id: "07L2" });
    expect(apexSummary(r)).toContain("System.DmlException");
  });

  it("never throws on garbage", () => {
    expect(parseApexResult(null).success).toBe(false);
    expect(parseApexResult("oops").compiled).toBe(false);
    expect(parseApexResult([1]).logId).toBeNull();
  });
});
