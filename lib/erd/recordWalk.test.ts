"use client";

import { describe, it, expect } from "vitest";
import {
  isValidRecordId,
  escapeSoqlString,
  displayFieldNames,
  buildRootQuery,
  buildChildrenQuery,
  resolveTarget,
  nodeRecordState,
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
});
