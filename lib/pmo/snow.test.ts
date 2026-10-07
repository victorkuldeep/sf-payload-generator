import { describe, expect, it } from "vitest";
import { buildSnowRecord, normalizeSnowInstance, normalizeSnowTable, SNOW_TABLES } from "./snow";

describe("snow adapter", () => {
  it("pins instances to *.service-now.com over https", () => {
    expect(normalizeSnowInstance("acme.service-now.com")).toEqual({ ok: true, instance: "https://acme.service-now.com" });
    expect(normalizeSnowInstance("https://acme.service-now.com/")).toEqual({
      ok: true,
      instance: "https://acme.service-now.com",
    });
    expect(normalizeSnowInstance("https://acme.com").ok).toBe(false);
    expect(normalizeSnowInstance("http://acme.service-now.com").ok).toBe(false);
    expect(normalizeSnowInstance("https://u:p@acme.service-now.com").ok).toBe(false);
    expect(normalizeSnowInstance("").ok).toBe(false);
  });

  it("offers the first-class tables", () => {
    expect(SNOW_TABLES.map((t) => t.name)).toContain("incident");
    expect(SNOW_TABLES.map((t) => t.name)).toContain("rm_story");
  });

  it("sanity-checks custom table names", () => {
    expect(normalizeSnowTable("incident")).toEqual({ ok: true, table: "incident" });
    expect(normalizeSnowTable("RM_Story ")).toEqual({ ok: true, table: "rm_story" });
    expect(normalizeSnowTable("incident; DROP").ok).toBe(false);
    expect(normalizeSnowTable("").ok).toBe(false);
  });

  it("builds a stamped plain-text record", () => {
    const r = buildSnowRecord({ title: "Hub times out", body: "Retry **thrice**.", kind: "task" });
    expect(r.shortDescription).toBe("Hub times out");
    expect(r.description).toContain("[GRAVENX Console · task]");
    expect(r.description).toContain("Retry **thrice**.");
  });

  it("never ships an empty record", () => {
    const r = buildSnowRecord({ title: "  " });
    expect(r.shortDescription).toBe("Untitled Console task");
    expect(r.description).toContain("No description yet.");
  });
});
