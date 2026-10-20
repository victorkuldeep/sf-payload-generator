/**
 * Anonymous Apex via Tooling REST: the Dev Console "Execute Anonymous"
 * equivalent over GET /tooling/executeAnonymous/?anonymousBody=...
 * Runs through the existing /api/salesforce/rest proxy (org scope) -
 * no new auth, token stays in session memory.
 */

/** Past this many chars the URL-encoded GET is likely to hit server limits. */
export const APEX_WARN_CHARS = 6000;

export function toolingVersion(apiVersion: string): string {
  return apiVersion.startsWith("v") ? apiVersion : `v${apiVersion}`;
}

/** Proxy path for one anonymous execution. Caller URL-length-guards first. */
export function executeAnonymousPath(apiVersion: string, code: string): string {
  return `/services/data/${toolingVersion(apiVersion)}/tooling/executeAnonymous/?anonymousBody=${encodeURIComponent(code)}`;
}

/** Proxy path for an ApexLog debug body (plain text). */
export function apexLogBodyPath(apiVersion: string, logId: string): string {
  return `/services/data/${toolingVersion(apiVersion)}/sobjects/ApexLog/${logId.trim()}/Body`;
}

export interface ApexRunResult {
  compiled: boolean;
  success: boolean;
  line: number | null;
  column: number | null;
  compileProblem: string | null;
  exceptionMessage: string | null;
  exceptionStackTrace: string | null;
  logId: string | null;
}

/** Parse the Tooling executeAnonymous response body. Never throws. */
export function parseApexResult(body: unknown): ApexRunResult {
  const empty: ApexRunResult = {
    compiled: false,
    success: false,
    line: null,
    column: null,
    compileProblem: null,
    exceptionMessage: null,
    exceptionStackTrace: null,
    logId: null,
  };
  if (body === null || typeof body !== "object" || Array.isArray(body)) return empty;
  const b = body as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    compiled: b.compiled === true,
    success: b.success === true,
    line: num(b.line),
    column: num(b.column),
    compileProblem: str(b.compileProblem),
    exceptionMessage: str(b.exceptionMessage),
    exceptionStackTrace: str(b.exceptionStackTrace),
    logId: str(b.id),
  };
}

/** One-line human summary for history rows and notices. */
export function apexSummary(result: ApexRunResult): string {
  if (!result.compiled) {
    const where = result.line !== null ? ` (line ${result.line})` : "";
    return `Compile failed${where}: ${result.compileProblem ?? "see details"}`;
  }
  if (!result.success) return `Exception: ${result.exceptionMessage ?? "see details"}`;
  return "Executed clean";
}
