import { z } from "zod";
import { newDecision, nextDecisionNumber } from "@/lib/decisions/model";
import { importDecisions } from "@/lib/decisions/store";
import type { Decision } from "@/lib/decisions/model";
import { newRequirement, nextRequirementNumber } from "@/lib/requirements/model";
import { importRequirements } from "@/lib/requirements/store";
import type { Requirement } from "@/lib/requirements/model";
import { newConsoleTask } from "@/lib/console/model";
import { importConsoleTasks } from "@/lib/console/store";
import type { ConsoleTask } from "@/lib/console/model";
import type { InboxItemKind } from "@/lib/inbox/types";
import { claimFile, listKind, writeJson } from "../workspace";
import type { McpTool } from "./types";

function decisionsIn(data: unknown): Decision[] {
  if (data && typeof data === "object" && "decisions" in data) {
    const arr = (data as { decisions: unknown }).decisions;
    return Array.isArray(arr) ? (arr as Decision[]) : [];
  }
  return [];
}

function requirementsIn(data: unknown): Requirement[] {
  if (data && typeof data === "object" && "requirements" in data) {
    const arr = (data as { requirements: unknown }).requirements;
    return Array.isArray(arr) ? (arr as Requirement[]) : [];
  }
  return [];
}

function tasksIn(data: unknown): ConsoleTask[] {
  if (data && typeof data === "object" && "tasks" in data) {
    const arr = (data as { tasks: unknown }).tasks;
    return Array.isArray(arr) ? (arr as ConsoleTask[]) : [];
  }
  return [];
}

function decisionPackage(d: Decision) {
  return {
    version: 1,
    type: "gravenx-decisions-package",
    exportedAt: new Date().toISOString(),
    decisions: [d],
  };
}

function requirementPackage(r: Requirement) {
  return {
    version: 1,
    type: "gravenx-requirements-package",
    exportedAt: new Date().toISOString(),
    requirements: [r],
  };
}

function consolePackage(t: ConsoleTask) {
  return {
    version: 2,
    type: "gravenx-console-package",
    exportedAt: new Date().toISOString(),
    tasks: [t],
    attachments: [],
  };
}

