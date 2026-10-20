import { getCloudflareContext } from "@opennextjs/cloudflare/cloudflare-context";
import type { WebhookInboxNamespace } from "../../../../durable-objects/binding";

const ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

function inboxFor(id: string) {
  const { env } = getCloudflareContext();
  const inbox = (env as unknown as { WEBHOOK_INBOX: WebhookInboxNamespace }).WEBHOOK_INBOX;
  return inbox.getByName(id);
}

/** Open receive leg: any sender POSTs here, the uuid's DO stores it. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  try {
    const stub = inboxFor(id);
    return await stub.fetch(req);
  } catch (err) {
    return Response.json({ ok: false, error: String((err as Error)?.message ?? err).slice(0, 200) }, { status: 500 });
  }
}

/** Browser sanity check: forwards to the DO hint. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  try {
    const stub = inboxFor(id);
    return await stub.fetch(req);
  } catch (err) {
    return Response.json({ ok: false, error: String((err as Error)?.message ?? err).slice(0, 200) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}
