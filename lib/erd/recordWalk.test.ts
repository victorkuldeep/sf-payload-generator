"use client";

import { describe, it, expect } from "vitest";
import {
  isValidRecordId,
  escapeSoqlString,
  displayFieldNames,
  queryableFieldNames,
  chunkSelect,
  buildRootQuery,
  buildChildrenQuery,
  resolveTarget,
  nodeRecordState,
  selectedRecordId,
  formatWalkValue,
  keyFieldFor,
  buildLabelQuery,
  labelFromRow,
  emptyLoadedState,
  type LoadedState,
  type ResolveContext,
} from "./recordWalk";

const leadDesc = {
  fields: [
    { name: "Id", type: "id", referenceTo: [] },
    { name: "Name", type: "string", referenceTo: [] },
    { name: "ConvertedAccountId", type: "reference", referenceTo: ["Account"] },
    { name: "OwnerId", type: "reference", referenceTo: ["User"] },
  ],
  childRelationships: [{ childSObject: "Task", relationshipName: "Tasks" }],
};
const accountDesc = {
  fields: [
    { name: "Id", type: "id", referenceTo: [] },
    { name: "Name", type: "string", referenceTo: [] },
    { name: "ParentId", type: "reference", referenceTo: ["Account"] },
  ],
  childRelationships: [{ childSObject: "Contact", relationshipName: "Contacts" }],
};
const taskDesc = {
  fields: [
    { name: "Id", type: "id", referenceTo: [] },
    { name: "Subject", type: "string", referenceTo: [] },
    { name: "WhoId", type: "reference", referenceTo: ["Lead", "Contact"] },
  ],
  childRelationships: [],
};

const describes = new Map([
  ["Lead", leadDesc],
  ["Account", accountDesc],
  ["Task", taskDesc],
]);

const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  rootApi: "Lead",
  rootId: "00Qxx0000012345",
  canvasApis: ["Lead", "Account", "Task"],
  getDescribe: (api) => describes.get(api),
  labelOf: (api) => api,
  ...over,
});

const withRoot = (): LoadedState => {
  const s = emptyLoadedState();
  s.singles.set("Lead", new Map([["00Qxx0000012345", { id: "00Qxx0000012345", fields: { Id: "00Qxx0000012345", ConvertedAccountId: "001xx000003DGbP" } }]]));
  return s;
};

