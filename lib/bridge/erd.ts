/**
 * ERD live-bridge command handlers.
 *
 * Pure mapping layer between the tab↔hub bridge protocol
 * (`erd.snapshot`, `erd.discover`, `erd.place`, `erd.focus`, `erd.mode`,
 * `erd.filter`, `erd.author_field`, `erd.author_object`, `bridge.ping`)
 * and the live SchemaPanel state. SchemaPanel builds one context object from
 * its state and registers these handlers once; every handler reads the latest
 * state through the context getters so results never go stale.
 *
 * Reads (snapshot/ping/discover-shape) execute immediately; writes pause for
 * the architect's in-tab approval in the inbox before they run. Handlers never
 * see tokens - they call the same session-backed callbacks the UI uses.
 */

import { BRIDGE_PROTOCOL_V } from "./protocol";
import type { BridgeHandler } from "./registry";
import type {
  DesignFieldType,
  FieldDraft,
  ObjectDraft,
} from "../salesforce/design";
import {
  defaultFieldDraft,
  defaultObjectDraft,
  relationshipNameFromField,
} from "../salesforce/design";
import type { SalesforceDescribeResult } from "../salesforce/types";

/** Minimal ERD state surface the handlers need. */
export interface ErdBridgeContext {
  /** All known objects (SchemaPanel `objects` prop: { name, label }). */
  objects: { name: string; label: string }[];
  /** Live canvas membership: api name -> describe. */
  describes: Map<string, SalesforceDescribeResult>;
  rootName: string;
  focusName: string;
  view: "erd" | "graph";
  hideSystem: boolean;
  filterMode: "all" | "standard" | "custom" | "manual";
  authorMode: boolean;
  /** Current ReactFlow node positions keyed by object api name. */
  nodePositions: () => Record<string, { x: number; y: number }>;
  focusCanvasOn: (name: string) => void;
  setFocusName: (name: string) => void;
  setView: (view: "erd" | "graph") => void;
  setHideSystem: (hide: boolean) => void;
  /** Fetch describes + merge onto canvas (mirrors the Add/Discover flow). */
  addNames: (names: string[]) => Promise<SalesforceDescribeResult[]>;
  /** Describe through the org cache (null on failure, no throw). */
  describeCached: (name: string) => Promise<SalesforceDescribeResult | null>;
  /** Author-mode submit paths - open the same deploy confirms as the UI. */
  submitAuthorField: (draft: FieldDraft, childApi: string) => Promise<void>;
  submitAuthorObject: (draft: ObjectDraft) => Promise<void>;
}

export const ERD_BRIDGE_KINDS = [
  "bridge.ping",
  "erd.snapshot",
  "erd.discover",
  "erd.place",
  "erd.focus",
  "erd.mode",
  "erd.filter",
  "erd.author_field",
  "erd.author_object",
] as const;

const FIELD_TYPES: DesignFieldType[] = [
  "Text",
  "TextArea",
  "LongTextArea",
  "Number",
  "Percent",
  "Currency",
  "Checkbox",
  "Date",
  "DateTime",
  "Email",
  "Phone",
  "Url",
  "Picklist",
  "Lookup",
  "MasterDetail",
];

function strArg(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v.trim() : "";
}

