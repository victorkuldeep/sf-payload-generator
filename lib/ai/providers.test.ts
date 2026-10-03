import { describe, expect, it, vi } from "vitest";
import { fetchModels, normalizeModels, presetById, PROVIDER_PRESETS, streamChatCompletion } from "./providers";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("provider presets", () => {
  it("ships the v1 preset table with a custom slot", () => {
    expect(PROVIDER_PRESETS.map((p) => p.id)).toEqual(["openai", "openrouter", "groq", "deepseek", "custom"]);
    expect(presetById("nope").id).toBe("openrouter");
  });
});

describe("normalizeModels", () => {
  it("handles object entries, string entries and OpenRouter extras", () => {
    const out = normalizeModels({
      data: [
        { id: "a/b", name: "B", context_length: 128000, pricing: { prompt: "0.1", completion: "0.2" } },
        "plain-id",
        { nope: true },
      ],
    });
    expect(out).toEqual([
      { id: "a/b", label: "B", contextLength: 128000, promptPrice: "0.1", completionPrice: "0.2" },
      { id: "plain-id", label: "plain-id", contextLength: undefined, promptPrice: undefined, completionPrice: undefined },
    ]);
  });

  it("rejects garbage payloads to []", () => {
    expect(normalizeModels(null)).toEqual([]);
    expect(normalizeModels({ data: "x" })).toEqual([]);
  });
});

describe("fetchModels", () => {
  it("lists models on 200", async () => {
    const seen: { url: unknown; init: unknown }[] = [];
    const fetchImpl = (async (url: unknown, init: unknown) => {
      seen.push({ url, init });
      return jsonResponse({ data: [{ id: "m1" }] });
    }) as unknown as typeof fetch;
    const r = await fetchModels("https://x.test/v1", "k", 5000, fetchImpl);
    expect(r.ok).toBe(true);
    expect(r.models).toEqual([{ id: "m1", label: "m1", contextLength: undefined, promptPrice: undefined, completionPrice: undefined }]);
    expect(seen).toHaveLength(1);
    expect(String(seen[0].url)).toBe("https://x.test/v1/models");
  });

  it("degrades with a manual-entry hint on 401", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "bad key" }, 401));
    const r = await fetchModels("https://x.test/v1", "bad", 5000, fetchImpl as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.models).toEqual([]);
    expect(r.error).toMatch(/manually/);
  });

  it("rejects non-http endpoints without fetching", async () => {
    const fetchImpl = vi.fn();
    const r = await fetchModels("ftp://x", "k", 5000, fetchImpl as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("streamChatCompletion", () => {
  const sse = [
    `data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n`,
    `data: {"choices":[{"delta":{"content":" there"}}]}\n\n`,
    `data: {"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n`,
    "data: [DONE]\n\n",
  ];

  it("assembles deltas and usage", async () => {
    const seen: { url: unknown; init: { body?: unknown } }[] = [];
    const fetchImpl = (async (url: unknown, init: { body?: unknown }) => {
      seen.push({ url, init });
      return sseResponse(sse);
    }) as unknown as typeof fetch;
    const seenTokens: string[] = [];
    const r = await streamChatCompletion({
      baseURL: "https://x.test/v1",
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      onToken: (d) => seenTokens.push(d),
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(r.text).toBe("Hello there");
    expect(seenTokens).toEqual(["Hello", " there"]);
    expect(r.usage).toEqual({ promptTokens: 5, completionTokens: 2, totalTokens: 7 });
    const body = JSON.parse(String(seen[0].init.body ?? "{}"));
    expect(body).toMatchObject({ model: "m", stream: true });
  });

  it("surfaces provider error text", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: "nope" } }, 429));
    const r = await streamChatCompletion({
      baseURL: "https://x.test/v1",
      apiKey: "k",
      model: "m",
      messages: [],
      onToken: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("nope");
  });

  it("requires a model", async () => {
    const fetchImpl = vi.fn();
    const r = await streamChatCompletion({
      baseURL: "https://x.test/v1",
      apiKey: "k",
      model: "  ",
      messages: [],
      onToken: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
