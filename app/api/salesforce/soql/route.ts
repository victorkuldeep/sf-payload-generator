import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeSalesforceUrl } from "@/lib/salesforce/url";
import { sfTimeoutSignal, isAbortError, sfTimeoutMessage } from "@/lib/salesforce/client";

const schema = z.object({
  instanceUrl: z.string().min(1),
  token: z.string().min(1),
  apiVersion: z.string().min(1),
  soql: z.string().min(1).max(20000),
  tooling: z.boolean().optional().default(false),
  allRows: z.boolean().optional().default(false),
});

// Auto-pagination guard: 2000 rows/page × 10 pages = 20k rows max per run.
const MAX_PAGES = 10;

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

  const { instanceUrl, token, apiVersion, soql, tooling, allRows } = parsed.data;

  if (tooling && allRows) {
    return NextResponse.json(
      { error: "Deleted/archived rows (queryAll) are not supported with the Tooling API." },
      { status: 400 }
    );
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeSalesforceUrl(instanceUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid instance URL" },
      { status: 400 }
    );
  }

  const ver = apiVersion.startsWith("v") ? apiVersion : `v${apiVersion}`;
  const op = tooling ? "tooling/query" : allRows ? "queryAll" : "query";
  let nextUrl: string | null = `${normalizedUrl}/services/data/${ver}/${op}?q=${encodeURIComponent(soql)}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  const startTime = Date.now();
  const records: unknown[] = [];
  let totalSize = 0;
  let done = true;
  let pages = 0;

  try {
    while (nextUrl && pages < MAX_PAGES) {
      // nextRecordsUrl is org-relative - resolve against the instance origin
      const url = nextUrl.startsWith("http")
        ? nextUrl
        : `${normalizedUrl}${nextUrl.startsWith("/") ? "" : "/"}${nextUrl}`;
      const response: Response = await fetch(url, { headers, signal: sfTimeoutSignal() });
      if (!response.ok) {
        let message = `${response.status} ${response.statusText}`;
        try {
          const errBody = (await response.json()) as Array<{ message: string }> | { message: string };
          const first = Array.isArray(errBody) ? errBody[0] : errBody;
          if (first?.message) message = first.message;
        } catch {
          /* ignore */
        }
        return NextResponse.json({ error: message }, { status: response.status });
      }
      const page = (await response.json()) as {
        totalSize: number;
        done: boolean;
        records?: unknown[];
        nextRecordsUrl?: string;
      };
      totalSize = page.totalSize;
      done = page.done;
      if (Array.isArray(page.records)) records.push(...page.records);
      pages += 1;
      nextUrl = !page.done && page.nextRecordsUrl ? page.nextRecordsUrl : null;
    }
  } catch (err) {
    if (isAbortError(err)) {
      return NextResponse.json({ error: sfTimeoutMessage(), success: false }, { status: 504 });
    }
    return NextResponse.json(
      { error: `Network error: ${err instanceof Error ? err.message : "unknown"}`, success: false },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    records,
    totalSize,
    done,
    truncated: !done,
    pages,
    responseTime: Date.now() - startTime,
  });
}
