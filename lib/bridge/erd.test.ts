import { describe, expect, it, vi } from "vitest";
import {
  buildErdBridgeHandlers,
  ERD_BRIDGE_KINDS,
  resolveObjectRef,
  type ErdBridgeContext,
} from "./erd";
import type { SalesforceDescribeResult, SalesforceField } from "../salesforce/types";

function describeOf(
  name: string,
  parents: { field: string; to: string; label?: string }[] = [],
  children: { child: string; via?: string }[] = [],
): SalesforceDescribeResult {
  return {
    name,
    label: `${name} Label`,
    labelPlural: `${name} Labels`,
    custom: name.endsWith("__c"),
    createable: true,
    updateable: true,
    fields: parents.map((p): SalesforceField => ({
      name: p.field,
      label: p.field,
      type: "reference",
      length: 18,
      precision: 0,
      scale: 0,
      nillable: true,
      createable: true,
      updateable: true,
      calculated: false,
      defaultedOnCreate: false,
      unique: false,
      externalId: false,
      referenceTo: [p.to],
      relationshipName: p.label ?? null,
      picklistValues: [],
      restrictedPicklist: false,
      autoNumber: false,
      idLookup: false,
      filterable: true,
      sortable: true,
      groupable: false,
      nameField: false,
      htmlFormatted: false,
      deprecatedAndHidden: false,
      digits: 0,
      byteLength: 18,
      inlineHelpText: null,
      defaultValue: null,
      soapType: "xsd:string",
    })),
    childRelationships: children.map((c) => ({
      childSObject: c.child,
      field: c.via ?? "ParentId",
      relationshipName: `${c.child}List`,
      cascadeDelete: false,
    })),
  };
}

function setupCtx(): ErdBridgeContext & {
  calls: { focus: string[]; views: string[]; hides: boolean[]; fieldDrafts: { childApi: string; apiName: string }[]; objectDrafts: string[] };
} {
  const calls = { focus: [] as string[], views: [] as string[], hides: [] as boolean[], fieldDrafts: [] as { childApi: string; apiName: string }[], objectDrafts: [] as string[] };
  const account = describeOf("Account", [], [{ child: "Contact", via: "AccountId" }]);
  const contact = describeOf("Contact", [{ field: "AccountId", to: "Account", label: "Account" }], []);
  const ctx: ErdBridgeContext = {
    objects: [
      { name: "Account", label: "Account" },
      { name: "Contact", label: "Contact" },
      { name: "Custom__c", label: "Custom Thing" },
    ],
    describes: new Map([["Account", account]]),
    rootName: "Account",
    focusName: "Account",
    view: "erd",
    hideSystem: false,
    filterMode: "all",
    authorMode: true,
    nodePositions: () => ({ Account: { x: 10, y: 20 } }),
    focusCanvasOn: (name) => { calls.focus.push(name); },
    setFocusName: () => {},
    setView: (v) => { ctx.view = v; calls.views.push(v); },
    setHideSystem: (hide) => { ctx.hideSystem = hide; calls.hides.push(hide); },
    addNames: async (names) => {
      const fresh = names.map((n) => (n === "Contact" ? contact : describeOf(n)));
      for (const d of fresh) ctx.describes.set(d.name, d);
      return fresh;
    },
    describeCached: async (name) => ctx.describes.get(name) ?? (name === "Contact" ? contact : null),
    submitAuthorField: async (draft, childApi) => {
      calls.fieldDrafts.push({ childApi, apiName: draft.apiName });
    },
    submitAuthorObject: async (draft) => {
      calls.objectDrafts.push(draft.apiName);
    },
  };
  return Object.assign(ctx, { calls });
}

describe("resolveObjectRef", () => {
  const objects = [
    { name: "Account", label: "Account" },
    { name: "Contact", label: "Contact" },
    { name: "Custom__c", label: "Custom Thing" },
  ];
  it("prefers exact api name, case-insensitive", () => {
    expect(resolveObjectRef(objects, "account")).toBe("Account");
  });
  it("falls back to exact label", () => {
    expect(resolveObjectRef(objects, "Custom Thing")).toBe("Custom__c");
  });
  it("auto-resolves a single substring hit", () => {
    expect(resolveObjectRef(objects, "cont")).toBe("Contact");
  });
  it("throws unknown for no match", () => {
    expect(() => resolveObjectRef(objects, "Nope__c")).toThrow(/Unknown object/);
  });
  it("throws ambiguous listing candidates", () => {
    expect(() => resolveObjectRef(objects, "c")).toThrow(/Ambiguous object/);
  });
});

