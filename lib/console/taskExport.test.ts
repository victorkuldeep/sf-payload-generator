import { describe, expect, it } from "vitest";
import { buildTaskWorkbook } from "./taskExport";
import { consoleTaskKey, newConsoleTask } from "./model";

describe("task export", () => {
  it("lists tasks with keys, labels, and attachment counts", () => {
    const t = newConsoleTask("Prove the timeout", 1);
    t.priority = "high";
    t.dueDate = "2026-02-01";
    t.body = "Run the scenario.";
    t.links = [{ surface: "system", recordId: "p1", label: "Middleware" }];
    t.notes = [{ id: "n1", at: 2, text: "Waiting on VPN." }];
    const wb = buildTaskWorkbook([t], { [t.id]: 2 });
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Tasks"]);
    const tasks = wb.getWorksheet("Tasks")!;
    const row = tasks.getRow(2).values as unknown[];
    expect(row[1]).toBe(consoleTaskKey(t));
    expect(row.slice(2, 6)).toEqual(["Prove the timeout", "Open", "high", "2026-02-01"]);
    expect(row[6]).toBe("Run the scenario.");
    expect(row[7]).toBe("system: Middleware");
    expect(row[9]).toBe("2 files");
  });
});
