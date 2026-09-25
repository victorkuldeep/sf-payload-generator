/**
 * Browser → Next.js API fetch with a hard timeout.
 * All Salesforce traffic goes through our proxy routes, so every client
 * call site uses this instead of raw fetch (no call ever hangs forever).
 */
export const API_TIMEOUT_MS = 30000;

export async function apiFetch(
  path: string,
  body: unknown,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${timeoutMs / 1000}s - check your connection and try again.`
      );
    }
    throw err instanceof Error ? err : new Error("Network error");
  } finally {
    window.clearTimeout(timer);
  }
}
