/**
 * ADR rich text: the Decision field stores HTML (never markdown), edited in
 * a built-in contentEditable toolbar. These pure helpers bridge the two
 * worlds - legacy plain text becomes paragraphs on load, and exports/AI
 * read back tag-free text. DOM-free so tests run in Node.
 */

const ALLOWED = new Set([
  "p", "h2", "h3", "strong", "b", "em", "i", "u", "s", "strike",
  "ul", "ol", "li", "blockquote", "code", "pre", "br", "a", "mark",
]);

/** Fixed highlight palette: the only data-color values the sanitizer keeps. */
export const HIGHLIGHT_COLORS = ["#FFEB9C", "#C6F6C6", "#F9C9D4", "#C4E3FC"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
const HIGHLIGHT_SET = new Set<string>(HIGHLIGHT_COLORS);

/** Pasted containers: unwrap (keep the words, drop the wrapper). */
const UNWRAP = new Set([
  "div", "span", "font", "section", "article", "header", "footer", "main",
  "aside", "nav", "figure", "figcaption", "table", "thead", "tbody", "tr",
  "td", "th", "h1", "h4", "h5", "h6", "hr", "small", "big", "center",
]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const MARKUP_TAG = /<\/?(p|h2|h3|strong|b|em|i|u|s|strike|ul|ol|li|blockquote|code|pre|br|a|mark|div|span|table)(\s[^<>]*)?\s*\/?>/i;

/** True when the stored value already carries markup (a lone <T> is text). */
export function isHtml(value: string): boolean {
  return MARKUP_TAG.test(value);
}

/** Legacy plain text (or AI-proposed text) → safe paragraph HTML. */
export function textToHtml(text: string): string {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return blocks.map((b) => `<p>${escapeHtml(b).replace(/\n/g, "<br>")}</p>`).join("");
}

/** Strip tags for packs, AI and anywhere else that reads plain words. */
export function htmlToText(html: string): string {
  if (!isHtml(html)) return html.trim();
  return (
    html
      // Block boundaries become newlines before tags fall away.
      .replace(/<\/(p|h2|h3|li|blockquote|pre|ul|ol)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Allowlist sanitizer for editor HTML: keeps structure + inline marks,
 * drops scripts, styles, event handlers and dangerous links. Tag soup
 * (unclosed tags from hand edits) degrades to escaped text, never breaks.
 */
export function sanitizeDecisionHtml(html: string): string {
  if (!html.trim()) return "";
  if (!isHtml(html)) return textToHtml(html);
  // Remove script/style elements wholesale, with or without closers.
  let out = html.replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, "");
  out = out.replace(/<\/?(html|head|body)[^>]*>/gi, "");
  out = out.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?\s*(\/?)>/g, (m, close: string, tagRaw: string, attrs: string | undefined, self: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED.has(tag)) return UNWRAP.has(tag) ? (tag === "hr" ? "<br>" : "") : escapeHtml(m);
    if (close) return `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs ?? "")?.[2] ?? "";
      const safe = /^(https?:\/\/|mailto:|\/|#)/i.test(href.trim()) ? escapeHtml(href.trim()) : "";
      return safe ? `<a href="${safe}">` : "<a>";
    }
    if (tag === "mark") {
      const raw = /data-color\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs ?? "")?.[2] ?? "";
      const color = raw.trim().toUpperCase();
      return HIGHLIGHT_SET.has(color) ? `<mark data-color="${color}">` : "<mark>";
    }
    void self;
    return `<${tag}>`;
  });
  // Neutralize anything that still looks executable.
  out = out.replace(/javascript:/gi, "");
  return out.trim();
}
