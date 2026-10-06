import { describe, expect, it } from "vitest";
import { analyzeRow } from "./diagnostics";
import { FREE_SOURCE_PATH, blankProject, type MappingRow } from "./types";
import { mergePasteRows, parsePasteGrid, parseTargetText, snapshotTargets, validateTarget } from "./grid";

const snapField = (name: string, over: Record<string, unknown> = {}) => ({
  name, label: name, type: "string", length: 255, precision: 0, scale: 0,
  nillable: true, createable: true, updateable: true, calculated: false,
  defaultedOnCreate: false, unique: false, externalId: false, referenceTo: [],
  relationshipName: null, restrictedPicklist: false, defaultValue: null,
  picklistValues: [], ...over,
});

const snapshotted = () => {
  const p = blankProject({ id: "c", name: "c", now: "2026-01-01T00:00:00.000Z" });
  p.sfSnapshot = {
    id: "s1", capturedAt: "t", fingerprint: "f",
    objects: [
      {
        name: "Account", label: "Account", custom: false,
        fields: [snapField("Name", { nillable: false }), snapField("Industry", { type: "picklist" })],
      },
    ],
  };
  return p;
};

const row = (over: Partial<MappingRow> = {}): MappingRow => ({
  id: "r1", sourcePath: "$.name", planId: null, objectName: "", fieldName: "",
  kind: "direct", status: "unmapped", updatedAt: "t", ...over,
});

describe("grid helpers", () => {
  it("parses Object.Field strictly", () => {
    expect(parseTargetText("Account.Name")).toEqual({ objectName: "Account", fieldName: "Name" });
    expect(parseTargetText("  Account.Industry  ")).toEqual({ objectName: "Account", fieldName: "Industry" });
    expect(parseTargetText("")).toBeNull();
    expect(parseTargetText("Account")).toBeNull();
    expect(parseTargetText("A.B.C")).toBeNull();
    expect(parseTargetText("Account.")).toBeNull();
    expect(parseTargetText("My Object.Name")).toBeNull();
  });

  it("validates against the snapshot when captured, commits blind otherwise", () => {
    const withSnap = snapshotted();
    expect(validateTarget(withSnap, "Account.Name")).toEqual({ ok: true, target: { objectName: "Account", fieldName: "Name" } });
    expect(validateTarget(withSnap, "Contact.Name").ok).toBe(false);
    expect(validateTarget(withSnap, "Account.Nope").ok).toBe(false);
    expect(validateTarget(withSnap, "nope").ok).toBe(false);
    const bare = blankProject({ id: "c", name: "c", now: "t" });
    expect(validateTarget(bare, "Anything.Field")).toEqual({ ok: true, target: { objectName: "Anything", fieldName: "Field" } });
  });

  it("parses pasted grids across separators with honest skips", () => {
    const { rows, skipped } = parsePasteGrid(
      "$.a\tAccount.Name\n$.b -> Contact.Email\n$.c, Lead.Company\n\nbroken line\n$.d -> Nope",
    );
    expect(rows).toEqual([
      { sourcePath: "$.a", objectName: "Account", fieldName: "Name" },
      { sourcePath: "$.b", objectName: "Contact", fieldName: "Email" },
      { sourcePath: "$.c", objectName: "Lead", fieldName: "Company" },
    ]);
    expect(skipped).toEqual([
      { line: 5, reason: "No separator (tab, ->, comma)." },
      { line: 6, reason: "Target must be Object.Field." },
    ]);
  });

  it("merges pastes by source with last-wins and free-row appends", () => {
    let n = 0;
    const merged = mergePasteRows(
      [row({ id: "r1", sourcePath: "$.a", objectName: "Old", fieldName: "X" })],
      [
        { sourcePath: "$.a", objectName: "Account", fieldName: "Name" },
        { sourcePath: "$.b", objectName: "Contact", fieldName: "Email" },
        { sourcePath: FREE_SOURCE_PATH, objectName: "Account", fieldName: "Type" },
        { sourcePath: FREE_SOURCE_PATH, objectName: "Account", fieldName: "Rating" },
      ],
      "plan1",
      () => `n${++n}`,
      "now",
    );
    expect(merged).toHaveLength(4);
    expect(merged[0]).toMatchObject({ id: "r1", objectName: "Account", fieldName: "Name", kind: "direct" });
    expect(merged[1]).toMatchObject({ sourcePath: "$.b", planId: "plan1" });
    expect(merged.filter((m) => m.sourcePath === FREE_SOURCE_PATH)).toHaveLength(2);
  });

  it("lists snapshot targets for autocomplete", () => {
    expect(snapshotTargets(snapshotted())).toEqual(["Account.Name", "Account.Industry"]);
    expect(snapshotTargets(blankProject({ id: "c", name: "c", now: "t" }))).toEqual([]);
  });

  it("diagnoses free rows without crying source-missing", () => {
    const p = snapshotted();
    const good = row({ sourcePath: FREE_SOURCE_PATH, kind: "hardcoded", objectName: "Account", fieldName: "Industry", hardcodedValue: "Tech" });
    expect(analyzeRow(p, good).suggested).toBe("hardcoded");
    const stale = row({ sourcePath: FREE_SOURCE_PATH, kind: "hardcoded", objectName: "Account", fieldName: "Nope" });
    const bad = analyzeRow(p, stale);
    expect(bad.suggested).toBe("stale-target");
    expect(bad.diagnostics[0].category).toBe("target-missing");
  });
});