describe("record walk engine", () => {
  it("validates record ids", () => {
    expect(isValidRecordId("00Qxx0000012345")).toBe(true);
    expect(isValidRecordId("00Qxx0000012345EAB")).toBe(true);
    expect(isValidRecordId("00Qxx!")).toBe(false);
    expect(isValidRecordId("  ")).toBe(false);
  });

  it("escapes soql strings", () => {
    expect(escapeSoqlString("o'b\\c")).toBe("o\\'b\\\\c");
    expect(buildRootQuery("Lead", ["Id"], "00Q'xx")).toContain("00Q\\'xx");
  });

  it("excludes compound/blob types from full-row pulls, Id first", () => {
    const names = queryableFieldNames([
      { name: "Name", type: "string", referenceTo: [] },
      { name: "BillingAddress", type: "address", referenceTo: [] },
      { name: "VersionData", type: "base64", referenceTo: [] },
      { name: "Id", type: "id", referenceTo: [] },
    ]);
    expect(names[0]).toBe("Id");
    expect(names).not.toContain("BillingAddress");
    expect(names).not.toContain("VersionData");
    expect(names).toContain("Name");
  });

  it("chunks long select lists under the cap", () => {
    const names = Array.from({ length: 100 }, (_, i) => `Custom_Field_${i}__c`);
    const chunks = chunkSelect(names, 500);
    expect(chunks.flat()).toEqual(names);
    for (const c of chunks) {
      expect(c.join(", ").length).toBeLessThanOrEqual(500);
    }
    expect(chunkSelect(["Id", "Name"], 500)).toEqual([["Id", "Name"]]);
    expect(chunkSelect([], 500)).toEqual([[]]);
  });

  it("picks Id + name + lookups for display", () => {
    const { select } = displayFieldNames(leadDesc.fields.map((f) => ({ ...f, nameField: f.name === "Name" })));
    expect(select).toEqual(["Id", "Name", "ConvertedAccountId", "OwnerId"]);
    expect(buildChildrenQuery("Task", "WhoId", "00Q1", ["Id"], 10)).toContain("OFFSET 10");
  });

  it("resolves a parent via a loaded lookup value (single GET)", () => {
    const plan = resolveTarget("Account", withRoot(), ctx());
    expect(plan).toEqual({ kind: "single", apiName: "Account", id: "001xx000003DGbP" });
  });

  it("resolves children via a loaded parent id (1-many query)", () => {
    const plan = resolveTarget("Task", withRoot(), ctx());
    expect(plan.kind).toBe("children");
    if (plan.kind === "children") {
      expect(plan.lookupField).toBe("WhoId");
      expect(plan.parentId).toBe("00Qxx0000012345");
    }
  });

  it("blocks with the canvas parent to load first", () => {
    const plan = resolveTarget("Task", emptyLoadedState(), ctx({ rootApi: null, rootId: null }));
    expect(plan.kind).toBe("blocked");
    if (plan.kind === "blocked") expect(plan.missingApi).toBe("Lead");
  });

  it("uses child-row ids to reach the next level (junction legs)", () => {
    const s = withRoot();
    s.children.set("Task::WhoId::00Qxx0000012345", {
      childApi: "Task", lookupField: "WhoId", parentApi: "Lead", parentId: "00Qxx0000012345",
      rows: [{ Id: "00Txx row" }], offset: 11, exhausted: false,
    });
    // Task rows aboard -> Task node itself is known
    const plan = resolveTarget("Task", s, ctx());
    expect(plan).toEqual({ kind: "single", apiName: "Task", id: "00Txx row" });
  });

  it("reports eye states: live, reachable, locked", () => {
    const empty = nodeRecordState("Task", emptyLoadedState(), ctx({ rootApi: null, rootId: null }));
    expect(empty.state).toBe("locked");
    expect(empty.hint).toContain("Lead");
    const live = nodeRecordState("Lead", withRoot(), ctx());
    expect(live.state).toBe("live");
    const reach = nodeRecordState("Account", withRoot(), ctx());
    expect(reach.state).toBe("reachable");
  });

  it("selects the explicit pick, else first child row, else first single", () => {
    const s = withRoot();
    // singles only: first single wins
    expect(selectedRecordId("Lead", s)).toBe("00Qxx0000012345");
    expect(selectedRecordId("Task", s)).toBeNull();
    // child rows beat cached singles
    s.singles.set("Task", new Map([["00Told", { id: "00Told", fields: { Id: "00Told" } }]]));
    s.children.set("Task::WhoId::00Qxx0000012345", {
      childApi: "Task", lookupField: "WhoId", parentApi: "Lead", parentId: "00Qxx0000012345",
      rows: [{ Id: "00Tfresh", Subject: "Call" }, { Id: "00Tsecond", Subject: "Email" }], offset: 11, exhausted: false,
    });
    expect(selectedRecordId("Task", s)).toBe("00Tfresh");
    // explicit pick wins when aboard, falls back when unknown
    expect(selectedRecordId("Task", s, "00Tsecond")).toBe("00Tsecond");
    expect(selectedRecordId("Task", s, "00Tghost")).toBe("00Tfresh");
  });

  it("formats walk values for peeks", () => {
    expect(formatWalkValue(null)).toBe("—");
    expect(formatWalkValue(undefined)).toBe("—");
    expect(formatWalkValue("Acme")).toBe("Acme");
    expect(formatWalkValue(42)).toBe("42");
    expect(formatWalkValue({ a: 1 })).toBe('{"a":1}');
    expect(formatWalkValue("x".repeat(200))).toHaveLength(120);
  });

  it("resolves key fields via nameField then fallbacks", () => {
    expect(keyFieldFor([{ name: "OrderNumber", type: "string", referenceTo: [], nameField: true }])).toBe("OrderNumber");
    expect(keyFieldFor([
      { name: "Id", type: "id", referenceTo: [] },
      { name: "OrderNumber", type: "string", referenceTo: [] },
    ])).toBe("OrderNumber");
    expect(keyFieldFor([
      { name: "Id", type: "id", referenceTo: [] },
      { name: "Name", type: "string", referenceTo: [] },
    ])).toBe("Name");
    expect(keyFieldFor([{ name: "Id", type: "id", referenceTo: [] }])).toBeNull();
    expect(buildLabelQuery("User", "Name", "005x")).toContain("SELECT Id, Name FROM User");
    expect(labelFromRow({ Id: "005x", Name: "Ada" }, "Name")).toBe("Ada");
    expect(labelFromRow({ Id: "005x" }, "Name")).toBeNull();
    expect(labelFromRow(undefined, "Name")).toBeNull();
  });
});
