import {
  newId,
  PARTICIPANT_KINDS,
  type BlockType,
  type MessageKind,
  type Participant,
  type ParticipantKind,
  type SeqBlock,
  type SeqMessage,
  type SeqNode,
} from "./model";

/**
 * Sequence DSL (EPIC 03): strict, line-based, unambiguous.
 *
 *   participant Salesforce system
 *   Salesforce -> Middleware: Create Order
 *   Middleware --> Salesforce: Order Created
 *   Salesforce ->> EventBus: OrderCreated
 *   loop each order.lines
 *   if Serviceable
 *   else Not serviceable
 *   parallel Fulfillment fan-out
 *   retry 3 times wait 5s
 *   note Review with the client
 *   end
 *
 * Participants spring into existence on first mention (kind system);
 * `participant` lines declare or retype them. The printer emits canonical
 * DSL; parse(print(x)) is stable - the round-trip tests pin that.
 */

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  participants: Participant[];
  nodes: SeqNode[];
  errors: ParseError[];
}

interface Frame {
  block: SeqBlock;
  elseBranch: boolean;
}

const ARROW = /^(.+?)\s*(-->|->>|->)\s*(.+?)\s*:\s*(.*)$/;
const PARTICIPANT = /^participant\s+([A-Za-z0-9_][A-Za-z0-9_ ]*?)(?:\s+(system|service|actor|bus|store))?\s*$/i;
const LOOP = /^loop(?:\s+each\s+(.+))?\s*(.*?)\s*$/i;
const IF = /^if\s+(.+?)\s*$/i;
const ELSE = /^else(?:\s+(.+?))?\s*$/i;
const PARALLEL = /^parallel(?:\s+(.+?))?\s*$/i;
const RETRY = /^retry(?:\s+(\d+)\s+times?)?(?:\s+wait\s+(\d+(?:\.\d+)?)s?)?(?:\s+(.+?))?\s*$/i;
const NOTE = /^note\s+(.+?)\s*$/i;

function kindOf(op: string): MessageKind {
  return op === "-->" ? "response" : op === "->>" ? "async" : "sync";
}

export function parseStatements(text: string): ParseResult {
  const participants: Participant[] = [];
  const byName = new Map<string, Participant>();
  const nodes: SeqNode[] = [];
  const errors: ParseError[] = [];
  const stack: Frame[] = [];

  const target = (): SeqNode[] => {
    const top = stack[stack.length - 1];
    if (!top) return nodes;
    if (top.elseBranch) {
      top.block.elseChildren = top.block.elseChildren ?? [];
      return top.block.elseChildren;
    }
    return top.block.children;
  };

  const ensureParticipant = (name: string): Participant => {
    const key = name.toLowerCase();
    const hit = byName.get(key);
    if (hit) return hit;
    const p: Participant = { id: newId("par"), name, kind: "system" };
    participants.push(p);
    byName.set(key, p);
    return p;
  };

  const lines = text.split("\n");
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    let m: RegExpMatchArray | null;
    if ((m = line.match(PARTICIPANT)) && !line.includes("->") && !line.includes("--")) {
      const name = m[1].trim();
      const kind = (m[2]?.toLowerCase() ?? null) as ParticipantKind | null;
      const key = name.toLowerCase();
      const hit = byName.get(key);
      if (hit) {
        if (kind) hit.kind = kind;
      } else {
        const p: Participant = { id: newId("par"), name, kind: kind ?? "system" };
        participants.push(p);
        byName.set(key, p);
      }
      return;
    }
    if (/^end\s*$/i.test(line)) {
      if (stack.length === 0) {
        errors.push({ line: lineNo, message: "end without an open block." });
        return;
      }
      stack.pop();
      return;
    }
    if (!ARROW.test(line) && (m = line.match(LOOP))) {
      const iterator = m[1]?.trim() || undefined;
      const extra = m[2]?.trim() || undefined;
      const block: SeqBlock = {
        nodeType: "block", id: newId("blk"), type: "loop",
        title: extra ?? "",
        iterator, children: [],
      };
      target().push(block);
      stack.push({ block, elseBranch: false });
      return;
    }
    // Block openers never contain arrows: a line shaped like a message is one,
    // even when its first word is a keyword ("Retry -> Ops: page me").
    if (!ARROW.test(line) && (m = line.match(IF))) {
      const block: SeqBlock = {
        nodeType: "block", id: newId("blk"), type: "condition",
        title: "", condition: m[1].trim(), children: [],
      };
      target().push(block);
      stack.push({ block, elseBranch: false });
      return;
    }
    if ((m = line.match(ELSE))) {
      const top = stack[stack.length - 1];
      if (!top || top.block.type !== "condition") {
        errors.push({ line: lineNo, message: "else without an open if block." });
        return;
      }
      if (m[1]?.trim()) top.block.elseLabel = m[1].trim();
      top.elseBranch = true;
      return;
    }
    if (!ARROW.test(line) && (m = line.match(PARALLEL))) {
      const block: SeqBlock = {
        nodeType: "block", id: newId("blk"), type: "parallel",
        title: m[1]?.trim() ?? "", children: [],
      };
      target().push(block);
      stack.push({ block, elseBranch: false });
      return;
    }
    if (!ARROW.test(line) && (m = line.match(RETRY))) {
      const block: SeqBlock = {
        nodeType: "block", id: newId("blk"), type: "retry",
        title: m[3]?.trim() ?? "",
        attempts: m[1] ? parseInt(m[1], 10) : 3,
        waitSecs: m[2] ? parseFloat(m[2]) : undefined,
        children: [],
      };
      target().push(block);
      stack.push({ block, elseBranch: false });
      return;
    }
    if (!ARROW.test(line) && (m = line.match(NOTE))) {
      target().push({ nodeType: "block", id: newId("blk"), type: "note", title: m[1].trim(), children: [] });
      return;
    }
    if ((m = line.match(ARROW))) {
      const from = ensureParticipant(m[1].trim());
      const to = ensureParticipant(m[3].trim());
      const msg: SeqMessage = {
        nodeType: "message", id: newId("msg"),
        from: from.id, to: to.id,
        label: m[4].trim(), kind: kindOf(m[2]),
      };
      if (!msg.label) errors.push({ line: lineNo, message: "Message needs a label after the colon." });
      target().push(msg);
      return;
    }
    errors.push({ line: lineNo, message: `Not a statement - want "A -> B: label", a block opener, "else" or "end".` });
  });

  for (const f of stack) {
    errors.push({ line: lines.length, message: `"${f.block.type}" block was never closed with end.` });
  }
  return { participants, nodes, errors };
}

