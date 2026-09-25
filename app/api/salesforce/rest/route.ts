import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeSalesforceUrl } from "@/lib/salesforce/url";
import { sfTimeoutSignal, isAbortError, sfTimeoutMessage } from "@/lib/salesforce/client";

const headerSchema = z.object({
  key: z.string().min(1).max(64),
  value: z.string().max(2000),
});

// Headers the proxy owns - never accepted from the client.
const BLOCKED_HEADERS = new Set([
  "authorization",
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "expect",
  "trailer",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
]);

const schema = z.object({
  instanceUrl: z.string().min(1),
  token: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  // Locked to the connected org's services tree - no open redirects.
  path: z
    .string()
    .min(1)
    .max(2000)
    .refine((p) => p.startsWith("/services/"), "Path must start with /services/"),
  headers: z.array(headerSchema).max(10).optional().default([]),
  body: z.string().max(1000000).optional().default(""),
});

const SAFE_RESPONSE_HEADERS = new Set([
  "content-type",
  "x-sfdc-request-id",
  "x-restforce-limit-info",
  "sforce-limit-info",
  "date",
]);

const MAX_BODY_CHARS = 1500000;

/** Encode query-string special chars (spaces etc.) while keeping the path intact. */
function encodePath(path: string): string {
  const q = path.indexOf("?");
  if (q === -1) return path;
  return path.slice(0, q) + "?" + encodeURI(path.slice(q + 1));
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { instanceUrl, token, method, path, headers, body: reqBody } = parsed.data;

  let origin: string;
  try {
    origin = new URL(normalizeSalesforceUrl(instanceUrl)).origin;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid instance URL" },
      { status: 400 }
    );
  }

  const endpoint = `${origin}${encodePath(path)}`;

  if (method !== "GET" && reqBody && reqBody.trim() !== "") {
    try {
      JSON.parse(reqBody);
    } catch {
      return NextResponse.json(
        { error: "Request body is not valid JSON." },
        { status: 400 }
      );
    }
  }

  const outHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (method !== "GET") {
    outHeaders["Content-Type"] = "application/json";
  }
  for (const h of headers) {
    if (!BLOCKED_HEADERS.has(h.key.toLowerCase())) {
      outHeaders[h.key] = h.value;
    }
  }

  const startTime = Date.now();
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method,
      headers: outHeaders,
      body: method === "GET" ? undefined : reqBody || undefined,
      signal: sfTimeoutSignal(),
    });
  } catch (err) {
    if (isAbortError(err)) {
      return NextResponse.json({ error: sfTimeoutMessage(), success: false }, { status: 504 });
    }
    return NextResponse.json(
      { error: `Network error: ${err instanceof Error ? err.message : "unknown"}`, success: false },
      { status: 502 }
    );
  }

  const responseTime = Date.now() - startTime;

  const safeHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase())) {
      safeHeaders[key] = value;
    }
  });

  let responseBody: unknown = null;
  let truncated = false;
  const contentType = response.headers.get("content-type") ?? "";
  try {
    const text = await response.text();
    if (text.length > MAX_BODY_CHARS) {
      responseBody = text.slice(0, MAX_BODY_CHARS);
      truncated = true;
    } else if (contentType.includes("application/json") && text) {
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text;
      }
    } else {
      responseBody = text;
    }
  } catch {
    responseBody = null;
  }

  return NextResponse.json({
    success: response.ok,
    status: response.status,
    statusText: response.statusText,
    responseTime,
    body: responseBody,
    truncated,
    headers: safeHeaders,
    endpoint,
  });
}
