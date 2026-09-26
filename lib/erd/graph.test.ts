import { describe, it, expect } from "vitest";
import { detectJunction, buildEdges } from "./graph";
import type { SalesforceDescribeResult } from "@/lib/salesforce/types";

const desc = (
  name: string,
  fields: Array<{ name: string; type?: string; nillable?: boolean; referenceTo?: string[] }>,
  childRelationships: SalesforceDescribeResult["childRelationships"] = []
): SalesforceDescribeResult => ({
  name,
  label: name,
  labelPlural: name,
  custom: false,
  createable: true,
  updateable: true,
  fields: fields.map((f) => ({
    name: f.name,
    label: f.name,
    type: f.type ?? "string",
    length: 0,
    precision: 0,
    scale: 0,
    nillable: f.nillable ?? true,
    createable: true,
    updateable: true,
    calculated: false,
    defaultedOnCreate: false,
    unique: false,
    externalId: false,
    referenceTo: f.referenceTo ?? [],
    relationshipName: f.referenceTo?.length ? f.name : null,
    picklistValues: [],
    restrictedPicklist: false,
    autoNumber: false,
    idLookup: true,
    filterable: true,
    sortable: true,
    groupable: true,
    nameField: false,
    htmlFormatted: false,
    deprecatedAndHidden: false,
    digits: 0,
    byteLength: 0,
    inlineHelpText: null,
    defaultValue: null,
    soapType: "xsd:string",
  })),
  childRelationships,
});

describe("detectJunction", () => {
  it("flags 2+ required non-system lookups as junction", () => {
    const d = desc("X__c", [
      { name: "A__c", type: "reference", nillable: false, referenceTo: ["A__c"] },
      { name: "B__c", type: "reference", nillable: false, referenceTo: ["B__c"] },
    ]);
    expect(detectJunction(d)).toBe(true);
  });
  it("ignores CreatedById / LastModifiedById / OwnerId", () => {
    const d = desc("Account", [
      { name: "CreatedById", type: "reference", nillable: false, referenceTo: ["User"] },
      { name: "LastModifiedById", type: "reference", nillable: false, referenceTo: ["User"] },
      { name: "OwnerId", type: "reference", nillable: false, referenceTo: ["User"] },
    ]);
    expect(detectJunction(d)).toBe(false);
  });
  it("does not flag single lookup", () => {
    const d = desc("X__c", [
      { name: "A__c", type: "reference", nillable: false, referenceTo: ["A__c"] },
    ]);
    expect(detectJunction(d)).toBe(false);
  });
  it("nillable lookups don't count", () => {
    const d = desc("X__c", [
      { name: "A__c", type: "reference", nillable: true, referenceTo: ["A__c"] },
      { name: "B__c", type: "reference", nillable: true, referenceTo: ["B__c"] },
    ]);
    expect(detectJunction(d)).toBe(false);
  });
});

describe("buildEdges", () => {
  it("draws edge only when both ends described", () => {
    const map = new Map<string, SalesforceDescribeResult>([
      [
        "Account",
        desc(
          "Account",
          [{ name: "OwnerId", type: "reference", referenceTo: ["User"] }],
          [{ childSObject: "Contact", field: "AccountId", cascadeDelete: false, relationshipName: "Contacts" }]
        ),
      ],
      [
        "Contact",
        desc("Contact", [
          { name: "AccountId", type: "reference", referenceTo: ["Account"] },
        ]),
      ],
    ]);
    const edges = buildEdges(map);
    const edge = edges.find((e) => e.source === "Account" && e.target === "Contact");
    expect(edge).toBeDefined();
    expect(edge!.data?.kind).toBe("lookup");
  });

  it("flags master-detail when child's cascadeDelete is true", () => {
    const map = new Map<string, SalesforceDescribeResult>([
      [
        "Account",
        desc(
          "Account",
          [],
          [{ childSObject: "Contact", field: "AccountId", cascadeDelete: true, relationshipName: "Contacts" }]
        ),
      ],
      [
        "Contact",
        desc("Contact", [
          { name: "AccountId", type: "reference", referenceTo: ["Account"] },
        ]),
      ],
    ]);
    const edges = buildEdges(map);
    const edge = edges.find((e) => e.source === "Account" && e.target === "Contact");
    expect(edge!.data?.kind).toBe("md");
  });

  it("dedupes edges between same parent/child/field", () => {
    const map = new Map<string, SalesforceDescribeResult>([
      ["Account", desc("Account", [], [])],
      [
        "Contact",
        desc("Contact", [
          { name: "AccountId", type: "reference", referenceTo: ["Account"] },
        ]),
      ],
    ]);
    const edges = buildEdges(map);
    const matches = edges.filter((e) => e.target === "Contact" && e.source === "Account");
    expect(matches.length).toBe(1);
  });
});
