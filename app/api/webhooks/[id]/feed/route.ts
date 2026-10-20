import { getCloudflareContext } from "@opennextjs/cloudflare/cloudflare-context";
import type { WebhookInboxNamespace } from "../../../../../durable-objects/binding";

const ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Read leg (P1: open; P2 adds owner check here before forwarding).
 * GET /api/webhooks/<uuid>/feed?since=<reqId>&limit=50
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  try {
    const { env } = getCloudflareContext();
    const inbox = (env as unknown as { WEBHOOK_INBOX: WebhookInboxNamespace }).WEBHOOK_INBOX;
    const stub = inbox.getByName(id);
    return await stub.fetch(req);
  } catch (err) {
    return Response.json({ ok: false, error: String((err as Error)?.message ?? err).slice(0, 200) }, { status: 500 });
  }
}
