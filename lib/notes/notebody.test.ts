import { describe, expect, it } from "vitest";
import {
  appendNoteLine,
  commitNoteBody,
  emptyNoteBody,
  htmlToMd,
  mdToHtml,
  noteBodyEmpty,
  noteBodyFromHtml,
  noteBodyFromMd,
} from "./notebody";

const MD_SAMPLE = [
  "## Goal",
  "",
  "Ship **Friday** with *care*, ~~never~~ `code` and ==focus==.",
  "",
  "- [ ] acceptance one",
  "- [x] acceptance two",
  "- plain bullet",
  "",
  "1. first",
  "2. second",
  "",
  "> quoted wisdom",
  "",
  "```",
  "const a = 1;",
  "```",
].join("\n");

describe("note body converters", () => {
  it("maps the shared markdown subset to sanitized html", () => {
    const html = mdToHtml(MD_SAMPLE);
    expect(html).toContain("<h2>Goal</h2>");
    expect(html).toContain("<strong>Friday</strong>");
    expect(html).toContain("<em>care</em>");
    expect(html).toContain("<s>never</s>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<mark>focus</mark>");
    expect(html).toContain("<li>☐ acceptance one</li>");
    expect(html).toContain("<li>☑ acceptance two</li>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>quoted wisdom</blockquote>");
    expect(html).toContain("<pre>const a = 1;</pre>");
    expect(html).not.toContain("<script");
  });

  it("escapes hostile input and folds soft wraps", () => {
    expect(mdToHtml("<img src=x onerror=y>")).toContain("&lt;img");
    expect(mdToHtml("line one\nline two")).toBe("<p>line one<br>line two</p>");
  });

  it("reads editor html back to markdown, tasks and marks included", () => {
    const md = htmlToMd(
      "<h2>Goal</h2><p>Ship <strong>Friday</strong> <em>fast</em> <s>slow</s> <code>x</code> <mark>now</mark>.</p>" +
        "<ul><li>☐ open task</li><li>☑ done task</li><li>plain</li></ul>" +
        '<ol><li>one</li><li>two</li></ol><blockquote>wise</blockquote><pre>code()</pre>' +
        '<p><a href="https://x.test">link</a> and <strong>bold <em>both</em></strong></p>',
    );
    expect(md).toContain("## Goal");
    expect(md).toContain("**Friday**");
    expect(md).toContain("*fast*");
    expect(md).toContain("~~slow~~");
    expect(md).toContain("`x`");
    expect(md).toContain("==now==");
    expect(md).toContain("- [ ] open task");
    expect(md).toContain("- [x] done task");
    expect(md).toContain("1. one");
    expect(md).toContain("2. two");
    expect(md).toContain("> wise");
    expect(md).toContain("```\ncode()\n```");
    expect(md).toContain("[link](https://x.test)");
    expect(md).toContain("**bold *both***");
  });

  it("round-trips without losing words or structure", () => {
    const md = htmlToMd(mdToHtml(MD_SAMPLE));
    for (const needle of [
      "## Goal",
      "**Friday**",
      "*care*",
      "~~never~~",
      "`code`",
      "==focus==",
      "- [ ] acceptance one",
      "- [x] acceptance two",
      "1. first",
      "> quoted wisdom",
      "```",
    ]) {
      expect(md).toContain(needle);
    }
    // Rich-authored html survives md and back with the same words.
    const rich = "<h2>T</h2><p>Hello <strong>bold</strong> world.</p><ul><li>☐ todo</li></ul>";
    const back = mdToHtml(htmlToMd(rich));
    expect(back).toContain("<h2>T</h2>");
    expect(back).toContain("<strong>bold</strong>");
    expect(back).toContain("☐ todo");
  });
});

describe("note body commits", () => {
  it("migrates legacy markdown on first touch", () => {
    const b = noteBodyFromMd("## Hi\n\n- [ ] do");
    expect(b.format).toBe("md");
    expect(b.md).toBe("## Hi\n\n- [ ] do");
    expect(b.html).toContain("<h2>Hi</h2>");
    expect(noteBodyEmpty(noteBodyFromMd("  \n "))).toBe(true);
    expect(noteBodyEmpty(emptyNoteBody())).toBe(true);
  });

  it("sanitizes rich commits and keeps the markdown fresh", () => {
    const b = noteBodyFromHtml('<p onclick="x()">Hi <strong>there</strong></p><script>1</script>');
    expect(b.format).toBe("rich");
    expect(b.html).toBe("<p>Hi <strong>there</strong></p>");
    expect(b.md).toBe("Hi **there**");
  });

  it("keeps a pure format switch lossless (colors survive a peek)", () => {
    const rich = noteBodyFromHtml('<p>Ship <mark data-color="#C6F6C6">Friday</mark></p>');
    const asMd = commitNoteBody(rich, "md", htmlToMd(rich.html));
    expect(asMd.format).toBe("md");
    expect(asMd.md).toBe("Ship ==Friday==");
    // Untouched side preserved verbatim - the green mark is still there.
    expect(asMd.html).toBe(rich.html);
    const back = commitNoteBody(asMd, "rich", asMd.html);
    expect(back.html).toContain('data-color="#C6F6C6"');
  });

  it("regenerates the idle side once the author edits", () => {
    const rich = noteBodyFromHtml("<p>Ship <mark>Friday</mark></p>");
    const edited = commitNoteBody(rich, "md", "Ship Saturday");
    expect(edited).toEqual({ format: "md", md: "Ship Saturday", html: "<p>Ship Saturday</p>" });
  });

  it("caps both sides", () => {
    const big = "x".repeat(20000);
    expect(noteBodyFromMd(big).md).toHaveLength(12000);
    expect(noteBodyFromHtml(`<p>${big}</p>`).md.length).toBeLessThanOrEqual(12000);
  });

  it("appends lines to both sides without regenerating rich html", () => {
    const prev = noteBodyFromHtml('<p><mark data-color="#F9C9D4">Plan</mark></p>');
    const next = appendNoteLine(prev, "[Console] TLS verified");
    expect(next.format).toBe("rich");
    expect(next.md).toContain("[Console] TLS verified");
    expect(next.html).toContain('data-color="#F9C9D4"');
    expect(next.html).toContain("<p>[Console] TLS verified</p>");
    const mdOnly = appendNoteLine(noteBodyFromMd("Plan"), "[Console] go");
    expect(mdOnly.html).toContain("[Console] go");
  });
});
