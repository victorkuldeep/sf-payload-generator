"use client";

/**
 * System Design domain model (slice 1: visual topology).
 * Canvas is an editor/view over this structured data - positions and labels
 * are presentation, IDs are stable and independent of both. Connections are
 * born `draft`: a visual edge is never executable until explicitly configured
 * (operations binding arrives in a later slice).
 */

import type { CanvasTodo } from "@/lib/inbox/types";

export const SYSTEM_DESIGN_SCHEMA_VERSION = 1;

export type SystemType =
  | "salesforce"
  | "servicenow"
  | "middleware"
  | "webapp"
  | "rest"
  | "graphql"
  | "database"
  | "queue"
  | "saas"
  | "custom"
  | "cloud"
  | "streaming"
  | "edge"
  | "clm"
  | "erp"
  | "billing"
  | "identity"
  | "warehouse"
  | "notify";

export type ConnectionStatus = "draft" | "partial" | "ready";

export type OperationMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "EVENT" | "QUERY";

export interface SystemNode {
  id: string;
  name: string;
  systemType: SystemType;
  description: string;
  /** Own base URL (https origin + prefix). Falls back to the active
   * environment at run time. Never a secret - tokens stay per-run only. */
  baseUrl?: string;
  position: { x: number; y: number };
  iconKey: string;
}

export type MappingMode = "passthrough" | "template";

/** Stored step mapping: how this edge turns the inbound payload into the
 * next hop's body. Absent = passthrough at run time (stated, not silent). */
export interface EdgeMapping {
  mode: MappingMode;
  template: string;
}

export interface SystemConnection {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  status: ConnectionStatus;
  /** Exact operation bound at each end (ids into project.operations). */
  sourceOperationId?: string;
  targetOperationId?: string;
  mapping?: EdgeMapping;
}

/** A named API surface on a system (REST base, GraphQL endpoint, events). */
export interface SystemInterface {
  id: string;
  systemId: string;
  name: string;
  protocol: "REST" | "GraphQL" | "SOAP" | "Events" | "Other";
  basePath: string;
}

/** Canned response for mock mode: simulate the operation with zero network.
 * Body travels with the project (no secrets - the secret warning applies). */
export interface OperationMock {
  status: number;
  body: string;
  latencyMs: number;
}

/** One callable operation on an interface. Versioned by convention (v1, v2…). */
export interface SystemOperation {
  id: string;
  interfaceId: string;
  name: string;
  method: OperationMethod;
  path: string;
  version: string;
  /** Absent = live. Present = Test and chain runners serve the canned
   * response instead of calling the network. */
  mock?: OperationMock;
  /** Sample payload prefill for test runs and edge runs (optional). */
  sampleBody?: string;
  /** Stored request headers (optional, max 20). Values may carry $env.NAME
   * refs resolved at send time - never paste literal secrets here, they
   * export with the project. Sent by every runner alongside Content-Type. */
  headers?: OperationHeader[];
}

/** Stored header row on an operation. */
export interface OperationHeader {
  key: string;
  value: string;
}

/** Run scope: which lanes and per-edge operation overrides to simulate.
 * UI intent that travels with the project so a shared simulation replays
 * the same path. Lanes are 1-based lane numbers from resolveChain. */
export interface RunScope {
  startEdgeId: string | null;
  lanes: number[];
  opByEdge: Record<string, string>;
}

/** Named deployment target. Holds base URLs only - never secrets. */
export interface SystemEnvironment {
  id: string;
  name: string;
  baseUrl: string;
  /** Production targets trigger an explicit confirm before any run. */
  isProduction?: boolean;
}

/** Named run sequence: a saved start edge + lane picks + per-edge operation
 * overrides. Running a flow applies it as the chain scope and opens the
 * chain runner, so shared simulations replay the same path. */
export interface FlowDef {
  id: string;
  name: string;
  startEdgeId: string;
  lanes: number[];
  opByEdge: Record<string, string>;
}

