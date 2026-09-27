import { describe, it, expect } from "vitest";
import { detectJunction, buildEdges, buildGraphElements, rootNeighbors } from "./graph";
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

describe("buildGraphElements", () => {
  const labels = new Map<string, string>();
  const notCustom = () => false;

  it("shows removed neighbors as dashed lite previews (ghost fix lives in the panel filter)", () => {
    const root = desc(
      "DandBCompany",
      [],
      [
        { childSObject: "Kept", field: "F", cascadeDelete: false, relationshipName: "Kepts" },
        { childSObject: "Removed", field: "F", cascadeDelete: false, relationshipName: "Removeds" },
      ]
    );
    const neighbors = rootNeighbors(root, labels, notCustom);
    expect(neighbors.map((n) => n.apiName).sort()).toEqual(["Kept", "Removed"]);
    // Ghost-link fix lives in SchemaPanel's neighbor filter (removed names
    // never reach the builder). The builder itself renders every neighbor it
    // is given: described = solid, undescribed = dashed lite preview.
    const described = new Set(["DandBCompany", "Kept"]);
    const { nodes, edges } = buildGraphElements(root, neighbors, described, null, null);
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain("c:Kept");
    expect(ids).toContain("c:Removed");
    const lite = nodes.find((n) => n.id === "c:Removed");
    expect((lite!.data as { loaded: boolean }).loaded).toBe(false);
    expect(edges.some((e) => String(e.target).includes("Removed") || String(e.source).includes("Removed"))).toBe(true);
  });

  it("extends family-tree generations outward from their attach node", () => {
    const root = desc("Lead", [], []);
    const neighbors = [
      { apiName: "Account", label: "Account", custom: false, role: "child" as const, via: "F", kind: "lookup" as const },
      { apiName: "Contact", label: "Contact", custom: false, role: "child" as const, via: "F", kind: "lookup" as const, attachTo: "Account", depth: 2 },
    ];
    const { nodes, edges, extended } = buildGraphElements(root, neighbors, new Set(["Lead", "Account", "Contact"]), null, null);
    expect(extended).toBe(1);
    expect(nodes.map((n) => n.id)).toContain("x:Account:Contact");
    expect(edges.some((e) => e.id === "g|Account|Contact|F")).toBe(true);
  });

  it("renders every described bubble loaded (no dashed ghosts)", () => {
    const root = desc(
      "DandBCompany",
      [],
      [{ childSObject: "Kept", field: "F", cascadeDelete: false, relationshipName: "Kepts" }]
    );
    const neighbors = rootNeighbors(root, labels, notCustom);
    const { nodes } = buildGraphElements(root, neighbors, new Set(["DandBCompany", "Kept"]), null, null);
    const bubble = nodes.find((n) => n.id === "c:Kept");
    expect(bubble).toBeDefined();
    expect((bubble!.data as { loaded: boolean }).loaded).toBe(true);
  });

  it("draws hundreds of neighbors with zero overflow (unbounded orbits)", () => {
    const root = desc(
      "Lead",
      [],
      Array.from({ length: 200 }, (_, i) => ({
        childSObject: `Child${i}`,
        field: "F",
        cascadeDelete: false,
        relationshipName: `R${i}`,
      }))
    );
    const neighbors = rootNeighbors(root, labels, notCustom);
    expect(neighbors.length).toBe(200);
    const { nodes, overflow } = buildGraphElements(root, neighbors, new Set(["Lead"]), null, null);
    expect(nodes.length).toBe(201); // root + every neighbor
    expect(overflow).toBe(0);
  });

  it("links extended generations bubble-to-bubble (Account→Asset edge survives)", () => {
    const root = desc("Lead", [], []);
    const neighbors = [
      { apiName: "Account", label: "Account", custom: false, role: "child" as const, via: "F", kind: "lookup" as const },
      { apiName: "Asset", label: "Asset", custom: false, role: "child" as const, via: "AccountId", kind: "lookup" as const, attachTo: "Account", depth: 2 },
    ];
    const { nodes, edges } = buildGraphElements(root, neighbors, new Set(["Lead", "Account"]), null, null);
    const assetNode = nodes.find((n) => (n.data as { apiName: string }).apiName === "Asset");
    expect(assetNode).toBeDefined();
    expect(assetNode!.id).toBe("x:Account:Asset");
    // The edge must reference the REAL level-1 bubble id (p:/c:Account),
    // never the bare "Account" name React Flow cannot resolve.
    const link = edges.find((e) => e.id === "g|Account|Asset|AccountId");
    expect(link).toBeDefined();
    const srcId = String(link!.source);
    const tgtId = String(link!.target);
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.has(srcId)).toBe(true);
    expect(ids.has(tgtId)).toBe(true);
    expect(tgtId).toBe("x:Account:Asset");
  });
});
