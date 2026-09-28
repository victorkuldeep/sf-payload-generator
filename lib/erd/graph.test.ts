import { describe, it, expect } from "vitest";
import { detectJunction, buildEdges, buildGraphElements, rootNeighbors, bubbleInitials, assignBubbleTags, systemReason, isSystemObject, isNeuralExcluded } from "./graph";
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

  it("draws hundreds of neighbors with zero overflow (unbounded orbits)", () => {    const root = desc(
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

  it("mesh: same object under two parents shares one bubble with two edges", () => {
    const root = desc("Lead", [], []);
    const neighbors = [
      { apiName: "Account", label: "Account", custom: false, role: "child" as const, via: "F", kind: "lookup" as const },
      { apiName: "DNB", label: "D&B", custom: false, role: "child" as const, via: "F", kind: "lookup" as const },
      { apiName: "DNB", label: "D&B", custom: false, role: "child" as const, via: "G", kind: "lookup" as const, attachTo: "Account", depth: 2 },
    ];
    const { nodes, edges } = buildGraphElements(root, neighbors, new Set(["Lead"]), null, null, "mesh");
    const dnb = nodes.filter((n) => (n.data as { apiName: string }).apiName === "DNB");
    expect(dnb).toHaveLength(1); // one shared bubble
    const ids = new Set(nodes.map((n) => n.id));
    const dnbEdges = edges.filter((e) => String(e.id).includes("|DNB|"));
    expect(dnbEdges.length).toBe(2); // Lead>D&B AND Account>D&B
    for (const e of dnbEdges) {
      expect(ids.has(String(e.source))).toBe(true);
      expect(ids.has(String(e.target))).toBe(true);
    }
  });

  it("linear: same object under two parents gets independent bubbles", () => {
    const root = desc("Lead", [], []);
    const neighbors = [
      { apiName: "Account", label: "Account", custom: false, role: "child" as const, via: "F", kind: "lookup" as const },
      { apiName: "DNB", label: "D&B", custom: false, role: "child" as const, via: "F", kind: "lookup" as const },
      { apiName: "DNB", label: "D&B", custom: false, role: "child" as const, via: "G", kind: "lookup" as const, attachTo: "Account", depth: 2 },
    ];
    const { nodes, edges } = buildGraphElements(root, neighbors, new Set(["Lead"]), null, null, "linear");
    const dnb = nodes.filter((n) => (n.data as { apiName: string }).apiName === "DNB");
    expect(dnb.length).toBe(2); // independent bubbles per attach path
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length); // ids unique
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length); // edge ids unique
  });
});

