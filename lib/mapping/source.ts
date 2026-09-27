/**
 * Mapping Studio - source JSON parsing + path catalog.
 *
 * Canonical notation: "$.order.orderNumber", "$.orderItem[].sku".
 * Arrays collapse to a single [] element path (first element supplies
 * the example). The canonical path IS the stable id, so reparse
 * reconciles without losing mappings.
 */

import type { JsonType, NodeKind, SourcePath } from "./types";

export interface ParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function parseSourceJson(text: string): ParseResult {
  if (!text.trim()) return { ok: false, error: "Source is empty - paste JSON to begin." };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const pos = /position (\d+)/.exec(msg)?.[1];
    let suffix = "";
    if (pos) {
      const idx = Number(pos);
      const before = text.slice(0, idx);
      suffix = ` (line ${before.split("\n").length}, column ${idx - before.lastIndexOf("\n")})`;
    }
    return { ok: false, error: `Invalid JSON: ${msg}${suffix}` };
  }
}

function jsonTypeOf(value: unknown): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    case "object":
      return "object";
    default:
      return "string";
  }
}

function kindOf(value: unknown): NodeKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "scalar";
}

const SAFE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function segment(key: string): string {
  return SAFE_KEY.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function truncateExample(value: unknown): unknown {
  if (typeof value === "string" && value.length > 120) return `${value.slice(0, 117)}…`;
  if (typeof value === "object" && value !== null) return undefined; // containers carry no scalar preview
  return value;
}

/**
 * Extract every path. Object/array containers are catalog rows too
 * (mappable to record plans); array elements collapse to one [] row.
 */
export function extractPaths(value: unknown): SourcePath[] {
  const out: SourcePath[] = [];

  const visit = (node: unknown, path: string, parent: string | null, key: string, depth: number, inArray: boolean) => {
    const kind = kindOf(node);
    out.push({
      id: path,
      path,
      parent,
      key,
      kind,
      jsonType: jsonTypeOf(node),
      example: kind === "scalar" || kind === "null" ? truncateExample(node) : undefined,
      depth,
      inArray,
      required: "unknown", // sample-only: never infer mandatory from presence
    });

    if (kind === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        visit(v, `${path}${segment(k)}`, path, k, depth + 1, inArray);
      }
    } else if (kind === "array") {
      const arr = node as unknown[];
      if (arr.length > 0) {
        // Single representative element. Record first scalar preview on the [] row.
        const first = arr[0];
        const firstKind = kindOf(first);
        const elemPath = `${path}[]`;
        out.push({
          id: elemPath,
          path: elemPath,
          parent: path,
          key: `${key}[]`,
          kind: firstKind === "object" || firstKind === "array" ? firstKind : "scalar",
          jsonType: jsonTypeOf(first),
          example: firstKind === "scalar" || firstKind === "null" ? truncateExample(first) : undefined,
          depth: depth + 1,
          inArray: true,
          required: "unknown",
        });
        if (firstKind === "object") {
          for (const [k, v] of Object.entries(first as Record<string, unknown>)) {
            visit(v, `${elemPath}${segment(k)}`, elemPath, k, depth + 2, true);
          }
        } else if (firstKind === "array" && (first as unknown[]).length > 0) {
          // Nested array: elemPath already represents the element - expand one level.
          const inner = (first as unknown[])[0];
          if (inner && typeof inner === "object" && !Array.isArray(inner)) {
            for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
              visit(v, `${elemPath}[]${segment(k)}`, elemPath, k, depth + 2, true);
            }
          }
        }
      }
    }
  };

  if (kindOf(value) === "object" || kindOf(value) === "array") {
    // Root row + children. Root id is "$" / "$[]".
    const rootPath = Array.isArray(value) ? "$[]" : "$";
    out.push({
      id: rootPath,
      path: rootPath,
      parent: null,
      key: "$",
      kind: kindOf(value),
      jsonType: jsonTypeOf(value),
      example: undefined,
      depth: 0,
      inArray: false,
      required: "unknown",
    });
    if (!Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        visit(v, `$${segment(k)}`, rootPath, k, 1, false);
      }
    } else {
      // Root array: "$[]" IS the element row - expand its children directly.
      const first = (value as unknown[])[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        for (const [k, v] of Object.entries(first as Record<string, unknown>)) {
          visit(v, `${rootPath}${segment(k)}`, rootPath, k, 1, true);
        }
      }
    }
  } else {
    visit(value, "$", null, "$", 0, false);
  }
  return out;
}

/** Reconcile saved mappings against a fresh catalog: split into live + orphaned. */
export function reconcilePaths(
  mappingSourcePaths: string[],
  catalog: SourcePath[]
): { live: string[]; orphaned: string[] } {
  const ids = new Set(catalog.map((p) => p.id));
  const live: string[] = [];
  const orphaned: string[] = [];
  for (const p of mappingSourcePaths) {
    (ids.has(p) ? live : orphaned).push(p);
  }
  return { live, orphaned };
}
