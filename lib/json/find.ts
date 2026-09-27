/**
 * Deterministic find enumeration for the JSON editor (pure, tested).
 * Tree mode walks values (layout-independent, so collapsed nodes match);
 * text mode scans offsets. Navigation (expand/scroll/select) lives in
 * the editor wrapper; matching logic lives here.
 */

export interface FindMatch {
  /** Tree path, or [] for text mode. */
  path: (string | number)[];
  /** Text offset (text mode only). */
  offset: number;
  length: number;
  /** True when the match is an object key rather than a value. */
  key: boolean;
  preview: string;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function enumerateTreeMatches(
  value: unknown,
  query: string,
  matchCase: boolean
): FindMatch[] {
  const out: FindMatch[] = [];
  if (query === "") return out;
  const q = matchCase ? query : query.toLowerCase();
  const hit = (text: string) => (matchCase ? text : text.toLowerCase()).includes(q);
  const walk = (v: unknown, path: (string | number)[]) => {
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, [...path, i]));
      return;
    }
    if (v !== null && typeof v === "object") {
      for (const [k, item] of Object.entries(v)) {
        if (hit(k)) out.push({ path: [...path, k], offset: 0, length: 0, key: true, preview: k });
        walk(item, [...path, k]);
      }
      return;
    }
    const text = String(v ?? "");
    if (hit(text)) {
      out.push({
        path,
        offset: 0,
        length: 0,
        key: false,
        preview: text.length > 60 ? `${text.slice(0, 60)}…` : text,
      });
    }
  };
  walk(value, []);
  return out;
}

const MAX_TEXT_MATCHES = 20000;

export function enumerateTextMatches(
  text: string,
  query: string,
  matchCase: boolean
): FindMatch[] {
  const out: FindMatch[] = [];
  if (query === "" || text === "") return out;
  const re = new RegExp(escapeRegExp(query), matchCase ? "g" : "gi");
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(text)) !== null && guard < MAX_TEXT_MATCHES) {
    guard++;
    out.push({ path: [], offset: m.index, length: m[0].length, key: false, preview: m[0] });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}