/** Canonical DSL for a document - the printer half of the round-trip. */
export function printStatements(participants: Participant[], nodes: SeqNode[]): string {
  const L: string[] = [];
  for (const p of participants) {
    L.push(`participant ${p.name}${p.kind !== "system" ? ` ${p.kind}` : ""}`);
  }
  if (participants.length > 0 && nodes.length > 0) L.push("");
  const names = new Map(participants.map((p) => [p.id, p.name]));
  const nm = (ref: string) => names.get(ref) ?? ref;

  const arrowOf = (kind: MessageKind): string => (kind === "response" ? "-->" : kind === "async" ? "->>" : "->");

  const walk = (list: SeqNode[]) => {
    for (const n of list) {
      if (n.nodeType === "message") {
        L.push(`${nm(n.from)} ${arrowOf(n.kind)} ${nm(n.to)}: ${n.label}`);
      } else if (n.type === "note") {
        L.push(`note ${n.title}`);
      } else if (n.type === "loop") {
        L.push(n.iterator ? `loop each ${n.iterator}` : `loop${n.title ? ` ${n.title}` : ""}`);
        walk(n.children);
        L.push("end");
      } else if (n.type === "condition") {
        L.push(`if ${n.condition ?? n.title}`);
        walk(n.children);
        if ((n.elseChildren ?? []).length > 0) {
          L.push(`else${n.elseLabel ? ` ${n.elseLabel}` : ""}`);
          walk(n.elseChildren ?? []);
        }
        L.push("end");
      } else if (n.type === "parallel") {
        L.push(`parallel${n.title ? ` ${n.title}` : ""}`);
        walk(n.children);
        L.push("end");
      } else if (n.type === "retry") {
        const bits = [`retry ${n.attempts ?? 3} times`];
        if (n.waitSecs) bits.push(`wait ${n.waitSecs}s`);
        if (n.title) bits.push(n.title);
        L.push(bits.join(" "));
        walk(n.children);
        L.push("end");
      }
    }
  };
  walk(nodes);
  return L.join("\n");
}

export function blockTypeOf(s: string): BlockType | null {
  const v = s.trim().toLowerCase();
  return (["loop", "condition", "parallel", "retry", "note"] as BlockType[]).find((t) => t === v) ?? null;
}

export function participantKindOf(s: string): ParticipantKind | null {
  const v = s.trim().toLowerCase();
  return (PARTICIPANT_KINDS as readonly string[]).includes(v) ? (v as ParticipantKind) : null;
}