/** Named test scenario: a flow plus its seed input, mock overrides, target
 * environment, and expected status. Running a scenario applies the mocks to
 * the operations, seeds the start operation payload, applies the flow scope,
 * and opens the chain runner. */
export interface ScenarioDef {
  id: string;
  name: string;
  flowId: string | null;
  environmentId: string | null;
  inputPayload: string;
  mockOverrides: Record<string, OperationMock>;
  expectStatus: number | null;
}

/** Project-level settings. Travels with export/import. */
export interface SystemProjectSettings {
  /** Run-evidence retention in days (Runs tab prunes older records). */
  retentionDays: number;
}

export interface SystemProject {
  id: string;
  name: string;
  schemaVersion: number;
  updatedAt: number;
  systems: SystemNode[];
  connections: SystemConnection[];
  /** Flat registries (ids referenced from systems/connections). Absent on
   * vintage records - always default to [] so v1 canvases keep loading. */
  interfaces: SystemInterface[];
  operations: SystemOperation[];
  environments: SystemEnvironment[];
  activeEnvironmentId: string | null;
  /** Project design notes (markdown) + TODO tracker. Absent on vintage
   * records - default to empty. Exported/imported with the project. */
  notes: string;
  todos: CanvasTodo[];
  /** Last run scope for chain simulations. Absent on vintage records -
   * defaults to undefined (run everything). Travels with export/import. */
  runScope?: RunScope;
  /** Named flows, scenarios, and settings (Flow Lab / Scenarios / Settings
   * tabs). Absent on vintage records - default to empty. */
  flows: FlowDef[];
  scenarios: ScenarioDef[];
  settings: SystemProjectSettings;
}

export interface SystemTemplate {
  systemType: SystemType;
  name: string;
  description: string;
  iconKey: string;
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  { systemType: "salesforce", name: "Salesforce", description: "CRM org - records, APIs, events.", iconKey: "cloud" },
  { systemType: "servicenow", name: "ServiceNow", description: "ITSM tables and workflows.", iconKey: "lifering" },
  { systemType: "middleware", name: "Middleware", description: "Integration broker / ESB / iPaaS.", iconKey: "exchange" },
  { systemType: "webapp", name: "React / Web App", description: "Frontend experience.", iconKey: "code" },
  { systemType: "rest", name: "REST API", description: "HTTPS JSON service.", iconKey: "bolt" },
  { systemType: "graphql", name: "GraphQL API", description: "Graph endpoint.", iconKey: "diamond" },
  { systemType: "database", name: "Database", description: "Relational / document store.", iconKey: "cylinder" },
  { systemType: "queue", name: "Event Broker / Queue", description: "Async messaging backbone.", iconKey: "layers" },
  { systemType: "saas", name: "External SaaS", description: "Third-party cloud service.", iconKey: "grid" },
  { systemType: "custom", name: "Custom System", description: "Anything else - label it.", iconKey: "plus" },
  { systemType: "cloud", name: "Cloud Platform", description: "Hyperscaler landing zone (AWS / Azure / GCP).", iconKey: "server" },
  { systemType: "streaming", name: "Event Streaming", description: "Log streaming backbone (Kafka / Confluent).", iconKey: "activity" },
  { systemType: "edge", name: "Edge & CDN", description: "Edge network (Cloudflare): DNS, CDN, WAF, workers.", iconKey: "globe" },
  { systemType: "clm", name: "CLM / Contracts", description: "Contract lifecycle (DocuSign / Ironclad / Conga).", iconKey: "doc" },
  { systemType: "erp", name: "ERP", description: "ERP backbone (SAP / Oracle / NetSuite).", iconKey: "briefcase" },
  { systemType: "billing", name: "Billing", description: "Billing and invoicing (Stripe / Zuora).", iconKey: "card" },
  { systemType: "identity", name: "Identity & Access", description: "IdP and SSO (Okta / Entra ID).", iconKey: "shield" },
  { systemType: "warehouse", name: "Data Warehouse", description: "Analytics store (Snowflake / BigQuery).", iconKey: "bank" },
  { systemType: "notify", name: "Notifications", description: "Human alerts (Slack / Email / SMS).", iconKey: "bell" },
];

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

