import { DurableObject } from "cloudflare:workers";

/**
 * One live webhook inbox per uuid. Receives arbitrary POSTs, keeps the last
 * 100, serves them back to the owning tab, and self-destructs past TTL.
 * Sending is open; viewing is gated one layer up (Next route, P2).
 */

export interface WebhookCapture {
  reqId: string;
  at: number;
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  bodyText: string;
  size: number;
  truncated: boolean;
}

interface InboxMeta {
  owner: string | null;
  expiresAt: number;
  received: number;
  throttled: number;
  windowStart: number;
  windowCount: number;
  order: string[];
}

interface WebhookEnv {
  WEBHOOK_INBOX: DurableObjectNamespace;
}

const MAX_REQUESTS = 100;
const MAX_BODY_BYTES = 1024 * 1024;
const MIRROR_BODY_CHARS = 65536;
const BURST = 20;
const WINDOW_MS = 60_000;
const TTL_MS = 7 * 24 * 3600 * 1000;

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
]);

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (data: unknown, status = 200, extra?: Record<string, string>): Response =>
  Response.json(data, { status, headers: { ...CORS, ...(extra ?? {}) } });

const freshMeta = (now: number): InboxMeta => ({
  owner: null,
  expiresAt: 0,
  received: 0,
  throttled: 0,
  windowStart: now,
  windowCount: 0,
  order: [],
});

export class WebhookInbox extends DurableObject<WebhookEnv> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const seg = url.pathname.split("/").filter(Boolean);
    // /api/webhooks/<uuid>[/feed]
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method === "POST" && seg.length >= 3 && seg[1] === "webhooks") {
      return this.receive(request, "/" + seg.slice(3).join("/"), url);
    }
    if (seg.length >= 4 && seg[1] === "webhooks" && seg[3] === "feed") {
      return this.feed(url);
    }
    if (request.method === "GET") {
      return json({ ok: true, hint: "POST here to capture a request" });
    }
    return json({ error: "not found" }, 404);
  }

  async alarm(): Promise<void> {
    const meta = await this.ctx.storage.get<InboxMeta>("meta");
    if (!meta || Date.now() > meta.expiresAt) {
      await this.ctx.storage.deleteAll();
    }
  }

  private async readMeta(): Promise<InboxMeta> {
    const meta = await this.ctx.storage.get<InboxMeta>("meta");
    return meta ?? freshMeta(Date.now());
  }

  private async writeMeta(meta: InboxMeta): Promise<void> {
    await this.ctx.storage.put("meta", meta);
    if (meta.expiresAt > 0) {
      await this.ctx.storage.setAlarm(meta.expiresAt);
    }
  }

  private async receive(request: Request, subPath: string, url: URL): Promise<Response> {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return json({ ok: false, error: "payload too large" }, 413);
    }
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (request.body) {
      const reader = request.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => {});
          return json({ ok: false, error: "payload too large" }, 413);
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }

    const now = Date.now();
    const meta = await this.readMeta();
    if (now - meta.windowStart > WINDOW_MS) {
      meta.windowStart = now;
      meta.windowCount = 0;
    }
    meta.windowCount += 1;
    if (meta.windowCount > BURST) {
      meta.throttled += 1;
      await this.writeMeta(meta);
      return json({ ok: false, error: "throttled" }, 429, { "Retry-After": "60" });
    }
    if (!meta.expiresAt) {
      meta.expiresAt = now + TTL_MS;
    }

    const text = new TextDecoder().decode(bytes);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (!SENSITIVE_HEADERS.has(key.toLowerCase()) && key.length < 128 && value.length < 8192) {
        headers[key] = value;
      }
    });
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      if (key.length < 256 && value.length < 8192) query[key] = value;
    });
    const rec: WebhookCapture = {
      reqId: crypto.randomUUID(),
      at: now,
      method: request.method,
      path: subPath || "/",
      headers,
      query,
      bodyText: text.slice(0, MIRROR_BODY_CHARS),
      size,
      truncated: text.length > MIRROR_BODY_CHARS,
    };
    await this.ctx.storage.put(`req:${rec.reqId}`, rec);
    meta.order.push(rec.reqId);
    while (meta.order.length > MAX_REQUESTS) {
      const oldest = meta.order.shift();
      if (oldest) await this.ctx.storage.delete(`req:${oldest}`);
    }
    meta.received += 1;
    await this.writeMeta(meta);
    return json({ ok: true, id: rec.reqId });
  }

  private async feed(url: URL): Promise<Response> {
    const since = url.searchParams.get("since");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
    const meta = await this.readMeta();
    const order = meta.order;
    let ids: string[];
    let hasMore: boolean;
    if (since) {
      const start = order.indexOf(since) + 1;
      ids = order.slice(start, start + limit);
      hasMore = start + ids.length < order.length;
    } else {
      ids = order.slice(-limit);
      hasMore = order.length > limit;
    }
    const rows = ids.length > 0 ? await this.ctx.storage.get<WebhookCapture>(ids.map((id) => `req:${id}`)) : new Map();
    const requests = ids
      .map((id) => rows.get(`req:${id}`))
      .filter((r): r is WebhookCapture => r !== undefined);
    return json({ ok: true, requests, hasMore, expiresAt: meta.expiresAt });
  }
}
