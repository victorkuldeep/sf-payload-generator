"use client";

/**
 * Record Walk engine (pure): on-demand live record traversal for the ERD.
 * Root loads automatically from a Record Id; every other node resolves
 * reachability against already-loaded records and pulls with ONE deliberate
 * query per click - no BFS storms, no governor risk by construction.
 *
 * Session-only by design: loaded records live in component memory and are
 * never persisted, exported, or shared.
 */

export const RECORD_ROW_LIMIT = 11; // 10 shown + 1 overflow probe ("+N more")

export interface WalkField {
  name: string;
  type: string;
  referenceTo: string[];
  nameField?: boolean;
}

export interface WalkDescribe {
  fields: WalkField[];
  childRelationships: { childSObject: string; relationshipName: string | null }[];
}

/** One fetched record: display fields + every lookup value (for traversal). */
export interface LoadedSingle {
  id: string;
  fields: Record<string, unknown>;
}

export interface ChildRows {
  childApi: string;
  lookupField: string;
  parentApi: string;
  parentId: string;
  rows: Record<string, unknown>[];
  offset: number;
  exhausted: boolean;
}

export interface LoadedState {
  /** apiName -> record id -> record (insertion-ordered). */
  singles: Map<string, Map<string, LoadedSingle>>;
  /** `${childApi}::${lookupField}::${parentId}` -> page. */
  children: Map<string, ChildRows>;
}

export const emptyLoadedState = (): LoadedState => ({ singles: new Map(), children: new Map() });

export const childPageKey = (childApi: string, lookupField: string, parentId: string) =>
  `${childApi}::${lookupField}::${parentId}`;

/** 15- or 18-char Salesforce Id (prefix validated against the record itself). */
export function isValidRecordId(id: string): boolean {
  return /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id.trim());
}

export function escapeSoqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Id + name field + every lookup (traversal needs all of them). */
export function displayFieldNames(fields: WalkField[]): { select: string[]; nameField: string | null } {
  const has = (n: string) => fields.some((f) => f.name === n);
  const nameField = fields.find((f) => f.nameField)?.name ?? (has("Name") ? "Name" : null);
  const lookups = fields.filter((f) => f.type === "reference" && (f.referenceTo ?? []).length > 0).map((f) => f.name);
  const select = ["Id", ...(nameField && nameField !== "Id" ? [nameField] : []), ...lookups.filter((l) => l !== "Id" && l !== nameField)];
  return { select: [...new Set(select)], nameField };
}

export function buildRootQuery(apiName: string, select: string[], id: string): string {
  return `SELECT ${select.join(", ")} FROM ${apiName} WHERE Id = '${escapeSoqlString(id.trim())}' LIMIT 1`;
}

