import { getCloudflareContext } from "@opennextjs/cloudflare/cloudflare-context";
/// <reference types="@cloudflare/workers-types" />

const ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

async function inboxFor(id: string): Promise<DurableObjectStub> {
  const { env } = await getCloudflareContext({ async: true });
  const inbox = (env as unknown as { WEBHOOK_INBOX: DurableObjectNamespace }).WEBHOOK_INBOX;
  return inbox.get(inbox.idFromName(id));
}

/** Open receive leg: any sender POSTs here, the uuid's DO stores it. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const stub = await inboxFor(id);
  return stub.fetch(req);
}

/** Browser sanity check: forwards to the DO hint. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const stub = await inboxFor(id);
  return stub.fetch(req);
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
