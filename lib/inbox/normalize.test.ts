"use client";

import { describe, it, expect } from "vitest";
import {
  normalizeLiveNotes,
  normalizeSnapshotNotes,
  resolveStale,
  queryInbox,
  countInbox,
} from "./normalize";
import { EMPTY_QUERY } from "./types";
import type { ErdSnapshot } from "@/lib/erd/snapshotDb";

const labels = new Map([
  ["Lead", "Lead"],
  ["Quote__c", "Quote"],
]);

const liveInput = {
  orgScopeId: "org:00Dxx",
  text: "# Plan\n- [ ] Verify junction",
  updatedAt: 1000,
  todo: false,
  done: false,
  entities: {
    Lead: { text: "Check conversion", todo: true, done: false, updatedAt: 2000 },
    Quote__c: { text: "Pricing review", todo: true, done: true, updatedAt: 3000 },
    Account: { text: "Just observing", todo: false, done: false, updatedAt: 4000 },
  },
  labels,
};

const snap = (over: Partial<ErdSnapshot> = {}): ErdSnapshot => ({
  id: "s1",
  orgDomain: "x",
  name: "Lead map",
  createdAt: 500,
  root: "Lead",
  focus: "Lead",
  nodes: ["Lead"],
  positions: {},
  ...over,
});

describe("inbox normalization", () => {
  it("maps canvas markdown to a single open note", () => {
    const items = normalizeLiveNotes({ ...liveInput, text: "hello", entities: {} });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("live-canvas");
    expect(items[0].kind).toBe("note");
    expect(items[0].status).toBe("open");
  });

  it("maps the canvas TODO engine to task kind and done to resolved", () => {
    const open = normalizeLiveNotes({ ...liveInput, text: "review all", entities: {}, todo: true, done: false });
    expect(open[0].kind).toBe("task");
    expect(open[0].status).toBe("open");
    const done = normalizeLiveNotes({ ...liveInput, text: "review all", entities: {}, todo: true, done: true });
    expect(done[0].kind).toBe("task");
    expect(done[0].status).toBe("resolved");
  });

  it("skips blank canvas text and empty non-todo entities", () => {
    const items = normalizeLiveNotes({ ...liveInput, text: "  ", entities: { X: { text: "", todo: false, done: false, updatedAt: 1 } } });
    expect(items).toHaveLength(0);
  });

  it("maps todo flag to task kind and done to resolved - never invents kinds", () => {
    const items = normalizeLiveNotes(liveInput);
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("live-entity-Lead")?.kind).toBe("task");
    expect(byId.get("live-entity-Lead")?.status).toBe("open");
    expect(byId.get("live-entity-Quote__c")?.kind).toBe("task");
    expect(byId.get("live-entity-Quote__c")?.status).toBe("resolved");
    expect(byId.get("live-entity-Account")?.kind).toBe("note");
    expect(byId.get("live-entity-Account")?.status).toBe("open");
  });

  it("keeps stable deterministic ids", () => {
    const a = normalizeLiveNotes(liveInput).map((i) => i.id).sort();
    const b = normalizeLiveNotes(liveInput).map((i) => i.id).sort();
    expect(a).toEqual(b);
    expect(a).toContain("live-entity-Lead");
  });

  it("adapts snapshot notes with provenance, skips snapshots without notes", () => {
    expect(normalizeSnapshotNotes({ snapshot: snap(), orgScopeId: "o" })).toHaveLength(0);
    const items = normalizeSnapshotNotes({ snapshot: snap({ notes: "review this" }), orgScopeId: "o" });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("snap-s1");
    expect(items[0].kind).toBe("note");
    expect(items[0].provenance).toEqual({ source: "snapshot", snapshotId: "s1" });
  });

  it("resolves entity staleness against known apis, never guesses", () => {
    const ctx = { knownApis: new Set(["Lead"]), entities: new Map(), fields: new Map() };
    const items = resolveStale(normalizeLiveNotes(liveInput), ctx);
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("live-entity-Lead")?.stale).toBe("ok");
    expect(byId.get("live-entity-Quote__c")?.stale).toBe("missing");
    // canvas items stay as-is
    expect(byId.get("live-canvas")?.stale).toBe("ok");
  });

  it("marks changed when the stored fingerprint drifts from live facts", () => {
    const withFp = {
      ...liveInput,
      text: "",
      entities: {
        Lead: { text: "x", todo: false, done: false, updatedAt: 1, meta: { fingerprint: { value: "e:stale", at: 1 } } },
      },
    };
    const ctx = {
      knownApis: new Set(["Lead"]),
      entities: new Map([["Lead", { apiName: "Lead", fieldCount: 1, fieldNames: ["Id"], childNames: [] }]]),
      fields: new Map(),
    };
    const items = resolveStale(normalizeLiveNotes(withFp), ctx);
    expect(items[0].stale).toBe("changed");
  });

  it("honors explicit kind/status/owner metadata without rewriting legacy flags", () => {
    const withMeta = {
      ...liveInput,
      text: "",
      entities: {
        Lead: {
          text: "Should we?", todo: false, done: false, updatedAt: 1,
          meta: { kind: "question" as const, owner: "Asha", team: "Integ", priority: "high" as const },
        },
      },
    };
    const items = normalizeLiveNotes(withMeta);
    expect(items[0].kind).toBe("question");
    expect(items[0].status).toBe("open");
    expect(items[0].owner).toBe("Asha");
    expect(items[0].team).toBe("Integ");
    expect(items[0].history).toEqual([]);
  });

  it("filters with AND semantics, case-insensitive", () => {
    const ctx = {
      knownApis: new Set(["Lead", "Quote__c", "Account"]),
      entities: new Map(),
      fields: new Map(),
    };
    const items = resolveStale(normalizeLiveNotes(liveInput), ctx);
    expect(queryInbox(items, { ...EMPTY_QUERY, text: "lead conversion" })).toHaveLength(1);
    expect(queryInbox(items, { ...EMPTY_QUERY, kinds: ["task"] })).toHaveLength(2);
    expect(queryInbox(items, { ...EMPTY_QUERY, statuses: ["resolved"] })).toHaveLength(1);
    expect(queryInbox(items, { ...EMPTY_QUERY, text: "lead pricing" })).toHaveLength(0);
  });

  it("sorts open tasks before notes, then by recency, ties by id", () => {
    const ctx = {
      knownApis: new Set(["Lead", "Quote__c", "Account"]),
      entities: new Map(),
      fields: new Map(),
    };
    const items = resolveStale(normalizeLiveNotes(liveInput), ctx);
    const sorted = queryInbox(items, EMPTY_QUERY).map((i) => i.id);
    // open task first, then open notes (canvas note updatedAt 1000 < Account 4000)
    expect(sorted[0]).toBe("live-entity-Lead");
    expect(sorted).toContain("live-entity-Quote__c"); // resolved sorts last among its group
  });

  it("counts with the same semantics as the list", () => {
    const ctx = { knownApis: new Set(["Lead"]), entities: new Map(), fields: new Map() };
    const items = resolveStale(normalizeLiveNotes(liveInput), ctx);
    const c = countInbox(items);
    expect(c.total).toBe(4);
    expect(c.open).toBe(3);
    expect(c.tasks).toBe(2);
    expect(c.openTasks).toBe(1);
    expect(c.resolved).toBe(1);
    expect(c.stale).toBe(2); // Quote__c + Account missing from known set
  });
});