function strListArg(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

/**
 * Resolve a human ref ("account", "Order", "acme__Invoice__c") to the exact
 * object api name. Exact api-name match wins; exact label match next; a single
 * substring hit auto-resolves; several hits throw an ambiguous error that
 * lists candidates so the agent can ask the architect to pick one.
 */
export function resolveObjectRef(
  objects: { name: string; label: string }[],
  ref: string,
): string {
  const q = ref.trim();
  if (!q) throw new Error("Object reference is empty.");
  const lower = q.toLowerCase();
  const byApi = objects.find((o) => o.name.toLowerCase() === lower);
  if (byApi) return byApi.name;
  const byLabel = objects.find((o) => o.label.toLowerCase() === lower);
  if (byLabel) return byLabel.name;
  const hits = objects.filter(
    (o) => o.name.toLowerCase().includes(lower) || o.label.toLowerCase().includes(lower),
  );
  if (hits.length === 1) return hits[0].name;
  if (hits.length === 0) throw new Error(`Unknown object "${q}" - no api name or label matches.`);
  const list = hits.slice(0, 8).map((o) => o.name).join(", ");
  throw new Error(`Ambiguous object "${q}" - matches ${hits.length}: ${list}. Ask for the exact api name.`);
}

export interface ErdSnapshot {
  nodes: { apiName: string; label: string; position: { x: number; y: number } | null }[];
  links: { source: string; target: string; label: string; relation: "reference" | "child" }[];
  root: string;
  focus: string;
  view: "erd" | "graph";
  filters: { hideSystem: boolean; filterMode: ErdBridgeContext["filterMode"] };
  authorMode: boolean;
}

function buildSnapshot(ctx: ErdBridgeContext): ErdSnapshot {
  const positions = ctx.nodePositions();
  const nodes = [...ctx.describes.values()].map((d) => ({
    apiName: d.name,
    label: d.label,
    position: positions[d.name] ?? null,
  }));
  const links: ErdSnapshot["links"] = [];
  for (const d of ctx.describes.values()) {
    for (const f of d.fields) {
      for (const target of f.referenceTo ?? []) {
        links.push({
          source: d.name,
          target,
          label: f.relationshipName ?? f.name,
          relation: "reference",
        });
      }
    }
    for (const rel of d.childRelationships ?? []) {
      links.push({ source: d.name, target: rel.childSObject, label: rel.relationshipName ?? rel.field, relation: "child" });
    }
  }
  return {
    nodes,
    links,
    root: ctx.rootName,
    focus: ctx.focusName,
    view: ctx.view,
    filters: { hideSystem: ctx.hideSystem, filterMode: ctx.filterMode },
    authorMode: ctx.authorMode,
  };
}

/** Build the nine tab-side handlers over a live context. */
export function buildErdBridgeHandlers(ctx: ErdBridgeContext): Record<string, BridgeHandler> {
  return {
    "bridge.ping": async () => ({ ok: true, protocol: BRIDGE_PROTOCOL_V, tab: "erd" }),

    "erd.snapshot": async () => buildSnapshot(ctx),

    "erd.discover": async (args) => {
      const apiName = resolveObjectRef(ctx.objects, strArg(args, "apiName"));
      const direction = strArg(args, "direction") || "both";
      if (!["parents", "children", "both"].includes(direction)) {
        throw new Error(`Unknown direction "${direction}" - use parents, children or both.`);
      }
      const describe = await ctx.describeCached(apiName);
      if (!describe) throw new Error(`Could not describe ${apiName} from the org.`);
      const out: {
        object: string;
        label: string;
        onCanvas: boolean;
        parents: { apiName: string; viaField: string; label: string; onCanvas: boolean }[];
        children: { apiName: string; viaField: string; label: string; onCanvas: boolean }[];
      } = {
        object: describe.name,
        label: describe.label,
        onCanvas: ctx.describes.has(describe.name),
        parents: [],
        children: [],
      };
      if (direction !== "children") {
        const seen = new Set<string>();
        for (const f of describe.fields) {
          for (const target of f.referenceTo ?? []) {
            if (seen.has(target)) continue;
            seen.add(target);
            const label = ctx.objects.find((o) => o.name === target)?.label ?? target;
            out.parents.push({
              apiName: target,
              viaField: f.name,
              label,
              onCanvas: ctx.describes.has(target),
            });
          }
        }
      }
      if (direction !== "parents") {
        const seen = new Set<string>();
        for (const rel of describe.childRelationships ?? []) {
          if (seen.has(rel.childSObject)) continue;
          seen.add(rel.childSObject);
          const label = ctx.objects.find((o) => o.name === rel.childSObject)?.label ?? rel.childSObject;
          out.children.push({
            apiName: rel.childSObject,
            viaField: rel.field,
            label,
            onCanvas: ctx.describes.has(rel.childSObject),
          });
        }
      }
      return out;
    },

    "erd.place": async (args) => {
      const refs = strListArg(args, "apiNames");
      if (refs.length === 0) throw new Error("Provide at least one object api name to place.");
      const names = refs.map((r) => resolveObjectRef(ctx.objects, r));
      const fresh = await ctx.addNames(names);
      const placed = fresh.map((d) => d.name);
      const first = placed[0] ?? names[0];
      if (first) {
        ctx.setFocusName(first);
        ctx.focusCanvasOn(first);
      }
      return { placed, focused: first ?? null };
    },

    "erd.focus": async (args) => {
      const apiName = resolveObjectRef(ctx.objects, strArg(args, "apiName"));
      if (!ctx.describes.has(apiName)) {
        throw new Error(`${apiName} is not on the canvas - place it first with erd.place.`);
      }
      ctx.setFocusName(apiName);
      ctx.focusCanvasOn(apiName);
      return { focused: apiName };
    },

    "erd.mode": async (args) => {
      const mode = strArg(args, "mode");
      if (mode !== "erd" && mode !== "graph") {
        throw new Error(`Unknown mode "${mode}" - use "erd" or "graph".`);
      }
      ctx.setView(mode);
      return { view: mode };
    },

    "erd.filter": async (args) => {
      if (typeof args.hideSystem === "boolean") ctx.setHideSystem(args.hideSystem);
      return { hideSystem: ctx.hideSystem, filterMode: ctx.filterMode };
    },

    "erd.author_field": async (args) => {
      const childApi = resolveObjectRef(ctx.objects, strArg(args, "childApi"));
      const rawApi = strArg(args, "apiName");
      if (!rawApi) throw new Error("Field apiName is required (e.g. Customer_Tier__c).");
      const apiName = /__c$/i.test(rawApi) ? rawApi : `${rawApi}__c`;
      const rawType = strArg(args, "type") || "Text";
      const match = FIELD_TYPES.find((t) => t.toLowerCase() === rawType.toLowerCase());
      if (!match) throw new Error(`Unknown field type "${rawType}" - use one of: ${FIELD_TYPES.join(", ")}.`);
      if (!ctx.authorMode) {
        throw new Error("Author mode is off in the studio tab - switch it on before creating fields.");
      }
      const draft: FieldDraft = {
        ...defaultFieldDraft(),
        label: strArg(args, "label") || apiName.replace(/__c$/i, "").replace(/_/g, " "),
        apiName,
        type: match,
      };
      if (match === "Lookup" || match === "MasterDetail") {
        const target = strArg(args, "referenceTo");
        if (!target) throw new Error("Lookup/MasterDetail needs referenceTo (target object api name).");
        draft.referenceTo = resolveObjectRef(ctx.objects, target);
        draft.relationshipName = relationshipNameFromField(apiName);
        draft.relationshipLabel = draft.label;
      }
      if (match === "Picklist") {
        const values = strListArg(args, "picklistValues");
        if (values.length > 0) draft.picklistValues = values;
      }
      await ctx.submitAuthorField(draft, childApi);
      return { scheduled: true, childApi, apiName };
    },

    "erd.author_object": async (args) => {
      const rawApi = strArg(args, "apiName");
      if (!rawApi) throw new Error("Object apiName is required (e.g. Invoice__c).");
      const apiName = /__c$/i.test(rawApi) ? rawApi : `${rawApi}__c`;
      if (!ctx.authorMode) {
        throw new Error("Author mode is off in the studio tab - switch it on before creating objects.");
      }
      const label = strArg(args, "label") || apiName.replace(/__c$/i, "").replace(/_/g, " ");
      const draft: ObjectDraft = { ...defaultObjectDraft(), label, apiName };
      await ctx.submitAuthorObject(draft);
      return { scheduled: true, apiName };
    },
  };
}