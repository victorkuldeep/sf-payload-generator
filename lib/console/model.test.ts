import { describe, expect, it } from "vitest";
import { addNote, canTransition, consoleTaskKey, consoleTaskSchema, moveTask, newConsoleTask, nextStatuses } from "./model";

describe("console model", () => {
  it("creates open tasks with creation history", () => {
    const t = newConsoleTask("ERD the Order object", 1000);
    expect(t.status).toBe("open");
    expect(t.priority).toBe("normal");
    expect(t.history).toEqual([{ at: 1000, what: "Logged in Console." }]);
    expect(consoleTaskSchema.safeParse(t).success).toBe(true);
  });

  it("walks the lifecycle and rejects jumps", () => {
    expect(canTransition("open", "in-progress")).toBe(true);
    expect(canTransition("open", "blocked")).toBe(true);
    expect(canTransition("in-progress", "awaiting-feedback")).toBe(true);
    expect(canTransition("awaiting-feedback", "in-progress")).toBe(true);
    expect(canTransition("blocked", "resolved")).toBe(false);
    expect(canTransition("resolved", "open")).toBe(true);
    expect(canTransition("resolved", "in-progress")).toBe(false);
    const moved = moveTask(newConsoleTask("X", 1), "resolved", 2);
    expect(moved.status).toBe("resolved");
    expect(moved.history).toHaveLength(2);
    const stuck = moveTask(moved, "in-progress", 3);
    expect(stuck.status).toBe("resolved");
  });

  it("offers reachable statuses and stable queue keys", () => {
    expect(nextStatuses("in-progress")).toEqual(["open", "blocked", "awaiting-feedback", "resolved"]);
    expect(nextStatuses("resolved")).toEqual(["open"]);
    const a = newConsoleTask("Alpha", 1000);
    const b = newConsoleTask("Beta", 1000);
    expect(consoleTaskKey(a)).toMatch(/^CX-/);
    expect(consoleTaskKey(a)).toBe(consoleTaskKey(b));
  });

  it("adds notes with history and trims empties", () => {
    const t = addNote(newConsoleTask("X", 1), "  check TLS  ", 2);
    expect(t.notes).toHaveLength(1);
    expect(t.notes[0].text).toBe("check TLS");
    expect(addNote(t, "   ", 3).notes).toHaveLength(1);
  });

  it("rejects bad payloads", () => {
    const t = newConsoleTask("X", 1);
    expect(consoleTaskSchema.safeParse({ ...t, status: "archived" }).success).toBe(false);
    expect(consoleTaskSchema.safeParse({ ...t, links: [{ surface: "figma", recordId: "1", label: "x" }] }).success).toBe(false);
  });
});
