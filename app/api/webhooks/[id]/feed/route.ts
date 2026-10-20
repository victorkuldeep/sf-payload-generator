import { getCloudflareContext } from "@opennextjs/cloudflare/cloudflare-context";
/// <reference types="@cloudflare/workers-types" />

const ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Read leg (P1: open; P2 adds owner check here before forwarding).
 * GET /api/webhooks/<uuid>/feed?since=<reqId>&limit=50
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const { env } = await getCloudflareContext({ async: true });
  const inbox = (env as unknown as { WEBHOOK_INBOX: DurableObjectNamespace }).WEBHOOK_INBOX;
  const stub: DurableObjectStub = inbox.get(inbox.idFromName(id));
  return stub.fetch(req);
}
