import { parseStatements } from "./dsl";
import { newSequence, SequenceSchema, type SequenceDocument } from "./model";

/**
 * Sequence file import: the mirror of the History dialog exports.
 * Accepts the exported package, a raw document, or plain DSL text
 * (.txt) - anything a fellow dev can hand over. Every path re-ids the
 * document so an import can never overwrite an existing sequence.
 */

export interface SequenceImport {
  ok: boolean;
  document?: SequenceDocument;
  error?: string;
}

function fresh(doc: SequenceDocument, name: string): SequenceDocument {
  return { ...doc, id: `${doc.id}_imp_${Date.now().toString(36)}`, name: name.slice(0, 160), updatedAt: Date.now() };
}

export function importSequenceFile(text: string, filename: string): SequenceImport {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) {
    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, error: "Not valid JSON." };
    }
    const candidate =
      raw && typeof raw === "object" && "document" in raw
        ? (raw as { document?: unknown }).document
        : raw;
    const parsed = SequenceSchema.safeParse(candidate);
    if (!parsed.success) {
      return { ok: false, error: "Not a GRAVENX sequence package - schema check failed." };
    }
    return { ok: true, document: fresh(parsed.data, `${parsed.data.name} (imported)`) };
  }
  // Plain DSL text.
  const r = parseStatements(text);
  if (r.errors.length > 0) {
    const first = r.errors.slice(0, 3).map((e) => `line ${e.line}: ${e.message}`).join(" ");
    return { ok: false, error: `DSL errors - ${first}` };
  }
  if (r.participants.length === 0 && r.nodes.length === 0) {
    return { ok: false, error: "No statements found." };
  }
  const base = filename.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]+/g, " ").trim() || "Imported sequence";
  const doc = { ...newSequence(base), participants: r.participants, nodes: r.nodes };
  return { ok: true, document: fresh(doc, doc.name) };
}
