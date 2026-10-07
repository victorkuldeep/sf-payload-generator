import { describe, expect, it } from "vitest";
import {
  buildJiraIssueInput,
  mdInlineToAdf,
  mdToAdf,
  normalizeJiraSite,
  parseCreateMeta,
} from "./jira";

describe("normalizeJiraSite", () => {
  it("accepts bare hosts and full URLs on atlassian.net", () => {
    expect(normalizeJiraSite("acme.atlassian.net")).toEqual({ ok: true, site: "https://acme.atlassian.net" });
    expect(normalizeJiraSite("https://acme.atlassian.net/")).toEqual({ ok: true, site: "https://acme.atlassian.net" });
  });

  it("rejects non-cloud hosts, http and credentialed URLs", () => {
    expect(normalizeJiraSite("https://jira.acme.com").ok).toBe(false);
    expect(normalizeJiraSite("http://acme.atlassian.net").ok).toBe(false);
    expect(normalizeJiraSite("https://user:pass@acme.atlassian.net").ok).toBe(false);
    expect(normalizeJiraSite("").ok).toBe(false);
  });
});

describe("parseCreateMeta", () => {
  it("keeps creatable projects and drops sub-tasks and empties", () => {
    const projects = parseCreateMeta({
      projects: [
        { key: "ZED", name: "Zed", issuetypes: [{ id: "1", name: "Sub-task", subtask: true }] },
        {
          key: "ACME",
          name: "Acme",
          issuetypes: [
            { id: "10001", name: "Story", subtask: false },
            { id: "10002", name: "Bug", subtask: false },
            { id: "10003", name: "Sub-task", subtask: true },
          ],
        },
        { key: "BAD" },
      ],
    });
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ key: "ACME", name: "Acme" });
    expect(projects[0].issueTypes.map((t) => t.name)).toEqual(["Story", "Bug"]);
  });

  it("returns empty on garbage", () => {
    expect(parseCreateMeta(null)).toEqual([]);
    expect(parseCreateMeta({})).toEqual([]);
  });
});

describe("mdToAdf", () => {
  it("maps headings, marks, lists, quotes, code and rules", () => {
    const doc = mdToAdf(
      [
        "## Goal",
        "",
        "Ship **Friday** with *care*, `retry()` and ~~delay~~ - see [docs](https://x.test).",
        "",
        "- one",
        "- two",
        "",
        "1. first",
        "2. second",
        "",
        "> quoted context",
        "",
        "```ts",
        "const a = 1;",
        "```",
        "",
        "---",
        "",
        "order_id stays plain, trailing text.",
      ].join("\n"),
    );
    expect(doc).toMatchObject({ version: 1, type: "doc" });
    const kinds = doc.content.map((b) => b.type);
    expect(kinds).toEqual([
      "heading",
      "paragraph",
      "bulletList",
      "orderedList",
      "blockquote",
      "codeBlock",
      "rule",
      "paragraph",
    ]);
    expect(doc.content[0]).toMatchObject({ attrs: { level: 2 } });
    const para = doc.content[1];
    const texts = (para.content ?? []).map((n) => n.text);
    expect(texts.join("")).toContain("Ship Friday with care");
    expect(para.content?.some((n) => n.marks?.some((m) => m.type === "strong" && n.text === "Friday"))).toBe(true);
    expect(para.content?.some((n) => n.marks?.some((m) => m.type === "link") && n.text === "docs")).toBe(true);
    expect(doc.content[2].content?.[0]).toMatchObject({ type: "listItem" });
    expect(doc.content[5].content?.[0]).toMatchObject({ type: "text", text: "const a = 1;" });
    const tail = (doc.content[7].content ?? []).map((n) => n.text).join("");
    expect(tail).toContain("order_id stays plain");
    expect(doc.content[7].content?.some((n) => (n.marks ?? []).length > 0)).toBe(false);
  });

  it("never emits an empty doc", () => {
    expect(mdToAdf("").content.length).toBeGreaterThan(0);
    expect(mdToAdf("   ").content.length).toBeGreaterThan(0);
  });

  it("leaves inline code unmarked by emphasis", () => {
    const nodes = mdInlineToAdf("`**not bold**`");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ text: "**not bold**", marks: [{ type: "code" }] });
  });
});

describe("buildJiraIssueInput", () => {
  it("builds a traceable create payload", () => {
    const input = buildJiraIssueInput({ id: "t1", title: "Fix it", body: "Do **now**.", kind: "task" }, "ACME", "10001");
    expect(input).toMatchObject({ projectKey: "ACME", issueTypeId: "10001", summary: "Fix it" });
    expect(input.labels).toContain("gravenx-console");
    expect(input.labels).toContain("gravenx-task");
    expect(input.description.type).toBe("doc");
  });
});
