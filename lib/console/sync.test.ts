import { describe, expect, it } from "vitest";
import { newProject, type SystemProject } from "@/lib/system-design/model";
import { canvasToConsole, consoleToCanvas, pullSystem, pushTodoNote, pushTodoStatus, type SystemStoreFns } from "./sync";

function seedStore(): { fns: SystemStoreFns; projects: Map<string, SystemProject> } {
  const projects = new Map<string, SystemProject>();
  const base = newProject("Hub rollout");
  projects.set("p1", {
    ...base,
    id: "p1",
    updatedAt: 100,
    notes: "Ship the 688 path first.",
    todos: [
      { id: "t1", title: "Mock the hub", status: "open", createdAt: 1, updatedAt: 50 },
      { id: "t2", title: "Replay scenario", status: "done", createdAt: 1, updatedAt: 90 },
    ],
  });
  return {
    projects,
    fns: {
      list: async () => [{ id: "p1", name: "Hub rollout", updatedAt: projects.get("p1")!.updatedAt }],
      load: async (id) => projects.get(id) ?? null,
      save: async (p) => {
        projects.set(p.id, p);
      },
    },
  };
}

describe("console sync", () => {
  it("maps one lifecycle both ways - only the terminal differs", () => {
    expect(canvasToConsole("done")).toBe("resolved");
    expect(canvasToConsole("in-progress")).toBe("in-progress");
    expect(canvasToConsole("blocked")).toBe("blocked");
    expect(canvasToConsole("awaiting-feedback")).toBe("awaiting-feedback");
    expect(consoleToCanvas("resolved")).toBe("done");
    expect(consoleToCanvas("open")).toBe("open");
    expect(consoleToCanvas("in-progress")).toBe("in-progress");
    expect(consoleToCanvas("blocked")).toBe("blocked");
    expect(consoleToCanvas("awaiting-feedback")).toBe("awaiting-feedback");
  });

  it("pulls TODOs and notes as link views", async () => {
    const { fns } = seedStore();
    const views = await pullSystem(fns);
    expect(views).toHaveLength(3);
    const todo = views.find((v) => v.todoId === "t1")!;
    expect(todo).toMatchObject({ recordName: "Hub rollout", title: "Mock the hub", status: "open" });
    const note = views.find((v) => !v.todoId)!;
    expect(note.excerpt).toContain("688 path");
  });

  it("pushes status and refuses stale writes", async () => {
    const { fns, projects } = seedStore();
    expect((await pushTodoStatus(fns, "p1", "t1", "in-progress", 50, 200)).ok).toBe(true);
    expect(projects.get("p1")!.todos[0].status).toBe("in-progress");
    // Canvas moved on past our snapshot - refuse instead of clobbering.
    const stale = await pushTodoStatus(fns, "p1", "t1", "done", 50, 300);
    expect(stale).toMatchObject({ ok: false, stale: true });
    expect(projects.get("p1")!.todos[0].status).toBe("in-progress");
  });

  it("appends notes to the canvas body and reports gone records", async () => {
    const { fns, projects } = seedStore();
    expect((await pushTodoNote(fns, "p1", "t1", "TLS verified", 50, 200)).ok).toBe(true);
    expect(projects.get("p1")!.todos[0].body).toContain("[Console");
    expect(projects.get("p1")!.todos[0].body).toContain("TLS verified");
    expect(await pushTodoStatus(fns, "nope", "t1", "done", 0)).toMatchObject({ ok: false });
    expect(await pushTodoStatus(fns, "p1", "gone", "done", 0)).toMatchObject({ ok: false });
  });

  it("dual-syncs pushed notes and preserves rich highlights", async () => {
    const { fns, projects } = seedStore();
    projects.get("p1")!.todos[0] = {
      ...projects.get("p1")!.todos[0],
      body: "Plan",
      bodyFormat: "rich",
      bodyHtml: '<p><mark data-color="#C6F6C6">Plan</mark></p>',
    };
    expect((await pushTodoNote(fns, "p1", "t1", "TLS verified", 50, 200)).ok).toBe(true);
    const t = projects.get("p1")!.todos[0];
    expect(t.body).toContain("TLS verified");
    expect(t.bodyFormat).toBe("rich");
    expect(t.bodyHtml).toContain('data-color="#C6F6C6"');
    expect(t.bodyHtml).toContain("TLS verified");
  });
});