export function buildChildrenQuery(
  childApi: string,
  lookupField: string,
  parentId: string,
  select: string[],
  offset: number
): string {
  return `SELECT ${select.join(", ")} FROM ${childApi} WHERE ${lookupField} = '${escapeSoqlString(parentId)}' ORDER BY Id LIMIT ${RECORD_ROW_LIMIT} OFFSET ${Math.max(0, offset)}`;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Every known record id for an object: singles first, then child-row ids. */
export function knownIdsFor(state: LoadedState, apiName: string): string[] {
  const out: string[] = [];
  const singles = state.singles.get(apiName);
  if (singles) for (const id of singles.keys()) out.push(id);
  for (const page of state.children.values()) {
    if (page.childApi !== apiName) continue;
    for (const row of page.rows) {
      const id = str(row.Id);
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

export type TargetPlan =
  | { kind: "single"; apiName: string; id: string }
  | { kind: "children"; childApi: string; lookupField: string; parentApi: string; parentId: string }
  | { kind: "blocked"; missingApi: string; missingLabel: string };

export interface ResolveContext {
  rootApi: string | null;
  rootId: string | null;
  /** Canvas objects in a stable order (root first when present). */
  canvasApis: string[];
  getDescribe: (apiName: string) => WalkDescribe | undefined;
  labelOf: (apiName: string) => string;
}

/**
 * How to pull one node's data from the current loaded set:
 * - a known id (root or a lookup value seen on a loaded record) -> single GET
 * - a loaded parent id + this node's lookup to it -> children query
 * - otherwise blocked, naming the canvas parent to load first.
 */
export function resolveTarget(targetApi: string, state: LoadedState, ctx: ResolveContext): TargetPlan {
  const describe = ctx.getDescribe(targetApi);
  // Already aboard: show the first known record (insertion order).
  const known = knownIdsFor(state, targetApi);
  if (known.length > 0) return { kind: "single", apiName: targetApi, id: known[0] };
  // A loaded record pointing AT the target via one of its lookups?
  const orderedApis = [...state.singles.keys()].sort((a, b) => {
    if (a === ctx.rootApi) return -1;
    if (b === ctx.rootApi) return 1;
    return 0;
  });
  for (const holderApi of orderedApis) {
    const holderDesc = ctx.getDescribe(holderApi);
    if (!holderDesc) continue;
    for (const f of holderDesc.fields) {
      if (f.type !== "reference" || !(f.referenceTo ?? []).includes(targetApi)) continue;
      for (const rec of state.singles.get(holderApi)?.values() ?? []) {
        const v = str(rec.fields[f.name]);
        if (v) return { kind: "single", apiName: targetApi, id: v };
      }
    }
  }
  // A loaded parent this node looks up to? (Root first, then the rest.)
  const lookups = (describe?.fields ?? []).filter(
    (f) => f.type === "reference" && (f.referenceTo ?? []).length > 0
  );
  const parentCandidates: { api: string; id: string }[] = [];
  if (ctx.rootApi && ctx.rootId) parentCandidates.push({ api: ctx.rootApi, id: ctx.rootId });
  for (const [api, recs] of state.singles) {
    if (api === ctx.rootApi) continue;
    for (const id of recs.keys()) parentCandidates.push({ api, id });
  }
  for (const page of state.children.values()) {
    for (const row of page.rows) {
      const id = str(row.Id);
      if (id) parentCandidates.push({ api: page.childApi, id });
    }
  }
  for (const parent of parentCandidates) {
    const via = lookups.find((f) => (f.referenceTo ?? []).includes(parent.api));
    if (via) {
      return { kind: "children", childApi: targetApi, lookupField: via.name, parentApi: parent.api, parentId: parent.id };
    }
  }
  // Blocked: suggest the first on-canvas parent (describe order), else any lookup target.
  const onCanvas = lookups.find((f) => (f.referenceTo ?? []).some((t) => ctx.canvasApis.includes(t)));
  const hint = onCanvas ?? lookups[0];
  const missingApi = hint ? (hint.referenceTo ?? []).find((t) => ctx.canvasApis.includes(t)) ?? (hint.referenceTo ?? [])[0] : null;
  return {
    kind: "blocked",
    missingApi: missingApi ?? targetApi,
    missingLabel: missingApi ? ctx.labelOf(missingApi) : ctx.labelOf(targetApi),
  };
}

/** Node eye state from the loaded set: live, one-click reachable, or locked. */
export function nodeRecordState(
  apiName: string,
  state: LoadedState,
  ctx: ResolveContext
): { state: "live" | "reachable" | "locked"; hint: string | null } {
  if (knownIdsFor(state, apiName).length > 0) return { state: "live", hint: null };
  const plan = resolveTarget(apiName, state, ctx);
  if (plan.kind === "blocked") {
    return {
      state: "locked",
      hint: plan.missingApi === apiName ? "No lookup path from a loaded record" : `Load ${plan.missingLabel} first`,
    };
  }
  return { state: "reachable", hint: plan.kind === "single" ? "Click to pull this record" : `Click to pull via ${ctx.labelOf(plan.parentApi)}` };
}
