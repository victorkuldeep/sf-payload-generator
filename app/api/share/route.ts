import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateShareStructure, newShareId, SHARE_MAX_BODY_BYTES } from "@/lib/erd/shareLink";
import { shareKv, SHARE_TTL_SECONDS } from "./store";

/**
 * Ephemeral canvas shares (Cloudflare KV, 30-min TTL).
 * Stores structure only - api names, positions, view, opt-in notes.
 * Field metadata is never sent here; receivers re-describe locally.
 */

const KEY_PREFIX = "share:";

/** Backend status probe: tells the UI whether the KV binding is live on
 * this deployment (bindings attach at deploy time - adding one in the
 * dashboard without redeploying still reads false here). */
export async function GET() {
  const kv = await shareKv();
  return NextResponse.json({ ok: true, kv: kv !== null, now: Date.now() });
}

const shareBodySchema = z.object({
  v: z.number(),
  name: z.string().max(200).optional(),
  root: z.string().min(1).max(255),
  nodes: z.array(z.string().min(1).max(255)).min(1).max(2000),
  positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
  view: z.enum(["erd", "graph"]).optional(),
  notes: z.string().max(100_000).optional(),
  entityNotes: z.record(z.string(), z.object({
    text: z.string().max(50_000),
    todo: z.boolean().optional(),
    done: z.boolean().optional(),
    updatedAt: z.number().optional(),
  })).optional(),
});

export async function POST(req: NextRequest) {
  const kv = await shareKv();
  if (!kv) {
    return NextResponse.json(
      { error: "Share backend unavailable (KV binding missing)." },
      { status: 503 }
    );
  }
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > SHARE_MAX_BODY_BYTES + 4096) {
    return NextResponse.json({ error: "Share payload too large." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = shareBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid share structure." }, { status: 400 });
  }
  const structure = validateShareStructure(parsed.data);
  if (!structure) {
    return NextResponse.json({ error: "Invalid share structure." }, { status: 400 });
  }
  const id = newShareId();
  try {
    await kv.put(`${KEY_PREFIX}${id}`, JSON.stringify(structure), {
      expirationTtl: SHARE_TTL_SECONDS,
    });
  } catch {
    return NextResponse.json({ error: "Could not store share." }, { status: 500 });
  }
  return NextResponse.json({ id, expiresInSeconds: SHARE_TTL_SECONDS });
}
