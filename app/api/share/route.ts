import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateShareStructure, newShareId, SHARE_MAX_BODY_BYTES } from "@/lib/erd/shareLink";

/**
 * Ephemeral canvas shares (Cloudflare KV, 30-min TTL).
 * Stores structure only - api names, positions, view, opt-in notes.
 * Field metadata is never sent here; receivers re-describe locally.
 */

const SHARE_TTL_SECONDS = 1800;
const KEY_PREFIX = "share:";

interface ShareKV {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export async function shareKv(): Promise<ShareKV | null> {
  // 1. Cloudflare KV binding (production on Workers/Pages).
  try {
    const { env } = await getCloudflareContext();
    const kv = (env as unknown as { SHARE_KV?: ShareKV }).SHARE_KV;
    if (kv) return kv;
  } catch {
    /* not on Cloudflare - fall through */
  }
  // 2. Future hosts plug in here behind the same ShareKV shape
  //    (e.g. Upstash Redis on Vercel). Routes never change per host.
  // 3. Local dev fallback: ephemeral in-memory store with identical TTL
  //    semantics, so the full drill works on localhost. Never prod:
  //    production without a binding must fail loudly (503), not silently
  //    store shares in a single-worker's memory.
  if (process.env.NODE_ENV !== "production") return memoryKv();
  return null;
}

// Dev-only backing store. Same contract as KV: put with TTL, lazy expiry on
// read plus timer sweep. Single dev-server process = shared instance.
const memStore = new Map<string, { value: string; expiresAt: number }>();

function memoryKv(): ShareKV {
  return {
    async get(key: string, type: "json") {
      void type;
      const entry = memStore.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        memStore.delete(key);
        return null;
      }
      try {
        return JSON.parse(entry.value) as unknown;
      } catch {
        return null;
      }
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      const ttlMs = (opts?.expirationTtl ?? SHARE_TTL_SECONDS) * 1000;
      memStore.set(key, { value, expiresAt: Date.now() + ttlMs });
      const timer = setTimeout(() => {
        if ((memStore.get(key)?.expiresAt ?? 0) <= Date.now()) memStore.delete(key);
      }, ttlMs);
      (timer as unknown as { unref?: () => void }).unref?.();
    },
  };
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
