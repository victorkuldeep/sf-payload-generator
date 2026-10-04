import { describe, expect, it } from "vitest";
import { parseStatements } from "./dsl";
import { newSequence } from "./model";
import { toMermaid } from "./mermaid";

const TEXT = `Salesforce -> Middleware: Create Order
Middleware ->> EventBus: OrderCreated
ServiceNow --> Middleware: 201 Created
loop each order.lines
Middleware -> ServiceNow: Create Line
end
if Serviceable
Middleware -> ServiceNow: Start
else
Middleware -> Salesforce: Fail
end
retry 3 times wait 5s
Middleware -> ServiceNow: Again
end
note Workshop cut
`;

describe("toMermaid", () => {
  it("projects messages, blocks and notes into sequenceDiagram text", () => {
    const r = parseStatements(TEXT);
    expect(r.errors).toEqual([]);
    const doc = { ...newSequence("Shop"), participants: r.participants, nodes: r.nodes };
    const mm = toMermaid(doc);
    expect(mm).toContain("sequenceDiagram");
    expect(mm).toContain("participant Salesforce");
    expect(mm).toContain("Salesforce->Middleware: Create Order");
    expect(mm).toContain("Middleware->>EventBus: OrderCreated");
    expect(mm).toContain("ServiceNow-->Middleware: 201 Created");
    expect(mm).toContain("loop order.lines");
    expect(mm).toContain("alt Serviceable");
    expect(mm).toContain("else");
    expect(mm).toContain("rect rgba");
    expect(mm).toContain("Note over");
  });
});
