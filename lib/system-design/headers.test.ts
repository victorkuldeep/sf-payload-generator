"use client";

import { describe, it, expect } from "vitest";
import { buildSendHeaders } from "./headers";

describe("send headers", () => {
  it("merges stored + ad-hoc with ad-hoc winning, defaults content type", () => {
    const { headers, missing } = buildSendHeaders(
      [
        { key: "X-Static", value: "s" },
        { key: "X-Over", value: "stored" },
      ],
      [{ key: "x-over", value: "adhoc" }],
      {}
    );
    expect(missing).toEqual([]);
    expect(headers).toEqual([
      { key: "Content-Type", value: "application/json" },
      { key: "x-over", value: "adhoc" },
      { key: "X-Static", value: "s" },
    ]);
  });

  it("keeps a configured content type and resolves $env refs", () => {
    const { headers, missing } = buildSendHeaders(
      [
        { key: "Content-Type", value: "text/plain" },
        { key: "Authorization", value: "Bearer $env.K" },
      ],
      [],
      { K: "secret-value" }
    );
    expect(missing).toEqual([]);
    expect(headers).toEqual([
      { key: "Content-Type", value: "text/plain" },
      { key: "Authorization", value: "Bearer secret-value" },
    ]);
  });

  it("reports missing vault names and drops empty names", () => {
    const { headers, missing } = buildSendHeaders(
      [{ key: "Authorization", value: "Bearer $env.NOPE" }],
      [{ key: "  ", value: "x" }],
      {}
    );
    expect(missing).toEqual(["NOPE"]);
    expect(headers.some((h) => h.key.trim() === "")).toBe(false);
  });
});
