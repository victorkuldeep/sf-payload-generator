import { z } from "zod";
import type { AgentTool } from "./tools";
import { listAttachments } from "@/lib/console/attachments";
import { listConsoleTasks, saveConsoleTask } from "@/lib/console/store";
import type { ConsoleAttachment, ConsoleTask } from "@/lib/console/model";
import {
  attachJiraFile,
  buildJiraIssueInput,
  createJiraIssue,
  fetchCreateMeta,
} from "@/lib/pmo/jira";
import { getPmoConnection, hasPmoCredentials } from "@/lib/pmo/jiraVault";

/**
 * PMO tool pack - JIRA behind the agent loop.
 *
 * Reads (jira_status, jira_projects) run free; jira_push pauses for human
 * Apply like every other mutation. Credentials never touch the model: the
 * tools read the tab's session-only PMO vault (connected once in the Console
 * Deliver panel) and push through the same-origin /api/pmo/jira proxy.
 * Not connected means honest guidance to the Deliver panel - the agent never
 * asks for tokens and never accepts pasted ones.
 */

export interface PmoBackend {
  listTasks: () => Promise<ConsoleTask[]>;
  saveTask: (t: ConsoleTask) => Promise<unknown>;
  listShots: (taskId: string) => Promise<ConsoleAttachment[]>;
}

let backend: PmoBackend = { listTasks: listConsoleTasks, saveTask: saveConsoleTask, listShots: listAttachments };

/** Tests inject an in-memory backend; the app uses IDB + the session vault. */
export function setPmoBackend(b: PmoBackend | null): void {
  backend = b ?? { listTasks: listConsoleTasks, saveTask: saveConsoleTask, listShots: listAttachments };
}

const NOT_CONNECTED =
  "JIRA is not connected in this tab. Tell the user: open any Console task → Deliver → connect with email + API token (session-only), then ask again. Never ask for tokens or accept pasted ones.";

async function findTask(ref: string): Promise<{ task: ConsoleTask } | { candidates: string[] } | null> {
  const tasks = await backend.listTasks();
  const exact = tasks.find((t) => t.id === ref);
  if (exact) return { task: exact };
  const q = ref.trim().toLowerCase();
  const hits = tasks.filter((t) => t.title.toLowerCase().includes(q));
  if (hits.length === 1) return { task: hits[0] };
  if (hits.length > 1) return { candidates: hits.slice(0, 8).map((t) => t.title) };
  return null;
}

const jiraStatus: AgentTool = {
  name: "jira_status",
  description: "JIRA connection state: whether push is available, site, and saved project/type defaults.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  needsApproval: false,
  label: () => "Check JIRA status",
  schema: z.object({}),
  execute: async () => {
    const c = getPmoConnection();
    if (!hasPmoCredentials(c)) return { ok: true, result: { connected: false, hint: NOT_CONNECTED } };
    return {
      ok: true,
      result: {
        connected: true,
        site: c.site,
        email: c.email,
        ...(c.projectKey ? { defaultProject: c.projectKey } : {}),
        ...(c.issueTypeId ? { defaultIssueType: c.issueTypeId } : {}),
      },
    };
  },
};

const jiraProjects: AgentTool = {
  name: "jira_projects",
  description: "Live JIRA projects and their creatable issue types - call before jira_push when the destination is unknown.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  needsApproval: false,
  label: () => "List JIRA projects",
  schema: z.object({}),
  execute: async () => {
    const c = getPmoConnection();
    if (!hasPmoCredentials(c)) return { ok: false, error: NOT_CONNECTED };
    try {
      const projects = await fetchCreateMeta({ site: c.site, email: c.email, token: c.token });
      return {
        ok: true,
        result: {
          projects: projects.map((p) => ({ key: p.key, name: p.name, issueTypes: p.issueTypes.map((t) => t.name) })),
        },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not reach JIRA." };
    }
  },
};

const pushArgs = z.object({
  task: z.string().min(1).describe("Console task id or title fragment"),
  projectKey: z.string().min(1).max(32).optional().describe("JIRA project key - defaults to the saved one"),
  issueTypeId: z.string().min(1).max(64).optional().describe("Issue type id - defaults to the saved one"),
});

const jiraPush: AgentTool = {
  name: "jira_push",
  description:
    "Push a Console task to JIRA as an issue (saved markdown description, screenshots as attachments). Resolves project/type from args or saved defaults, validates against live createmeta, stores the issue key back on the task. Push-only - never syncs status back.",
  parameters: {
    type: "object",
    properties: { task: { type: "string" }, projectKey: { type: "string" }, issueTypeId: { type: "string" } },
    required: ["task"],
    additionalProperties: false,
  },
  needsApproval: true,
  label: (a) => `Push "${((a as { task?: string }).task ?? "").slice(0, 50)}" to JIRA`,
  schema: pushArgs,
  execute: async (raw) => {
    const args = raw as z.infer<typeof pushArgs>;
    const c = getPmoConnection();
    if (!hasPmoCredentials(c)) return { ok: false, error: NOT_CONNECTED };
    const found = await findTask(args.task);
    if (!found) return { ok: false, error: `No task matches "${args.task}". See console_describe.` };
    if ("candidates" in found) return { ok: false, error: `Ambiguous - did you mean: ${found.candidates.join(" | ")}?` };
    const projectKey = args.projectKey?.trim() || c.projectKey;
    const issueTypeId = args.issueTypeId?.trim() || c.issueTypeId;
    if (!projectKey || !issueTypeId) {
      return { ok: false, error: "No destination: call jira_projects, pick a project + issue type, and pass them." };
    }
    const creds = { site: c.site, email: c.email, token: c.token };
    let projects;
    try {
      projects = await fetchCreateMeta(creds);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not reach JIRA." };
    }
    const project = projects.find((p) => p.key === projectKey);
    const issueType = project?.issueTypes.find((t) => t.id === issueTypeId);
    if (!project || !issueType) {
      const valid = projects.map((p) => `${p.key} (${p.issueTypes.map((t) => t.name).join("/")})`).join(", ");
      return { ok: false, error: `Unknown destination ${projectKey}/${issueTypeId}. Valid: ${valid}.` };
    }
    let ref;
    try {
      ref = await createJiraIssue(creds, buildJiraIssueInput(found.task, project.key, issueType.id));
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Push failed." };
    }
    let attached = 0;
    try {
      const shots = await backend.listShots(found.task.id);
      for (const s of shots) {
        try {
          const blob = await (await fetch(s.dataUrl)).blob();
          await attachJiraFile(creds, ref.key, blob, s.name);
          attached++;
        } catch {
          /* best effort - the issue itself is already created */
        }
      }
    } catch {
      /* shots are optional */
    }
    const at = Date.now();
    await backend.saveTask({
      ...found.task,
      pmo: { system: "jira", key: ref.key, url: ref.url, at },
      history: [...found.task.history, { at, what: `Pushed to JIRA as ${ref.key} via agent.` }].slice(-500),
    });
    return {
      ok: true,
      result: `Created ${ref.key} (${issueType.name} in ${project.name})${attached > 0 ? ` with ${attached} screenshot${attached === 1 ? "" : "s"}` : ""}. Open: ${ref.url}`,
    };
  },
};

export const PMO_TOOLS: AgentTool[] = [jiraStatus, jiraProjects, jiraPush];
