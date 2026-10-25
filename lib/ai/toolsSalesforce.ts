import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { getCachedConnection } from "@/lib/session/cache";
import { markSessionExpired } from "./gate";
import { looksLikeSosl } from "@/lib/salesforce/sosl";
import { LOG_LEVELS } from "@/lib/salesforce/apex";
import { looksLikeSoql } from "./toolsStudio";
import type { AgentTool } from "./tools";

/**
 * Session-bound Salesforce tools: the tab's live connection, never the
 * model's words. Reads (SOQL/SOSL) auto-execute capped to a first page;
 * apex_run executes arbitrary code as the connected user, so it always
 * pauses for the user's explicit Apply. No session -> honest error, never
 * a token ask: the gate + connect flow own credentials.
 */

const SESSION_KEY = "gravenx_session";

interface LiveSession {
  instanceUrl: string;
  token: string;
  apiVersion: string;
}

/** Live connection from the module cache, else the tab's restore record. */
function liveSession(): LiveSession | { error: string } {
  try {
    const c = getCachedConnection();
    if (c && typeof c.token === "string" && c.token && typeof c.instanceUrl === "string" && c.instanceUrl) {
      return { instanceUrl: c.instanceUrl, token: c.token, apiVersion: c.apiVersion || "v60.0" };
    }
  } catch {
    /* fall through to the restore record */
  }
  try {
    if (typeof sessionStorage !== "undefined") {
      const raw = sessionStorage.getItem(SESSION_KEY);
      const s = raw ? (JSON.parse(raw) as { instanceUrl?: unknown; token?: unknown; apiVersion?: unknown }) : null;
      if (s && typeof s.instanceUrl === "string" && s.instanceUrl && typeof s.token === "string" && s.token) {
        return {
          instanceUrl: s.instanceUrl,
          token: s.token,
          apiVersion: typeof s.apiVersion === "string" && s.apiVersion ? s.apiVersion : "v60.0",
        };
      }
    }
  } catch {
    /* fall through to the error */
  }
  return { error: "No live Salesforce connection - connect on the Studio home first, then ask again." };
}

function isSession(o: LiveSession | { error: string }): o is LiveSession {
  return (o as LiveSession).token !== undefined;
}

/** Salesforce error bodies are a string or a field-errors map. */
function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body) return body;
  if (body && typeof body === "object") {
    const e = (body as { error?: unknown }).error;
    if (typeof e === "string" && e) return e;
    try {
      return JSON.stringify(body).slice(0, 400);
    } catch {
      /* fall through */
    }
  }
  return fallback;
}

/** Drop the per-row attributes envelope - it burns context and adds nothing. */
function stripAttrs(row: unknown): unknown {
  if (Array.isArray(row)) return row.map(stripAttrs);
  if (row && typeof row === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (k === "attributes") continue;
      out[k] = stripAttrs(v);
    }
    return out;
  }
  return row;
}

const MAX_ROWS = 25;

const soqlRunArgs = z.object({
  soql: z.string().min(1).max(10000).describe("Full SOQL statement, e.g. SELECT Id, Name FROM Account LIMIT 10"),
});

const soqlRun: AgentTool = {
  name: "query_soql_run",
  description:
    "Execute a read-only SOQL query on the CONNECTED org and report the first page (totalSize plus up to 25 rows back to the model). Use for data questions; never for writes. Requires a live connection.",
  parameters: {
    type: "object",
    properties: { soql: { type: "string" } },
    required: ["soql"],
    additionalProperties: false,
  },
  needsApproval: false,
  label: () => "Run SOQL",
  schema: soqlRunArgs,
  execute: async (raw) => {
    const args = raw as z.infer<typeof soqlRunArgs>;
    const statement = args.soql.trim();
    if (!looksLikeSoql(statement)) {
      return { ok: false, error: "That does not look like SOQL - it should read SELECT <fields> FROM <Object>." };
    }
    const session = liveSession();
    if (!isSession(session)) return { ok: false, error: session.error };
    let res: Response;
    try {
      res = await apiFetch(
        "/api/salesforce/soql",
        { instanceUrl: session.instanceUrl, token: session.token, apiVersion: session.apiVersion, soql: statement },
        60000
      );
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Query request failed." };
    }
    if (res.status === 401) {
      try {
        markSessionExpired();
      } catch {
        /* gate flag alone still closes AI */
      }
      return { ok: false, error: "Salesforce session expired - reconnect on the Studio home, then ask again." };
    }
    let body: { success?: boolean; error?: unknown; records?: unknown[]; totalSize?: number; done?: boolean; nextRecordsUrl?: string | null };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return { ok: false, error: `Query failed (HTTP ${res.status}).` };
    }
    if (!res.ok) return { ok: false, error: errorMessage(body, `Query failed (HTTP ${res.status}).`) };
    if (typeof body.error === "string" && body.error) return { ok: false, error: body.error };
    const records = Array.isArray(body.records) ? body.records : [];
    const total = typeof body.totalSize === "number" ? body.totalSize : records.length;
    const hasMore = body.nextRecordsUrl != null || body.done === false;
    const rows = records.slice(0, MAX_ROWS).map(stripAttrs);
    return {
      ok: true,
      result: {
        totalSize: total,
        returned: rows.length,
        hasMore,
        records: rows,
        ...(total > rows.length
          ? { note: `First ${rows.length} of ${total} - narrow with LIMIT / WHERE, or open the result in /query for paging.` }
          : {}),
      },
    };
  },
};

const soslRunArgs = z.object({
  sosl: z.string().min(1).max(10000).describe("Full SOSL statement, e.g. FIND {Acme} RETURNING Account(Id, Name)"),
});