export function newProject(name = "Untitled architecture"): SystemProject {
  const now = Date.now();
  return {
    id: newId("proj"),
    name,
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    updatedAt: now,
    systems: [],
    connections: [],
    interfaces: [],
    operations: [],
    environments: [{ id: newId("env"), name: "Sandbox", baseUrl: "" }],
    activeEnvironmentId: null,
    notes: "",
    todos: [],
    flows: [],
    scenarios: [],
    settings: { retentionDays: 30 },
  };
}

/**
 * Coerce named flows (drop, never fail: UI intent must not invalidate an
 * imported project).
 */
export function coerceFlows(raw: unknown): FlowDef[] {
  if (!Array.isArray(raw)) return [];
  const out: FlowDef[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const r = f as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) continue;
    if (typeof r.name !== "string" || !r.name.trim()) continue;
    if (typeof r.startEdgeId !== "string" || !r.startEdgeId) continue;
    const lanes = Array.isArray(r.lanes)
      ? [...new Set(r.lanes.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
      : [];
    const opByEdge: Record<string, string> = {};
    if (r.opByEdge && typeof r.opByEdge === "object") {
      for (const [k, v] of Object.entries(r.opByEdge as Record<string, unknown>)) {
        if (typeof v === "string" && v) opByEdge[k] = v;
      }
    }
    out.push({ id: r.id, name: r.name, startEdgeId: r.startEdgeId, lanes, opByEdge });
  }
  return out;
}

/** Coerce scenarios (drop, never fail). */
export function coerceScenarios(raw: unknown): ScenarioDef[] {
  if (!Array.isArray(raw)) return [];
  const out: ScenarioDef[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) continue;
    if (typeof r.name !== "string" || !r.name.trim()) continue;
    const mockOverrides: Record<string, OperationMock> = {};
    if (r.mockOverrides && typeof r.mockOverrides === "object") {
      for (const [k, v] of Object.entries(r.mockOverrides as Record<string, unknown>)) {
        if (!v || typeof v !== "object") continue;
        const m = v as Record<string, unknown>;
        if (typeof m.status !== "number" || typeof m.body !== "string" || typeof m.latencyMs !== "number") continue;
        mockOverrides[k] = {
          status: Math.trunc(m.status),
          body: m.body.slice(0, 20000),
          latencyMs: Math.max(0, Math.trunc(m.latencyMs)),
        };
      }
    }
    const expectStatus =
      typeof r.expectStatus === "number" && Number.isInteger(r.expectStatus) && r.expectStatus >= 100 && r.expectStatus <= 599
        ? r.expectStatus
        : null;
    out.push({
      id: r.id,
      name: r.name,
      flowId: typeof r.flowId === "string" && r.flowId ? r.flowId : null,
      environmentId: typeof r.environmentId === "string" && r.environmentId ? r.environmentId : null,
      inputPayload: typeof r.inputPayload === "string" ? r.inputPayload.slice(0, 20000) : "{}",
      mockOverrides,
      expectStatus,
    });
  }
  return out;
}

/** Coerce project settings (defaults, never fail). */
export function coerceSettings(raw: unknown): SystemProjectSettings {
  const fallback = { retentionDays: 30 };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const retentionDays =
    typeof r.retentionDays === "number" && Number.isFinite(r.retentionDays)
      ? Math.min(365, Math.max(1, Math.trunc(r.retentionDays)))
      : 30;
  return { retentionDays };
}

/**
 * Coerce a stored run scope (drop, never fail: scope is UI intent, and a
 * malformed scope must not invalidate an imported project).
 */
export function coerceRunScope(raw: unknown): RunScope | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const lanes = Array.isArray(r.lanes)
    ? r.lanes.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0)
    : [];
  const opByEdge: Record<string, string> = {};
  if (r.opByEdge && typeof r.opByEdge === "object") {
    for (const [k, v] of Object.entries(r.opByEdge as Record<string, unknown>)) {
      if (typeof v === "string" && v) opByEdge[k] = v;
    }
  }
  return {
    startEdgeId: typeof r.startEdgeId === "string" ? r.startEdgeId : null,
    lanes,
    opByEdge,
  };
}

