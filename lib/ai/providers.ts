import { z } from "zod";

/**
 * OpenAI-compatible provider layer for the GRAVENX agent.
 *
 * One adapter speaks to every v1 provider (OpenAI, OpenRouter, Groq,
 * DeepSeek, any custom baseURL) through the shared `/chat/completions`
 * and `/models` shapes - no per-vendor SDKs, no Node-only imports, so it
 * runs in the browser and on Cloudflare. Keys are BYOK session-only and
 * NEVER pass through our server: the browser calls providers directly.
 *
 * Endpoint shapes below are search-grounded and repo-corroborated (the
 * GROQ sample in lib/system-design/demo.ts already uses
 * https://api.groq.com + /openai/v1/chat/completions). Treat them as
 * provisional until the Phase-0 live spike confirms each preset; every
 * preset degrades to free-text model entry when its list endpoint fails.
 */

export interface ProviderPreset {
  id: string;
  label: string;
  /** Origin + version prefix, no trailing slash. Empty for custom. */
  baseURL: string;
  modelsPath: string;
  chatPath: string;
  keyLabel: string;
  keyPlaceholder: string;
  editableBaseURL: boolean;
  hint: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    keyLabel: "OpenAI API key",
    keyPlaceholder: "sk-…",
    editableBaseURL: false,
    hint: "Get a key at platform.openai.com",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    keyLabel: "OpenRouter API key",
    keyPlaceholder: "sk-or-…",
    editableBaseURL: false,
    hint: "One key routes to 300+ models - openrouter.ai/keys",
  },
  {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    keyLabel: "Groq API key",
    keyPlaceholder: "gsk_…",
    editableBaseURL: false,
    hint: "Fast inference - console.groq.com/keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    keyLabel: "DeepSeek API key",
    keyPlaceholder: "sk-…",
    editableBaseURL: false,
    hint: "Get a key at platform.deepseek.com",
  },
  {
    id: "custom",
    label: "Custom endpoint",
    baseURL: "",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    keyLabel: "API key",
    keyPlaceholder: "Bearer token",
    editableBaseURL: true,
    hint: "Any OpenAI-compatible server (Together, vLLM, Ollama cloud, …)",
  },
];

export function presetById(id: string): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[1];
}

export interface AiModelOption {
  id: string;
  label: string;
  contextLength?: number;
  promptPrice?: string;
  completionPrice?: string;
}

const openRouterPricing = z
  .object({ prompt: z.string().optional(), completion: z.string().optional() })
  .partial();
const modelEntry = z.union([
  z.string(),
  z
    .object({
      id: z.string(),
      name: z.string().optional(),
      created: z.number().optional(),
      context_length: z.number().optional(),
      contextLength: z.number().optional(),
      pricing: openRouterPricing.optional(),
    })
    .passthrough(),
]);
const modelsPayload = z.object({ data: z.array(z.unknown()) });

/** Normalize every known list shape to one picker-ready option list. */
export function normalizeModels(payload: unknown): AiModelOption[] {
  const parsed = modelsPayload.safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data.data.flatMap((raw): AiModelOption[] => {
    // One malformed entry must never poison the whole list.
    if (typeof raw === "string") return [{ id: raw, label: raw }];
    const entry = modelEntry.safeParse(raw);
    if (!entry.success || typeof entry.data !== "object") return [];
    const m = entry.data;
    if (!m.id) return [];
    return [
      {
        id: m.id,
        label: m.name ?? m.id,
        contextLength: m.context_length ?? m.contextLength,
        promptPrice: m.pricing?.prompt,
        completionPrice: m.pricing?.completion,
      },
    ];
  });
}

export interface ModelsResult {
  ok: boolean;
  models: AiModelOption[];
  error?: string;
}

function joinUrl(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, "")}${path}`;
}

function errText(e: unknown): string {
  if (e instanceof DOMException && e.name === "AbortError") return "Request timed out.";
  return e instanceof Error ? e.message : "Request failed.";
}

/** Live model discovery for the picker. Never throws - degrades to []. */
export async function fetchModels(
  baseURL: string,
  apiKey: string,
  timeoutMs = 15000,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelsResult> {
  const base = baseURL.trim().replace(/\/+$/, "");
  if (!base) return { ok: false, models: [], error: "Set the endpoint URL first." };
  if (!/^https?:\/\//i.test(base)) return { ok: false, models: [], error: "Endpoint must be an http(s) URL." };
  try {
    const res = await fetchImpl(joinUrl(base, "/models"), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, models: [], error: "Key rejected (401/403) - check the key, then type a model ID manually." };
      }
      return { ok: false, models: [], error: `List failed (${res.status}) - type a model ID manually.` };
    }
    const models = normalizeModels(await res.json());
    if (models.length === 0) {
      return { ok: false, models: [], error: "No models parsed - type a model ID manually." };
    }
    return { ok: true, models };
  } catch (e) {
    return { ok: false, models: [], error: `${errText(e)} Type a model ID manually.` };
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface StreamResult {
  ok: boolean;
  text: string;
  usage?: ChatUsage;
  error?: string;
}

const chatErrorPayload = z.object({ error: z.union([z.string(), z.object({ message: z.string() }).passthrough()]) }).partial();
const streamChoice = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string().optional() }).partial() }).partial()).optional(),
  usage: z
    .object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional(), total_tokens: z.number().optional() })
    .partial()
    .optional(),
}).partial();

/**
 * Streaming chat completion over SSE. Calls onToken per content delta and
 * resolves with the full text + usage. Aborted via signal (Stop button).
 */
export async function streamChatCompletion(args: {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  timeoutMs?: number;
  onToken: (delta: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<StreamResult> {
  const { baseURL, apiKey, model, messages, signal, timeoutMs = 120000, onToken, fetchImpl = fetch } = args;
  const base = baseURL.trim().replace(/\/+$/, "");
  if (!base) return { ok: false, text: "", error: "Set the endpoint URL first." };
  if (!model.trim()) return { ok: false, text: "", error: "Pick or type a model first." };
  let res: Response;
  try {
    res = await fetchImpl(joinUrl(base, "/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model.trim(), messages, stream: true }),
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, text: "", error: "Stopped." };
    }
    return { ok: false, text: "", error: errText(e) };
  }
  if (!res.ok || !res.body) {
    let detail = `Chat failed (${res.status}).`;
    try {
      const parsed = chatErrorPayload.safeParse(await res.json());
      const err = parsed.success ? parsed.data.error : undefined;
      if (typeof err === "string" && err) detail = err;
      else if (err && typeof err === "object" && err.message) detail = err.message;
    } catch {
      /* keep status text */
    }
    return { ok: false, text: "", error: detail };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let usage: ChatUsage | undefined;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const chunk = streamChoice.parse(JSON.parse(data));
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            onToken(delta);
          }
          const u = chunk.usage;
          if (u && (u.prompt_tokens !== undefined || u.completion_tokens !== undefined || u.total_tokens !== undefined)) {
            usage = { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens };
          }
        } catch {
          /* provider heartbeat / comment - ignore */
        }
      }
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: true, text, usage, error: undefined };
    }
    return { ok: false, text, error: errText(e) };
  } finally {
    reader.releaseLock();
  }
  return { ok: true, text, usage };
}
