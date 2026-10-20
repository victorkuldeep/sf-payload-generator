// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { WebhookInbox, type WebhookStorage } from "../../durable-objects/webhook-inbox";

const UUID = "test-inbox-uuid-1";
const OWNER_URL = "https://acme.test";

function memoryStorage(): WebhookStorage {
  const kv = new Map<string, unknown>();
  return {
    async get(key: string | string[]) {
      if (Array.isArray(key)) {
        const m = new Map<string, unknown>();
        for (const k of key) if (kv.has(k)) m.set(k, kv.get(k));
        return m as never;
      }
      return kv.get(key) as never;
    },
    async put(key: string, value: unknown) {
      kv.set(key, value);
    },
    async delete(key: string | string[]) {
      if (Array.isArray(key)) {
        let n = 0;
        for (const k of key) if (kv.delete(k)) n += 1;
        return n;
      }
      return kv.delete(key);
    },
    async deleteAll() {
      kv.clear();
    },
    async setAlarm() {},
  };
}

function inbox() {
  return new WebhookInbox({ storage: memoryStorage(), id: { name: UUID } });
}

function post(path: string, body: unknown, headers?: Record<string, string>): Request {
  return new Request(`https://do.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers ?? {}) },
    body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
  });
}

function userinfoAs(org: string, user: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ organization_id: org, user_id: user }),
    }))
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("WebhookInbox receive leg", () => {
  it("rejects captures on unregistered uuids - register first", async () => {
    const box = inbox();
    const res = await box.fetch(post(`/api/webhooks/${UUID}/orders`, { a: 1 }));
    expect(res.status).toBe(404);
  });

  it("returns a fixed tiny envelope and strips sensitive headers", async () => {
    userinfoAs("org1", "user1");
    const box = inbox();
    await box.fetch(post(`/api/webhooks/${UUID}/claim`, { token: "t", instanceUrl: OWNER_URL }));
    const res = await box.fetch(
      post(`/api/webhooks/${UUID}/orders`, { a: 1 }, { "X-Custom": "kept", Authorization: "Bearer s3cret", Cookie: "sid=1" })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(["id", "ok"]);
    expect(data.ok).toBe(true);

    const feed = await box.fetch(post(`/api/webhooks/${UUID}/feed`, { token: "t", instanceUrl: OWNER_URL }));
    const seen = (await feed.json()) as {
      requests: { headers: Record<string, string> }[];
    };
    const headers = seen.requests[0].headers;
    expect(headers["x-custom"]).toBe("kept");
    expect("authorization" in headers).toBe(false);
    expect("cookie" in headers).toBe(false);
  });

  it("keeps only the last 100 requests", async () => {
    userinfoAs("org1", "user1");
    const storage = memoryStorage();
    const box = new WebhookInbox({ storage, id: { name: UUID } });
    // Seed 105 stored requests (bypasses the burst guard - purge is separate).
    const order: string[] = [];
    for (let i = 0; i < 105; i += 1) {
      const id = `seed-${i}`;
      order.push(id);
      await storage.put(`req:${id}`, {
        reqId: id, at: i, method: "POST", path: "/", headers: {}, query: {}, bodyText: "{}", size: 2, truncated: false,
      });
    }
    await storage.put("meta", {
      owner: "org1:user1", expiresAt: Date.now() + 100000, received: 105,
      throttled: 0, windowStart: Date.now(), windowCount: 0, order, name: "n", lastAt: 0,
    });
    const res = await box.fetch(post(`/api/webhooks/${UUID}`, { fresh: true }));
    expect(res.status).toBe(200);
    const feed = await box.fetch(post(`/api/webhooks/${UUID}/feed`, { token: "t", instanceUrl: OWNER_URL, limit: 200 }));
    const data = (await feed.json()) as { ok: boolean; requests: { reqId: string }[]; hasMore: boolean };
    expect(feed.status).toBe(200);
    expect(data.requests).toHaveLength(100);
    expect(data.hasMore).toBe(false);
    // Oldest six purged: seed-6 is now the oldest survivor.
    expect(data.requests[0].reqId).toBe("seed-6");
  });
});

describe("WebhookInbox owner gating", () => {
  it("rejects feed without a session and after claim serves only the owner", async () => {
    const box = inbox();
    const noAuth = await box.fetch(post(`/api/webhooks/${UUID}/feed`, {}));
    expect(noAuth.status).toBe(401);

    userinfoAs("org1", "user1");
    const claim = await box.fetch(post(`/api/webhooks/${UUID}/claim`, { token: "t", instanceUrl: OWNER_URL, name: "n" }));
    expect(claim.status).toBe(200);

    const mine = await box.fetch(post(`/api/webhooks/${UUID}/feed`, { token: "t", instanceUrl: OWNER_URL }));
    expect(mine.status).toBe(200);

    userinfoAs("org1", "intruder");
    const theirs = await box.fetch(post(`/api/webhooks/${UUID}/feed`, { token: "x", instanceUrl: OWNER_URL }));
    expect(theirs.status).toBe(404);
  });

  it("rejects management when the session is expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 401, ok: false, json: async () => ({}) }))
    );
    const box = inbox();
    const res = await box.fetch(post(`/api/webhooks/${UUID}/claim`, { token: "dead", instanceUrl: OWNER_URL }));
    expect(res.status).toBe(401);
  });
});
