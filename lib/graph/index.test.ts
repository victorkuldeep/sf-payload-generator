import { describe, expect, it } from "vitest";
import { buildIndex, whereUsed } from "./index";
import type { SystemProject } from "@/lib/system-design/model";
import type { Experience } from "@/lib/wireframe/model";
import type { SequenceDocument } from "@/lib/sequence/model";
import { linkDecision, newDecision } from "@/lib/decisions/model";
import { newConsoleTask } from "@/lib/console/model";
import type { ErdSnapshot } from "@/lib/erd/snapshotDb";

const project = {
  id: "p1",
  name: "Ordering topology",
  systems: [
    { id: "s1", name: "Salesforce" },
    { id: "s2", name: "Middleware" },
  ],
  interfaces: [{ id: "i1", systemId: "s2", name: "Orders API", protocol: "REST" }],
  operations: [{ id: "op1", interfaceId: "i1", name: "Create order", method: "POST", path: "/orders" }],
  connections: [
    { id: "c1", sourceId: "s1", targetId: "s2", label: "Create Order", sourceOperationId: "op1" },
    { id: "c2", sourceId: "s1", targetId: "gone", label: "Lost hop" },
  ],
} as unknown as SystemProject;

const snapshot = {
  id: "snap1",
  orgDomain: "x.my.salesforce.com",
  name: "Orders ERD",
  createdAt: 1,
  root: "Account",
  focus: "Account",
  nodes: ["Account", "Contact"],
  positions: {},
} as ErdSnapshot;

const experience = {
  id: "e1",
  name: "Customer portal",
  screens: [{ id: "sc1", name: "Detail", viewport: { width: 1, height: 1 }, position: { x: 0, y: 0 } }],
  components: [
    { id: "w1", kind: "input", label: "Name", binding: { source: "salesforce", object: "Account", field: "Name" } },
    {
      id: "w2",
      kind: "select",
      label: "Segment",
      proposedField: { object: "Account", apiName: "Segment__c", label: "Segment", type: "Picklist" },
    },
  ],
  journeys: [],
  proposedFields: [],
} as unknown as Experience;

const sequence = {
  id: "q1",
  name: "Order flow",
  participants: [
    { id: "pt1", name: "Salesforce" },
    { id: "pt2", name: "Middleware", systemRef: "Middleware" },
  ],
  nodes: [
    { nodeType: "message", id: "m1", from: "pt1", to: "pt2", label: "Create Order", kind: "sync", operationRef: "op1" },
    { nodeType: "message", id: "m2", from: "pt2", to: "ghost", label: "Lost reply", kind: "response" },
  ],
} as unknown as SequenceDocument;

function world() {
  const d1 = linkDecision(newDecision("Middleware owns orchestration", "ADR-001", 1), {
    surface: "system",
    recordId: "p1",
    label: "Ordering topology",
  });
  // Stale id, live name: import renamed the project, the label survived.
  const d2 = linkDecision(newDecision("Events downstream", "ADR-002", 2), {
    surface: "system",
    recordId: "p-old",
    label: "Ordering topology",
  });
  const d3 = linkDecision(newDecision("Gone system", "ADR-003", 3), {
    surface: "system",
    recordId: "p-gone",
    label: "Deleted project",
  });
  const t = { ...newConsoleTask("Track the portal", 4), links: [{ surface: "wireframe" as const, recordId: "e1", label: "Customer portal" }] };
  return buildIndex({ systems: [project], snapshots: [snapshot], experiences: [experience], sequences: [sequence], decisions: [d1, d2, d3], tasks: [t], drawBoard: true });
}

describe("graph index", () => {
  it("indexes every surface and binds operations", () => {
    const g = world();
    const kinds = new Set(g.nodes.map((n) => n.kind));
    for (const k of ["project", "system", "operation", "experience", "component", "sequence", "participant", "decision", "console-task", "snapshot", "schema-object", "schema-field", "draw-board"]) {
      expect(kinds.has(k as never)).toBe(true);
    }
    const binds = g.edges.filter((e) => e.kind === "binds" && e.resolution === "id");
    expect(binds.length).toBeGreaterThan(0);
    const invokes = g.edges.find((e) => e.kind === "invokes" && e.resolution === "id");
    expect(invokes?.label).toBe("Create Order");
  });

  it("resolves id-first, falls back to name, then surfaces unresolved", () => {
    const g = world();
    const idEdge = g.edges.find((e) => e.kind === "links" && e.label === "Ordering topology" && e.resolution === "id");
    expect(idEdge).toBeDefined();
    const nameEdge = g.edges.find((e) => e.kind === "links" && e.label === "Ordering topology" && e.resolution === "name");
    // d1 (id hit) and d2 (name fallback) both link the same project.
    expect(nameEdge).toBeDefined();
    const bad = g.edges.find((e) => e.kind === "links" && e.label === "Deleted project");
    expect(bad?.resolution).toBe("unresolved");
    expect(g.unresolved.some((u) => u.raw === "p-gone" && u.name === "Deleted project")).toBe(true);
    // Dangling connection target + ghost participant are visible too.
    expect(g.unresolved.some((u) => u.raw === "gone")).toBe(true);
    expect(g.unresolved.some((u) => u.raw === "ghost")).toBe(true);
  });

  it("answers where-used for schema fields, systems and operations", () => {
    const g = world();
    const field = whereUsed(g, { object: "Account", field: "Name" });
    expect(field.node?.kind).toBe("schema-field");
    expect(field.inbound.some((e) => e.kind === "binds")).toBe(true);
    const sys = whereUsed(g, { surface: "system", name: "Middleware" });
    expect(sys.inbound.some((e) => e.kind === "connects")).toBe(true);
    expect(sys.inbound.some((e) => e.kind === "maps-to" && e.resolution === "name")).toBe(true);
    const missing = whereUsed(g, { object: "Nope", field: "Nothing__c" });
    expect(missing.node).toBeNull();
  });

  it("tracks proposed fields as proposes edges", () => {
    const g = world();
    const proposes = g.edges.filter((e) => e.kind === "proposes");
    expect(proposes).toHaveLength(1);
    expect(g.nodes.find((n) => n.key === proposes[0].to)?.name).toBe("Account.Segment__c");
  });
});
