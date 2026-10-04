import { describe, expect, it } from "vitest";
import { parseStatements, printStatements } from "./dsl";

const SAMPLE = `participant Salesforce system
participant Middleware
participant EventBus bus

Salesforce -> Middleware: Create Order
Middleware -> ServiceNow: Create Fulfillment
ServiceNow --> Middleware: 201 Created
Salesforce ->> EventBus: OrderCreated
loop each order.lines
Middleware -> ServiceNow: Create Line
end
if Serviceable
Middleware -> ServiceNow: Start
else Not serviceable
Middleware -> Salesforce: Mark Failed
end
parallel Fan-out
Middleware -> Salesforce: Update Order
end
retry 3 times wait 5s Fulfillment
Middleware -> ServiceNow: Create Fulfillment
end
note Review with the client
`;

describe("parseStatements", () => {
  it("parses the full V1 grammar without errors", () => {
    const r = parseStatements(SAMPLE);
    expect(r.errors).toEqual([]);
    expect(r.participants.map((p) => `${p.name}:${p.kind}`)).toEqual([
      "Salesforce:system",
      "Middleware:system",
      "EventBus:bus",
      "ServiceNow:system",
    ]);
    expect(r.nodes).toHaveLength(9);
    const kinds = r.nodes.filter((n) => n.nodeType === "message").map((m) => m.kind);
    expect(kinds).toEqual(["sync", "sync", "response", "async"]);
    const loop = r.nodes[4];
    expect(loop.nodeType).toBe("block");
    if (loop.nodeType === "block") expect(loop.iterator).toBe("order.lines");
    const cond = r.nodes[5];
    if (cond.nodeType === "block") {
      expect(cond.condition).toBe("Serviceable");
      expect(cond.elseLabel).toBe("Not serviceable");
      expect(cond.elseChildren?.length).toBe(1);
    }
    const retry = r.nodes[7];
    if (retry.nodeType === "block") {
      expect(retry.attempts).toBe(3);
      expect(retry.waitSecs).toBe(5);
    }
  });

  it("auto-creates participants and retypes on declaration", () => {
    const r = parseStatements("A -> B: hi\nparticipant B store\n");
    expect(r.errors).toEqual([]);
    expect(r.participants.find((p) => p.name === "B")?.kind).toBe("store");
  });

  it("flags stray end, unclosed blocks and empty labels", () => {
    const r = parseStatements("end\nA -> B: \nloop x\n");
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/end without/);
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/needs a label/);
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/never closed/);
  });

  it("prefers messages over keywords", () => {
    const r = parseStatements("Retry -> Ops: page me\n");
    expect(r.errors).toEqual([]);
    expect(r.nodes[0].nodeType).toBe("message");
  });
});

describe("round-trip", () => {
  it("parse(print(parse(x))) is stable", () => {
    const once = parseStatements(SAMPLE);
    expect(once.errors).toEqual([]);
    const printed = printStatements(once.participants, once.nodes);
    const twice = parseStatements(printed);
    expect(twice.errors).toEqual([]);
    expect(printStatements(twice.participants, twice.nodes)).toBe(printed);
    // Canonical form keeps every statement.
    expect(printed).toMatch(/Salesforce -> Middleware: Create Order/);
    expect(printed).toMatch(/loop each order\.lines/);
    expect(printed).toMatch(/retry 3 times wait 5s Fulfillment/);
  });
});