/**
 * Effective scope for a chain run: the saved scope when it targets this
 * start edge, otherwise run-everything defaults.
 */
export function resolveRunScope(
  project: Pick<SystemProject, "runScope">,
  startEdgeId: string,
  laneCount: number
): { lanes: number[]; opByEdge: Record<string, string> } {
  const saved = project.runScope;
  if (saved && saved.startEdgeId === startEdgeId && saved.lanes.length > 0) {
    const valid = saved.lanes.filter((n) => n >= 1 && n <= laneCount);
    if (valid.length > 0) return { lanes: [...new Set(valid)].sort((a, b) => a - b), opByEdge: { ...saved.opByEdge } };
  }
  return { lanes: Array.from({ length: laneCount }, (_, i) => i + 1), opByEdge: {} };
}

/** Readiness is DERIVED, never stored: both ends bound to live operations
 * on the correct endpoint systems = ready; one end = partial; else draft.
 * A binding to a deleted/moved operation reads as unbound (fail-visible). */
export function connectionReadiness(
  conn: SystemConnection,
  project: Pick<SystemProject, "systems" | "interfaces" | "operations">
): ConnectionStatus {
  const opBelongsTo = (opId: string | undefined, systemId: string): boolean => {
    if (!opId) return false;
    const op = project.operations.find((o) => o.id === opId);
    if (!op) return false;
    const iface = project.interfaces.find((i) => i.id === op.interfaceId);
    return !!iface && iface.systemId === systemId;
  };
  const s = opBelongsTo(conn.sourceOperationId, conn.sourceId);
  const t = opBelongsTo(conn.targetOperationId, conn.targetId);
  if (s && t) return "ready";
  if (s || t) return "partial";
  return "draft";
}

/** Operations callable at one end of an edge, grouped for selects. */
export function operationsForSystem(
  project: Pick<SystemProject, "interfaces" | "operations">,
  systemId: string
): { iface: SystemInterface; ops: SystemOperation[] }[] {
  return project.interfaces
    .filter((i) => i.systemId === systemId)
    .map((iface) => ({
      iface,
      ops: project.operations.filter((o) => o.interfaceId === iface.id),
    }));
}

export function newSystemFromTemplate(t: SystemTemplate, position: { x: number; y: number }, n: number): SystemNode {
  return {
    id: newId("sys"),
    name: t.systemType === "custom" ? `Custom System ${n}` : `${t.name} ${n}`,
    systemType: t.systemType,
    description: t.description,
    position: { ...position },
    iconKey: t.iconKey,
  };
}

export interface ProjectIssue {
  path: string;
  message: string;
}

