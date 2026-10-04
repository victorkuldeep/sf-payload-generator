import type { SequenceDocument, SeqNode } from "./model";

/**
 * Mermaid export (EPIC 07): one-way projection of the interaction model
 * into `sequenceDiagram` text. Mermaid is an export format, never the
 * model - retry blocks become annotated rects, notes span the diagram.
 */

function arrowOf(kind: string): string {
  if (kind === "async") return "->>";
  if (kind === "response") return "-->";
  return "->";
}

export function toMermaid(doc: SequenceDocument): string {
  const L = ["sequenceDiagram", `autonumber`];
  for (const p of doc.participants) {
    L.push(`participant ${p.name}`);
  }
  const names = new Map(doc.participants.map((p) => [p.id, p.name]));
  const nm = (ref: string) => names.get(ref) ?? ref;
  const first = doc.participants[0]?.name ?? "A";
  const last = doc.participants[doc.participants.length - 1]?.name ?? "B";

  const walk = (list: SeqNode[]) => {
    for (const n of list) {
      if (n.nodeType === "message") {
        const label = n.label.replace(/[#;]/g, "");
        L.push(`${nm(n.from)}${arrowOf(n.kind)}${nm(n.to)}: ${label || "call"}`);
      } else if (n.type === "note") {
        L.push(`Note over ${first},${last}: ${n.title.replace(/[#;]/g, "")}`);
      } else if (n.type === "loop") {
        L.push(`loop ${n.iterator ?? n.title}`.trimEnd());
        walk(n.children);
        L.push("end");
      } else if (n.type === "condition") {
        L.push(`alt ${n.condition ?? n.title}`.trimEnd());
        walk(n.children);
        if ((n.elseChildren ?? []).length > 0) {
          L.push(`else ${n.elseLabel ?? ""}`.trimEnd());
          walk(n.elseChildren ?? []);
        }
        L.push("end");
      } else if (n.type === "parallel") {
        L.push(`par ${n.title}`.trimEnd());
        walk(n.children);
        L.push("end");
      } else if (n.type === "retry") {
        L.push(`rect rgba(201, 168, 106, 0.15)`);
        L.push(`%% retry ${n.attempts ?? 3}x${n.waitSecs ? ` wait ${n.waitSecs}s` : ""}${n.title ? ` - ${n.title}` : ""}`);
        walk(n.children);
        L.push("end");
      }
    }
  };
  walk(doc.nodes);
  return L.join("\n");
}