const soslRun: AgentTool = {
  name: "query_sosl_run",
  description:
    "Execute a SOSL search on the CONNECTED org and report matches grouped by object (up to 25 rows back to the model). Requires a live connection.",
  parameters: {
    type: "object",
    properties: { sosl: { type: "string" } },
    required: ["sosl"],
    additionalProperties: false,
  },
  needsApproval: false,
  label: () => "Run SOSL",
  schema: soslRunArgs,
  execute: async (raw) => {
    const args = raw as z.infer<typeof soslRunArgs>;
    const statement = args.sosl.trim();
    if (!looksLikeSosl(statement)) {
      return { ok: false, error: "That does not look like SOSL - it should start with FIND {term} and name RETURNING objects." };
    }
    const session = liveSession();
    if (!isSession(session)) return { ok: false, error: session.error };
    let res: Response;
    try {
      res = await apiFetch(
        "/api/salesforce/sosl",
        { instanceUrl: session.instanceUrl, token: session.token, apiVersion: session.apiVersion, sosl: statement },
        60000
      );
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Search request failed." };
    }
    if (res.status === 401) {
      try {
        markSessionExpired();
      } catch {
        /* gate flag alone still closes AI */
      }
      return { ok: false, error: "Salesforce session expired - reconnect on the Studio home, then ask again." };
    }
    let body: { success?: boolean; error?: unknown; searchRecords?: unknown[]; totalSize?: number };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return { ok: false, error: `Search failed (HTTP ${res.status}).` };
    }
    if (!res.ok) return { ok: false, error: errorMessage(body, `Search failed (HTTP ${res.status}).`) };
    if (typeof body.error === "string" && body.error) return { ok: false, error: body.error };
    const rows = Array.isArray(body.searchRecords) ? body.searchRecords : [];
    const byObject: Record<string, number> = {};
    for (const r of rows) {
      const t = r && typeof r === "object" ? ((r as { attributes?: { type?: unknown } }).attributes?.type ?? null) : null;
      if (typeof t === "string" && t) byObject[t] = (byObject[t] ?? 0) + 1;
    }
    return {
      ok: true,
      result: {
        total: typeof body.totalSize === "number" ? body.totalSize : rows.length,
        byObject,
        records: rows.slice(0, MAX_ROWS).map(stripAttrs),
      },
    };
  },
};

/** Mirrors the /api/salesforce/apex route schema - the route re-validates. */
const APEX_CATEGORIES = ["Db", "Workflow", "Validation", "Callout", "ApexCode", "ApexProfiling"] as const;

const apexRunArgs = z.object({
  code: z.string().min(1).max(8000).describe("Anonymous Apex block, e.g. System.debug('hi');"),
  logCategory: z.enum(APEX_CATEGORIES).optional().describe("Debug log category - default ApexCode"),
  logLevel: z.enum(LOG_LEVELS).optional().describe("Debug log level - default Debug"),
});

const MAX_LOG = 4000;

const apexRun: AgentTool = {
  name: "apex_run",
  description:
    "Execute an anonymous Apex block on the CONNECTED org (Workbench-style: debug log comes back inline). Executes ARBITRARY code as the connected user - use for exploration and diagnostics; DML only when the user explicitly asked for it. Always pauses for Apply. Requires a live connection.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string" },
      logCategory: { type: "string" },
      logLevel: { type: "string" },
    },
    required: ["code"],
    additionalProperties: false,
  },
  needsApproval: true,
  approvalHint: "Runs on the live org - code executes as your user",
  label: (args) => {
    const code = (args as z.infer<typeof apexRunArgs>).code ?? "";
    return `Run anonymous Apex (${code.length} chars)`;
  },
  schema: apexRunArgs,
  execute: async (raw) => {
    const args = raw as z.infer<typeof apexRunArgs>;
    const session = liveSession();
    if (!isSession(session)) return { ok: false, error: session.error };
    let res: Response;
    try {
      res = await apiFetch(
        "/api/salesforce/apex",
        {
          instanceUrl: session.instanceUrl,
          token: session.token,
          apiVersion: session.apiVersion,
          code: args.code,
          logCategory: args.logCategory ?? "ApexCode",
          logLevel: args.logLevel ?? "Debug",
        },
        120000
      );
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Apex execution failed." };
    }
    if (res.status === 401) {
      try {
        markSessionExpired();
      } catch {
        /* gate flag alone still closes AI */
      }
      return { ok: false, error: "Salesforce session expired - reconnect on the Studio home, then ask again." };
    }
    let body: {
      ok?: boolean;
      error?: unknown;
      result?: {
        compiled?: boolean;
        success?: boolean;
        line?: number | null;
        column?: number | null;
        compileProblem?: string | null;
        exceptionMessage?: string | null;
        exceptionStackTrace?: string | null;
        debugLog?: string | null;
      };
    };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return { ok: false, error: `Apex execution failed (HTTP ${res.status}).` };
    }
    if (!res.ok) return { ok: false, error: errorMessage(body, `Apex execution failed (HTTP ${res.status}).`) };
    if (typeof body.error === "string" && body.error) return { ok: false, error: body.error };
    const r = body.result ?? {};
    const log = typeof r.debugLog === "string" ? r.debugLog : "";
    return {
      ok: true,
      result: {
        compiled: !!r.compiled,
        success: !!r.success,
        line: r.line ?? null,
        column: r.column ?? null,
        problem: r.compileProblem ?? r.exceptionMessage ?? null,
        stack: typeof r.exceptionStackTrace === "string" ? r.exceptionStackTrace.slice(0, 2000) : null,
        debugLog: log.length > MAX_LOG ? `${log.slice(0, MAX_LOG)}\n…(truncated, full log in the Apex panel)` : log,
      },
    };
  },
};

export const SALESFORCE_TOOLS: AgentTool[] = [soqlRun, soslRun, apexRun];