export const governanceTools: McpTool[] = [
  {
    name: "decision_create",
    description:
      "Record an Architecture Decision (ADR) as a studio package file. Auto-numbers (ADR-001...). The Decisions Import button opens the file directly.",
    shape: {
      title: z.string().min(1).max(160),
      context: z.string().max(8000).optional(),
      decision: z.string().max(20000).optional(),
      consequences: z.string().max(8000).optional(),
      overwrite: z.boolean().optional(),
    },
    run: async (dir, args) => {
      const taken = listKind(dir, "decision").flatMap(({ data }) => decisionsIn(data));
      const number = nextDecisionNumber(taken);
      const d: Decision = {
        ...newDecision(args.title as string, number),
        ...(args.context ? { context: args.context as string } : {}),
        ...(args.decision ? { decision: args.decision as string } : {}),
        ...(args.consequences ? { consequences: args.consequences as string } : {}),
      };
      const check = importDecisions(JSON.stringify(decisionPackage(d)), taken);
      if (check.error || check.decisions.length === 0) {
        return {
          ok: false,
          summary: "Decision failed validation.",
          error: check.error ?? "Studio importer rejected the record.",
        };
      }
      const file = claimFile(dir, "decision", `${number} ${d.title}`, args.overwrite as boolean | undefined);
      writeJson(file, decisionPackage(d));
      return {
        ok: true,
        file,
        summary: `Decision ${number} saved - open it in Decisions via Import.`,
        data: { id: d.id, number, title: d.title },
      };
    },
  },
  {
    name: "decision_list",
    description: "List stored decisions (number, title, status).",
    shape: {},
    run: async (dir) => {
      const items = listKind(dir, "decision").flatMap(({ file, data }) =>
        decisionsIn(data).map((d) => ({
          file: file.split(/[\\/]/).pop(),
          number: d.number,
          title: d.title,
          status: d.status,
        })),
      );
      return { ok: true, summary: `${items.length} decision(s).`, data: { items } };
    },
  },
  {
    name: "requirement_create",
    description:
      "Record a requirement (REQ) as a studio package file. Auto-numbers (REQ-001...). The Requirements Import button opens the file directly.",
    shape: {
      title: z.string().min(1).max(160),
      body: z.string().max(20000).optional(),
      overwrite: z.boolean().optional(),
    },
    run: async (dir, args) => {
      const taken = listKind(dir, "requirement").flatMap(({ data }) => requirementsIn(data));
      const number = nextRequirementNumber(taken);
      const r: Requirement = {
        ...newRequirement(args.title as string, number),
        ...(args.body ? { body: args.body as string } : {}),
      };
      const check = importRequirements(JSON.stringify(requirementPackage(r)), taken);
      if (check.error || check.requirements.length === 0) {
        return {
          ok: false,
          summary: "Requirement failed validation.",
          error: check.error ?? "Studio importer rejected the record.",
        };
      }
      const file = claimFile(dir, "requirement", `${number} ${r.title}`, args.overwrite as boolean | undefined);
      writeJson(file, requirementPackage(r));
      return {
        ok: true,
        file,
        summary: `Requirement ${number} saved - open it in Requirements via Import.`,
        data: { id: r.id, number, title: r.title },
      };
    },
  },
  {
    name: "requirement_list",
    description: "List stored requirements (number, title, status).",
    shape: {},
    run: async (dir) => {
      const items = listKind(dir, "requirement").flatMap(({ file, data }) =>
        requirementsIn(data).map((r) => ({
          file: file.split(/[\\/]/).pop(),
          number: r.number,
          title: r.title,
          status: r.status,
        })),
      );
      return { ok: true, summary: `${items.length} requirement(s).`, data: { items } };
    },
  },
  {
    name: "console_create_task",
    description:
      "Log a Console task/note/question/decision as a studio package file. Surfaces in Console via Import, then syncs to canvases from there.",
    shape: {
      title: z.string().min(1).max(160),
      kind: z.enum(["note", "task", "question", "decision"]).optional(),
      status: z.enum(["open", "in-progress", "blocked", "awaiting-feedback", "resolved"]).optional(),
      priority: z.enum(["low", "normal", "high", "critical"]).optional(),
      owner: z.string().max(120).optional(),
      body: z.string().max(20000).optional(),
      overwrite: z.boolean().optional(),
    },
    run: async (dir, args) => {
      const t: ConsoleTask = {
        ...newConsoleTask(args.title as string),
        ...(args.kind ? { kind: args.kind as InboxItemKind } : {}),
        ...(args.status ? { status: args.status as ConsoleTask["status"] } : {}),
        ...(args.priority ? { priority: args.priority as ConsoleTask["priority"] } : {}),
        ...(args.owner ? { owner: args.owner as string } : {}),
        ...(args.body ? { body: args.body as string } : {}),
      };
      const check = importConsoleTasks(JSON.stringify(consolePackage(t)));
      if (check.error || check.tasks.length === 0) {
        return {
          ok: false,
          summary: "Task failed validation.",
          error: check.error ?? "Studio importer rejected the record.",
        };
      }
      const file = claimFile(dir, "console", t.title, args.overwrite as boolean | undefined);
      writeJson(file, consolePackage(t));
      return {
        ok: true,
        file,
        summary: `Task "${t.title}" saved - open it in Console via Import.`,
        data: { id: t.id, title: t.title },
      };
    },
  },
  {
    name: "console_list_tasks",
    description: "List stored console tasks (title, kind, status).",
    shape: {},
    run: async (dir) => {
      const items = listKind(dir, "console").flatMap(({ file, data }) =>
        tasksIn(data).map((t) => ({
          file: file.split(/[\\/]/).pop(),
          title: t.title,
          kind: t.kind ?? "task",
          status: t.status,
        })),
      );
      return { ok: true, summary: `${items.length} task(s).`, data: { items } };
    },
  },
  {
    name: "workspace_files",
    description: "List every file in the GRAVENX workspace with its envelope type (what the studio can import).",
    shape: {},
    run: async (dir) => {
      const kinds = ["sequence", "experience", "system", "erd", "decision", "requirement", "console"];
      const items = kinds.flatMap((kind) =>
        listKind(dir, kind).map(({ file }) => ({
          file: file.split(/[\\/]/).pop(),
          kind,
        })),
      );
      return { ok: true, summary: `${items.length} file(s) in workspace.`, data: { dir, items } };
    },
  },
];
