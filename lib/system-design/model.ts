"use client";

/**
 * System Design domain model (slice 1: visual topology).
 * Canvas is an editor/view over this structured data - positions and labels
 * are presentation, IDs are stable and independent of both. Connections are
 * born `draft`: a visual edge is never executable until explicitly configured
 * (operations binding arrives in a later slice).
 */

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
  | "custom";

export type ConnectionStatus = "draft" | "partial" | "ready";

export type OperationMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "EVENT" | "QUERY";

export interface SystemNode {
  id: string;
  name: string;
  systemType: SystemType;
  description: string;
  position: { x: number; y: number };
  iconKey: string;
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
}

/** A named API surface on a system (REST base, GraphQL endpoint, events). */
export interface SystemInterface {
  id: string;
  systemId: string;
  name: string;
  protocol: "REST" | "GraphQL" | "SOAP" | "Events" | "Other";
  basePath: string;
}

/** One callable operation on an interface. Versioned by convention (v1, v2…). */
export interface SystemOperation {
  id: string;
  interfaceId: string;
  name: string;
  method: OperationMethod;
  path: string;
  version: string;
}

/** Named deployment target. Holds base URLs only - never secrets. */
export interface SystemEnvironment {
  id: string;
  name: string;
  baseUrl: string;
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
  };
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
  }
  for (let i = 0; i < environments.length; i++) {
    const e = environments[i];
    const at = `$.environments[${i}]`;
    if (typeof e.id !== "string" || !e.id) issues.push({ path: `${at}.id`, message: "Missing environment id." });
    if (typeof e.name !== "string" || !e.name.trim()) issues.push({ path: `${at}.name`, message: "Missing environment name." });
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
  }
  if (issues.length > 0) return { project: null, issues };
  const activeEnv = typeof p.activeEnvironmentId === "string" ? p.activeEnvironmentId : null;
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
    },
    issues: [],
  };
}

/** Export envelope: manifest + project. Secrets must never reach here (none exist in slice 1). */
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
