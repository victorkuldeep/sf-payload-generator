/**
 * POST /api/webhooks/<uuid>/<op> { token, instanceUrl, ... }
 * op: feed | claim | heartbeat | release. Forwards the raw body to the
 * uuid's inbox DO, which validates the owner session itself. On release the
 * route also drops the uuid from the caller's owner index (best-effort).
 */
import { ID_RE, doRequest, getInbox, getOwnerInbox, resolveOwnerName } from "../../../../../lib/webhooks/server";

const OPS = new Set(["feed", "claim", "heartbeat", "release"]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string; op: string }> }) {
  const { id, op } = await ctx.params;
  if (!ID_RE.test(id) || !OPS.has(op)) return Response.json({ error: "not found" }, { status: 404 });
  const raw = await req.text().catch(() => "");
  let res: Response;
  try {
    res = await getInbox(id).fetch(
      new Request(`https://webhook-inbox/${op}`, { method: "POST", headers: req.headers, body: raw })
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: String((err as Error)?.message ?? err).slice(0, 200) },
      { status: 500 }
    );
  }
  if (op === "release" && res.ok) {
    try {
      const body = JSON.parse(raw) as { token?: unknown; instanceUrl?: unknown };
      if (body?.token && body?.instanceUrl) {
        const owner = await resolveOwnerName(body.token, body.instanceUrl);
        await getOwnerInbox(owner).fetch(doRequest("release", { ...body, uuid: id }));
      }
    } catch {
      /* index cleanup is best-effort; the inbox itself is released */
    }
  }
  return res;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; op: string }> }) {
  const { op } = await ctx.params;
  if (op === "feed") {
    return Response.json({ ok: false, error: "feed requires POST with owner session" }, { status: 405 });
  }
  return Response.json({ error: "not found" }, { status: 404 });
}