describe("erd bridge handlers", () => {
  it("registers all 9 protocol kinds", () => {
    const handlers = buildErdBridgeHandlers(setupCtx());
    for (const kind of ERD_BRIDGE_KINDS) expect(handlers[kind]).toBeTypeOf("function");
    expect(ERD_BRIDGE_KINDS).toHaveLength(9);
  });

  it("ping reports protocol v1", async () => {
    const data = await buildErdBridgeHandlers(setupCtx())["bridge.ping"]!({});
    expect(data).toMatchObject({ ok: true, protocol: 1 });
  });

  it("snapshot lists on-canvas nodes with positions, focus and filters", async () => {
    const data = (await buildErdBridgeHandlers(setupCtx())["erd.snapshot"]!({})) as {
      nodes: { apiName: string; position: { x: number; y: number } | null }[];
      focus: string;
      view: string;
      links: { source: string; target: string; relation: string }[];
    };
    expect(data.nodes.map((n) => n.apiName)).toEqual(["Account"]);
    expect(data.nodes[0].position).toEqual({ x: 10, y: 20 });
    expect(data.focus).toBe("Account");
    expect(data.view).toBe("erd");
    expect(data.links).toEqual([
      { source: "Account", target: "Contact", label: "ContactList", relation: "child" },
    ]);
  });

  it("discover reports parents/children with on-canvas flags", async () => {
    const handlers = buildErdBridgeHandlers(setupCtx());
    const kids = (await handlers["erd.discover"]!({ apiName: "Account", direction: "children" })) as {
      children: { apiName: string; onCanvas: boolean }[];
    };
    expect(kids.children).toEqual([
      expect.objectContaining({ apiName: "Contact", onCanvas: false }),
    ]);
    const pars = (await handlers["erd.discover"]!({ apiName: "Contact", direction: "parents" })) as {
      parents: { apiName: string; viaField: string; onCanvas: boolean }[];
    };
    expect(pars.parents).toEqual([
      { apiName: "Account", viaField: "AccountId", label: "Account", onCanvas: true },
    ]);
  });

  it("discover rejects unknown objects without hitting the org", async () => {
    const handlers = buildErdBridgeHandlers(setupCtx());
    await expect(handlers["erd.discover"]!({ apiName: "Nope__c" })).rejects.toThrow(/Unknown object/);
  });

  it("place resolves refs then focuses the first placed node", async () => {
    const ctx = setupCtx();
    const out = (await buildErdBridgeHandlers(ctx)["erd.place"]!({ apiNames: ["contact"] })) as {
      placed: string[];
      focused: string;
    };
    expect(out.placed).toEqual(["Contact"]);
    expect(out.focused).toBe("Contact");
    expect(ctx.calls.focus).toEqual(["Contact"]);
    expect(ctx.describes.has("Contact")).toBe(true);
  });

  it("place refuses an empty list", async () => {
    await expect(buildErdBridgeHandlers(setupCtx())["erd.place"]!({ apiNames: [] })).rejects.toThrow(
      /at least one/,
    );
  });

  it("focus requires the node to be on canvas", async () => {
    const ctx = setupCtx();
    await expect(buildErdBridgeHandlers(ctx)["erd.focus"]!({ apiName: "Contact" })).rejects.toThrow(
      /not on the canvas/,
    );
    const out = (await buildErdBridgeHandlers(ctx)["erd.focus"]!({ apiName: "Account" })) as { focused: string };
    expect(out.focused).toBe("Account");
    expect(ctx.calls.focus).toEqual(["Account"]);
  });

  it("mode and filter switch live view state", async () => {
    const ctx = setupCtx();
    const handlers = buildErdBridgeHandlers(ctx);
    await handlers["erd.mode"]!({ mode: "graph" });
    expect(ctx.calls.views).toEqual(["graph"]);
    await expect(handlers["erd.mode"]!({ mode: "bogus" })).rejects.toThrow(/mode/);
    const f = (await handlers["erd.filter"]!({ hideSystem: true })) as { hideSystem: boolean };
    expect(f.hideSystem).toBe(true);
    expect(ctx.calls.hides).toEqual([true]);
  });

  it("author_field builds a draft and routes through submit", async () => {
    const ctx = setupCtx();
    const out = (await buildErdBridgeHandlers(ctx)["erd.author_field"]!({
      childApi: "Account",
      apiName: "Tier__c",
      label: "Tier",
      type: "Picklist",
    })) as { scheduled: boolean };
    expect(out.scheduled).toBe(true);
    expect(ctx.calls.fieldDrafts).toEqual([{ childApi: "Account", apiName: "Tier__c" }]);
  });

  it("author_field rejects bad types and missing parents", async () => {
    const ctx = setupCtx();
    const handlers = buildErdBridgeHandlers(ctx);
    await expect(
      handlers["erd.author_field"]!({ childApi: "Account", apiName: "X__c", type: "Hyperdrive" }),
    ).rejects.toThrow(/Unknown field type/);
    await expect(handlers["erd.author_field"]!({ childApi: "Nope__c", apiName: "X__c" })).rejects.toThrow(
      /Unknown object/,
    );
  });

  it("author_object drafts default labels from the api name", async () => {
    const ctx = setupCtx();
    const out = (await buildErdBridgeHandlers(ctx)["erd.author_object"]!({ apiName: "Invoice__c" })) as {
      scheduled: boolean;
    };
    expect(out.scheduled).toBe(true);
    expect(ctx.calls.objectDrafts).toEqual(["Invoice__c"]);
  });

  it("routes the draft verbatim into submitAuthorObject", async () => {
    const ctx = setupCtx();
    const spy = vi.spyOn(ctx, "submitAuthorObject").mockResolvedValue(undefined);
    const out = (await buildErdBridgeHandlers(ctx)["erd.author_object"]!({
      apiName: "Invoice__c",
      label: "Invoice",
    })) as { scheduled: boolean; apiName: string };
    expect(out).toEqual({ scheduled: true, apiName: "Invoice__c" });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toMatchObject({ apiName: "Invoice__c", label: "Invoice" });
  });
});