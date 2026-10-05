import { describe, expect, it } from "vitest";
import { inboxBodyToNote, noteToTodoBody, todoBodyToNote } from "./types";
import { noteBodyFromHtml, noteBodyFromMd } from "@/lib/notes/notebody";

describe("inbox note triples", () => {
  it("migrates vintage TODO bodies and round-trips rich ones", () => {
    const migrated = todoBodyToNote({ body: "## Goal\n\n- [ ] ship" });
    expect(migrated.format).toBe("md");
    expect(migrated.html).toContain("<h2>Goal</h2>");
    const rich = noteToTodoBody(noteBodyFromHtml("<p>Hi <strong>there</strong></p>"));
    expect(rich).toMatchObject({ bodyFormat: "rich" });
    expect(rich.bodyHtml).toContain("<strong>there</strong>");
    expect(todoBodyToNote(rich).format).toBe("rich");
    expect(noteToTodoBody(noteBodyFromMd("   "))).toEqual({
      body: undefined,
      bodyFormat: undefined,
      bodyHtml: undefined,
    });
  });

  it("reads inbox item triples with the same rule", () => {
    expect(inboxBodyToNote({ body: "plain" }).format).toBe("md");
    expect(
      inboxBodyToNote({ body: "Hi", bodyFormat: "rich", bodyHtml: "<p>Hi</p>" }).html,
    ).toBe("<p>Hi</p>");
    // A rich flag without html falls back to the markdown side.
    expect(inboxBodyToNote({ body: "plain", bodyFormat: "rich" }).format).toBe("md");
  });
});