/** Structural validation: ids, references, schema version. Never mutates. */
export function validateProject(raw: unknown): { project: SystemProject | null; issues: ProjectIssue[] } {
  const issues: ProjectIssue[] = [];
  if (!raw || typeof raw !== "object") return { project: null, issues: [{ path: "$", message: "Not an object." }] };
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string" || !p.id) issues.push({ path: "$.id", message: "Missing project id." });
  if (typeof p.name !== "string") issues.push({ path: "$.name", message: "Missing project name." });
  if (p.schemaVersion !== SYSTEM_DESIGN_SCHEMA_VERSION) {
    issues.push({ path: "$.schemaVersion", message: `Unsupported schema version (want ${SYSTEM_DESIGN_SCHEMA_VERSION}).` });
  }
  if (!Array.isArray(p.systems)) issues.push({ path: "$.systems", message: "Systems must be an array." });
  if (!Array.isArray(p.connections)) issues.push({ path: "$.connections", message: "Connections must be an array." });
  if (issues.length > 0) return { project: null, issues };

  const systems = p.systems as Record<string, unknown>[];
  const connections = p.connections as Record<string, unknown>[];
  const ids = new Set<string>();
  for (let i = 0; i < systems.length; i++) {
    const s = systems[i];
    const at = `$.systems[${i}]`;
    if (typeof s.id !== "string" || !s.id) issues.push({ path: `${at}.id`, message: "Missing system id." });
    else if (ids.has(s.id)) issues.push({ path: `${at}.id`, message: `Duplicate system id ${s.id}.` });
    else ids.add(s.id);
    if (typeof s.name !== "string" || !s.name.trim()) issues.push({ path: `${at}.name`, message: "Missing system name." });
    if (s.baseUrl !== undefined && typeof s.baseUrl !== "string") {
      issues.push({ path: `${at}.baseUrl`, message: "Base URL must be a string." });
    }
    if (!s.position || typeof (s.position as { x?: unknown }).x !== "number" || typeof (s.position as { y?: unknown }).y !== "number") {
      issues.push({ path: `${at}.position`, message: "Position must be {x, y} numbers." });
    }
  }
  for (let i = 0; i < connections.length; i++) {
    const c = connections[i];
    const at = `$.connections[${i}]`;
    if (typeof c.id !== "string" || !c.id) issues.push({ path: `${at}.id`, message: "Missing connection id." });
    if (typeof c.sourceId !== "string" || !ids.has(c.sourceId)) {
      issues.push({ path: `${at}.sourceId`, message: `Unknown source system ${String(c.sourceId)}.` });
    }
    if (typeof c.targetId !== "string" || !ids.has(c.targetId)) {
      issues.push({ path: `${at}.targetId`, message: `Unknown target system ${String(c.targetId)}.` });
    }
  }
  if (issues.length > 0) return { project: null, issues };
  // Registries are optional (vintage slice-1 records) - default to empty.
  const interfaces = (Array.isArray(p.interfaces) ? p.interfaces : []) as Record<string, unknown>[];
  const operations = (Array.isArray(p.operations) ? p.operations : []) as Record<string, unknown>[];
  const environments = (Array.isArray(p.environments) ? p.environments : []) as Record<string, unknown>[];
  const ifaceIds = new Set<string>();
  for (let i = 0; i < interfaces.length; i++) {
    const f = interfaces[i];
    const at = `$.interfaces[${i}]`;
    if (typeof f.id !== "string" || !f.id) issues.push({ path: `${at}.id`, message: "Missing interface id." });
    else if (ifaceIds.has(f.id)) issues.push({ path: `${at}.id`, message: `Duplicate interface id ${f.id}.` });
    else ifaceIds.add(f.id);
    if (typeof f.systemId !== "string" || !ids.has(f.systemId)) {
      issues.push({ path: `${at}.systemId`, message: `Unknown system ${String(f.systemId)}.` });
    }
    if (typeof f.name !== "string" || !f.name.trim()) issues.push({ path: `${at}.name`, message: "Missing interface name." });
  }
  const opIds = new Set<string>();
  const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "EVENT", "QUERY"];
  for (let i = 0; i < operations.length; i++) {
    const o = operations[i];
    const at = `$.operations[${i}]`;
    if (typeof o.id !== "string" || !o.id) issues.push({ path: `${at}.id`, message: "Missing operation id." });
    else if (opIds.has(o.id)) issues.push({ path: `${at}.id`, message: `Duplicate operation id ${o.id}.` });
    else opIds.add(o.id);
    if (typeof o.interfaceId !== "string" || !ifaceIds.has(o.interfaceId)) {
      issues.push({ path: `${at}.interfaceId`, message: `Unknown interface ${String(o.interfaceId)}.` });
    }
    if (typeof o.name !== "string" || !o.name.trim()) issues.push({ path: `${at}.name`, message: "Missing operation name." });
    if (typeof o.method !== "string" || !METHODS.includes(o.method)) {
      issues.push({ path: `${at}.method`, message: `Method must be one of ${METHODS.join("/")}.` });
    }
    if (o.sampleBody !== undefined && typeof o.sampleBody !== "string") {
      issues.push({ path: `${at}.sampleBody`, message: "Sample body must be a string." });
    }
    if (o.mock !== undefined) {
      const m = o.mock as Record<string, unknown>;
      if (!m || typeof m !== "object") {
        issues.push({ path: `${at}.mock`, message: "Mock must be an object." });
      } else {
        if (typeof m.status !== "number" || !Number.isInteger(m.status) || m.status < 100 || m.status > 599) {
          issues.push({ path: `${at}.mock.status`, message: "Mock status must be an integer 100-599." });
        }
        if (typeof m.body !== "string" || m.body.length > 20000) {
          issues.push({ path: `${at}.mock.body`, message: "Mock body must be a string under 20 KB." });
        }
        if (typeof m.latencyMs !== "number" || !Number.isInteger(m.latencyMs) || m.latencyMs < 0 || m.latencyMs > 30000) {
          issues.push({ path: `${at}.mock.latencyMs`, message: "Mock latency must be 0-30000 ms." });
        }
      }
    }
    if (o.headers !== undefined) {
      if (!Array.isArray(o.headers) || o.headers.length > 20) {
        issues.push({ path: `${at}.headers`, message: "Headers must be a list of at most 20 rows." });
      } else {
        for (let h = 0; h < o.headers.length; h++) {
          const row = o.headers[h] as Record<string, unknown>;
          const ht = `${at}.headers[${h}]`;
          if (!row || typeof row !== "object") {
            issues.push({ path: ht, message: "Header row must be an object." });
            continue;
          }
          if (typeof row.key !== "string" || !row.key.trim() || row.key.length > 100) {
            issues.push({ path: `${ht}.key`, message: "Header name must be 1-100 characters." });
          }
          if (typeof row.value !== "string" || row.value.length > 5000) {
            issues.push({ path: `${ht}.value`, message: "Header value must be a string under 5 KB." });
          }
        }
      }
    }
  }
  for (let i = 0; i < environments.length; i++) {
    const e = environments[i];
    const at = `$.environments[${i}]`;
    if (typeof e.id !== "string" || !e.id) issues.push({ path: `${at}.id`, message: "Missing environment id." });
    if (typeof e.name !== "string" || !e.name.trim()) issues.push({ path: `${at}.name`, message: "Missing environment name." });
    if (e.isProduction !== undefined && typeof e.isProduction !== "boolean") {
      issues.push({ path: `${at}.isProduction`, message: "Production flag must be a boolean." });
    }
  }
  // Edge bindings must reference live operations on the correct endpoint.
  for (let i = 0; i < connections.length; i++) {
    const c = connections[i] as Record<string, unknown> & { sourceOperationId?: unknown; targetOperationId?: unknown };
    const at = `$.connections[${i}]`;
    for (const [key, sysKey] of [["sourceOperationId", "sourceId"], ["targetOperationId", "targetId"]] as const) {
      const opId = c[key];
      if (opId === undefined || opId === null || opId === "") continue;
      if (typeof opId !== "string" || !opIds.has(opId)) {
        issues.push({ path: `${at}.${key}`, message: `Unknown operation ${String(opId)}.` });
        continue;
      }
      const op = (operations as Record<string, unknown>[]).find((o) => o.id === opId) as { interfaceId?: string };
      const iface = (interfaces as Record<string, unknown>[]).find((f) => f.id === op?.interfaceId) as { systemId?: string } | undefined;
      if (!iface || iface.systemId !== c[sysKey]) {
        issues.push({ path: `${at}.${key}`, message: `Operation ${opId} does not belong to the ${sysKey === "sourceId" ? "source" : "target"} system.` });
      }
    }
    const mapping = c.mapping as { mode?: unknown; template?: unknown } | undefined;
    if (mapping !== undefined) {
      if (typeof mapping !== "object" || mapping === null) {
        issues.push({ path: `${at}.mapping`, message: "Mapping must be an object." });
      } else {
        if (mapping.mode !== "passthrough" && mapping.mode !== "template") {
          issues.push({ path: `${at}.mapping.mode`, message: "Mapping mode must be passthrough or template." });
        }
        if (typeof mapping.template !== "string" || mapping.template.length > 10000) {
          issues.push({ path: `${at}.mapping.template`, message: "Mapping template must be a string under 10 KB." });
        }
      }
    }
  }
  if (issues.length > 0) return { project: null, issues };
  const activeEnv = typeof p.activeEnvironmentId === "string" ? p.activeEnvironmentId : null;
  // Notes + TODOs are optional (vintage records) - validated when present.
  const notes = typeof p.notes === "string" ? p.notes : "";
  const rawTodos = Array.isArray(p.todos) ? p.todos : [];
  const todos: CanvasTodo[] = [];
  const todoIds = new Set<string>();
  const STATUSES = ["open", "in-progress", "done"];
  for (let i = 0; i < rawTodos.length; i++) {
    const t = rawTodos[i] as Record<string, unknown>;
    const at = `$.todos[${i}]`;
    if (typeof t.id !== "string" || !t.id) {
      issues.push({ path: `${at}.id`, message: "Missing TODO id." });
      continue;
    }
    if (todoIds.has(t.id)) {
      issues.push({ path: `${at}.id`, message: `Duplicate TODO id ${t.id}.` });
      continue;
    }
    todoIds.add(t.id);
    if (typeof t.title !== "string") {
      issues.push({ path: `${at}.title`, message: "TODO title must be a string." });
      continue;
    }
    if (typeof t.status !== "string" || !STATUSES.includes(t.status)) {
      issues.push({ path: `${at}.status`, message: "TODO status must be open, in-progress or done." });
      continue;
    }
    todos.push({
      id: t.id,
      title: t.title,
      body: typeof t.body === "string" ? t.body : undefined,
      assignee: typeof t.assignee === "string" ? t.assignee : undefined,
      dueDate: typeof t.dueDate === "string" ? t.dueDate : undefined,
      status: t.status as CanvasTodo["status"],
      createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
      updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
    });
  }
  if (issues.length > 0) return { project: null, issues };
  return {
    project: {
      id: p.id as string,
      name: p.name as string,
      schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
      systems: systems as unknown as SystemNode[],
      connections: (connections as unknown as SystemConnection[]).map((c) => ({
        ...c,
        status: "draft" as const,
      })),
      interfaces: interfaces as unknown as SystemInterface[],
      operations: operations as unknown as SystemOperation[],
      environments: environments as unknown as SystemEnvironment[],
      activeEnvironmentId: activeEnv,
      notes,
      todos,
      runScope: coerceRunScope((p as Record<string, unknown>).runScope),
      flows: coerceFlows((p as Record<string, unknown>).flows),
      scenarios: coerceScenarios((p as Record<string, unknown>).scenarios),
      settings: coerceSettings((p as Record<string, unknown>).settings),
    },
    issues: [],
  };
}

/** Export envelope: manifest + project. Notes/TODOs travel with the project
 * (user-authored design text). Secrets must never reach here - environments
 * carry base URLs only, tokens are never stored anywhere in this module.
 * Operation headers DO export: keep values as $env.NAME refs, never literals. */
export function exportProject(project: SystemProject): { kind: string; version: number; exportedAt: number; project: SystemProject } {
  return {
    kind: "sobject-studio-system-design",
    version: SYSTEM_DESIGN_SCHEMA_VERSION,
    exportedAt: Date.now(),
    project: { ...project, updatedAt: Date.now() },
  };
}

export function importProject(raw: unknown): { project: SystemProject | null; issues: ProjectIssue[] } {
  if (!raw || typeof raw !== "object") return { project: null, issues: [{ path: "$", message: "Not an object." }] };
  const env = raw as Record<string, unknown>;
  if (env.kind !== "sobject-studio-system-design") {
    return { project: null, issues: [{ path: "$.kind", message: "Not a System Design export." }] };
  }
  return validateProject(env.project);
}

export function projectFileName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "architecture";
  return `${slug}.sobject-system.json`;
}
