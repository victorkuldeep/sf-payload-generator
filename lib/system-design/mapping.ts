"use client";

/**
 * Declarative step-to-step mapping (Phase 4): a target body template with
 * {{dotted.path}} references resolved against the source step's response
 * JSON, plus a pass-through mode that forwards the source body untouched.
 * Pure string work - no code execution, no dependencies. A reference that
 * resolves to nothing becomes null (mapping failure), which the runner
 * reports distinctly from HTTP failures.
 */

export type MappingMode = "passthrough" | "template";

/** Resolve a dotted path (array indices supported) against JSON data. */
export function resolvePath(data: unknown, path: string): unknown {
  const parts = path
    .split(".")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  let cur: unknown = data;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    const idx = /^\d+$/.test(part) ? Number(part) : null;
    if (Array.isArray(cur)) {
      if (idx === null || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export interface TemplateResult {
  text: string;
  missing: string[];
}

/** Render {{path}} refs. Missing refs become null and are reported. */
export function renderTemplate(template: string, data: unknown): TemplateResult {
  const missing: string[] = [];
  const text = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, raw: string) => {
    const value = resolvePath(data, raw);
    if (value === undefined) {
      if (!missing.includes(raw.trim())) missing.push(raw.trim());
      return "null";
    }
    return JSON.stringify(value) ?? "null";
  });
  return { text, missing };
}

export interface MappingCompile {
  ok: boolean;
  body: string;
  missing: string[];
  error: string | null;
}

/** Build the step-2 body. Validates the result parses as JSON. */
export function compileMapping(
  mode: MappingMode,
  template: string,
  sourceBody: string
): MappingCompile {
  if (mode === "passthrough") {
    const trimmed = sourceBody.trim();
    if (!trimmed) return { ok: false, body: "", missing: [], error: "Source response is empty - nothing to forward." };
    try {
      JSON.parse(trimmed);
    } catch {
      return { ok: false, body: "", missing: [], error: "Source response is not JSON - switch to template mode or pick a JSON step." };
    }
    return { ok: true, body: trimmed, missing: [], error: null };
  }
  let source: unknown = null;
  try {
    source = sourceBody.trim() ? JSON.parse(sourceBody) : null;
  } catch {
    return { ok: false, body: "", missing: [], error: "Source response is not JSON - template references cannot resolve." };
  }
  const { text, missing } = renderTemplate(template, source);
  try {
    JSON.parse(text);
  } catch {
    return { ok: false, body: text, missing, error: "Rendered template is not valid JSON - check quotes around {{refs}}." };
  }
  return { ok: true, body: text, missing, error: null };
}