describe("system-noise detection", () => {  it("flags core org objects", () => {
    expect(systemReason({ apiName: "User", role: "parent", via: "OwnerId" })).toBe("system object");
    expect(systemReason({ apiName: "Profile", role: "child", via: "X" })).toBe("system object");
  });
  it("flags audit parents only via audit fields", () => {
    expect(systemReason({ apiName: "User", role: "parent", via: "CreatedById" })).toBe("system object"); // identity wins
    expect(systemReason({ apiName: "SomeParent", role: "parent", via: "CreatedById" })).toBe("audit lookup (CreatedById)");
    expect(systemReason({ apiName: "SomeParent", role: "parent", via: "Custom_Lookup__c" })).toBeNull();
    expect(systemReason({ apiName: "Account", role: "child", via: "CreatedById" })).toBeNull(); // children never audit
  });
  it("flags Share/Feed/History children, keeps real objects", () => {
    expect(systemReason({ apiName: "LeadShare", role: "child", via: "R" })).toBe("platform family");
    expect(systemReason({ apiName: "LeadFeed", role: "child", via: "R" })).toBe("platform family");
    expect(systemReason({ apiName: "LeadHistory", role: "child", via: "R" })).toBe("platform family");
    expect(systemReason({ apiName: "Contact", role: "child", via: "R" })).toBeNull();
    expect(systemReason({ apiName: "Account", role: "parent", via: "AccountId" })).toBeNull();
  });
  it("isSystemObject covers ERD-level names", () => {
    expect(isSystemObject("User")).toBe(true);
    expect(isSystemObject("LeadShare")).toBe(true);
    expect(isSystemObject("Opportunity")).toBe(false);
  });
  it("covers the extended platform list", () => {
    for (const name of [
      "VoiceCall", "VideoCall", "Visit", "EngagementTopic",
      "AttachedContentNote", "GeneratedDocument", "DocumentEnvelope",
      "DocumentChecklistItem", "NoteAndAttachment",
      "RecordAction", "RecordAlert", "ProcessException", "DuplicateRecordItem",
      "NetworkUserHistoryRecent", "OmniAssessmentTask", "GenericVisitTaskContext",
    ]) {
      expect(isSystemObject(name)).toBe(true);
    }
    expect(isSystemObject("Account")).toBe(false);
  });
  it("isNeuralExcluded keeps sweeps domain-only, custom always passes", () => {
    expect(isNeuralExcluded("Task", false)).toBe(true);
    expect(isNeuralExcluded("User", false)).toBe(true);
    expect(isNeuralExcluded("LeadShare", false)).toBe(true);
    expect(isNeuralExcluded("Account", false)).toBe(false);
    expect(isNeuralExcluded("Quote__c", true)).toBe(false);
    expect(isNeuralExcluded("Task__c", true)).toBe(false); // custom always deep
  });
});

describe("bubbleInitials", () => {  it("disambiguates prefixed team names by last two segments", () => {
    expect(bubbleInitials("DESIGNFORM_PRICING_REQUEST__c")).toBe("PR");
    expect(bubbleInitials("DESIGNFORM_REQUEST_TERM")).toBe("RT");
  });
  it("splits camelCase and strips namespaces", () => {
    expect(bubbleInitials("OrderItem")).toBe("OI");
    expect(bubbleInitials("ns__MyObject__c")).toBe("MO");
    expect(bubbleInitials("DandBCompany")).toBe("DB");
  });
  it("keeps first-two-letters for single words", () => {
    expect(bubbleInitials("Lead")).toBe("LE");
    expect(bubbleInitials("Account")).toBe("AC");
  });
});

describe("assignBubbleTags", () => {
  it("word-splits multi-word names and resolves collisions in sequence", () => {
    const tags = assignBubbleTags(["DESIGN_REQUEST__c", "DESIGN_FORM__c", "Lead", "Account"]);
    expect(tags.get("DESIGN_FORM__c")).toBe("DF");
    expect(tags.get("DESIGN_REQUEST__c")).toBe("DR");
    expect(tags.get("Lead")).toBe("LE");
    expect(tags.get("Account")).toBe("AC");
  });
  it("walks FIRST+LAST, earlier words, 3-char, then numeric fallback", () => {
    // AB_X2__c claims AX first (A+X initials); AB_X__c escapes via numeric
    // fallback (AX2); AB_Y__c escapes via FIRST+LAST (AY). All unique.
    const tags = assignBubbleTags(["AB_X__c", "AB_Y__c", "AB_X2__c"]);
    const vals = [...tags.values()];
    expect(new Set(vals).size).toBe(vals.length); // all unique
    expect(tags.get("AB_X2__c")).toBe("AX");
    expect(tags.get("AB_X__c")).toBe("AX2");
    expect(tags.get("AB_Y__c")).toBe("AY");
  });
  it("falls back to numeric suffixes when every candidate collides", () => {
    const tags = assignBubbleTags(["AB", "Ab", "aB"]);
    expect(new Set([...tags.values()]).size).toBe(3);
  });
  it("is deterministic regardless of input order", () => {
    const a = assignBubbleTags(["Zulu", "Alpha", "Mike"]);
    const b = assignBubbleTags(["Mike", "Zulu", "Alpha"]);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});
