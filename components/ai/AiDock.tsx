"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Button from "../ui/Button";
import {
  fetchModels,
  presetById,
  streamChatCompletion,
  PROVIDER_PRESETS,
  type AiModelOption,
  type ChatMessage,
  type ChatUsage,
} from "@/lib/ai/providers";
import { getProviderKey, setProviderKey, clearProviderKeys } from "@/lib/ai/keyVault";
import { skillForPath } from "@/lib/ai/skills";
import { runAgentLoop } from "@/lib/ai/tools";
import { toolsForSkill } from "@/lib/ai/toolsSystem";

interface Turn extends ChatMessage {
  usage?: ChatUsage;
  error?: string;
}

/**
 * GRAVENX agent dock (Phase 1: advisor mode). Global floating button +
 * right-side panel: BYOK provider key (tab-session only), live model
 * picker via each provider's list endpoint, streaming chat with the
 * active tab's skill pack as the system prompt. No tools yet - the agent
 * advises in words; the human acts. Keys never leave the browser except
 * straight to the chosen provider.
 */
export function AiDock() {
  const pathname = usePathname() ?? "/";
  const skill = useMemo(() => skillForPath(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState("openrouter");
  const [customBase, setCustomBase] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [modelsState, setModelsState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelId, setModelId] = useState("");
  const [customModel, setCustomModel] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<ChatUsage | null>(null);
  const [totals, setTotals] = useState({ in: 0, out: 0 });
  const [trace, setTrace] = useState<string[]>([]);
  const [approval, setApproval] = useState<{ label: string; tool: string; resolve: (d: "apply" | "discard") => void } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const shownRef = useRef(0);
  const flushRef = useRef<{ acc: string; timer: ReturnType<typeof setInterval> | null }>({ acc: "", timer: null });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const preset = presetById(providerId);
  const baseURL = providerId === "custom" ? customBase : preset.baseURL;

  useEffect(() => {
    setKeyInput(getProviderKey(providerId));
    setKeySaved(getProviderKey(providerId) !== "");
    setModels([]);
    setModelId("");
    setCustomModel(false);
    setModelsState("idle");
    setModelsError(null);
  }, [providerId]);

  const loadModels = useCallback(async () => {
    const key = getProviderKey(providerId);
    if (!key) {
      setModelsError("Save a key first - the list endpoint needs it.");
      return;
    }
    setModelsState("loading");
    setModelsError(null);
    const r = await fetchModels(baseURL, key);
    if (r.ok) {
      setModels(r.models);
      setModelsState("ok");
      setModelId((cur) => (cur && r.models.some((m) => m.id === cur) ? cur : (r.models[0]?.id ?? "")));
    } else {
      setModels([]);
      setModelsState("error");
      setModelsError(r.error ?? "List failed.");
    }
  }, [providerId, baseURL]);

  useEffect(() => {
    if (open && keySaved && modelsState === "idle" && baseURL) void loadModels();
  }, [open, keySaved, modelsState, baseURL, loadModels]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, busy, trace, approval]);

  const stopFlush = () => {
    if (flushRef.current.timer) clearInterval(flushRef.current.timer);
    flushRef.current.timer = null;
  };

  const noteUsage = (u: ChatUsage) => {
    setLastUsage(u);
    setTotals((t) => ({ in: t.in + (u.promptTokens ?? 0), out: t.out + (u.completionTokens ?? 0) }));
  };

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const key = getProviderKey(providerId);
    const model = customModel ? modelId.trim() : modelId;
    if (!key) {
      setSendError("Save your provider key first - it stays in this tab only.");
      return;
    }
    if (!model) {
      setSendError("Pick a model from the list or type one.");
      return;
    }
    setSendError(null);
    setBusy(true);
    const history: ChatMessage[] = [...turns.filter((t) => !t.error).map((t) => ({ role: t.role, content: t.content })), { role: "user", content: text }];
    setTurns((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setDraft("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    flushRef.current.acc = "";
    shownRef.current = 0;
    flushRef.current.timer = setInterval(() => {
      const acc = flushRef.current.acc;
      if (!acc) return;
      flushRef.current.acc = "";
      shownRef.current += acc.length;
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") next[next.length - 1] = { ...last, content: last.content + acc };
        return next;
      });
    }, 120);
    const onToken = (d: string) => {
      flushRef.current.acc += d;
    };
    const finishTurn = (text: string, usage: ChatUsage | undefined, error: string | undefined) => {
      stopFlush();
      const rest = flushRef.current.acc + text.slice(shownRef.current);
      flushRef.current.acc = "";
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, content: last.content + rest, usage, error };
        }
        return next;
      });
      if (rest === "" && !error) {
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && last.content === "") {
            next[next.length - 1] = { ...last, content: "", error: "Empty reply - retry or switch model." };
          }
          return next;
        });
      }
    };
    const tools = toolsForSkill(skill.name);
    if (tools.length === 0) {
      const r = await streamChatCompletion({
        baseURL,
        apiKey: key,
        model,
        messages: [{ role: "system", content: skill.system }, ...history],
        signal: ctrl.signal,
        onToken,
      });
      finishTurn(r.text, r.usage, r.ok ? undefined : r.error);
      if (r.ok && r.usage) noteUsage(r.usage);
      if (!r.ok && r.text === "" && r.error && r.error !== "Stopped.") setSendError(r.error);
    } else {
      const r = await runAgentLoop({
        baseURL,
        apiKey: key,
        model,
        system: `${skill.system}\nYou have tools for this tab - prefer acting through them over describing steps. Mutations ask the user first; read tools run freely.`,
        history,
        tools,
        signal: ctrl.signal,
        events: {
          onToken,
          onUsage: noteUsage,
          onToolAuto: (name, label, outcome) =>
            setTrace((prev) => [...prev, `${label} — ${outcome.ok ? "ok" : `failed: ${outcome.error ?? "error"}`}`]),
          onApproval: (req) =>
            new Promise<"apply" | "discard">((resolve) => {
              setApproval({
                label: req.label,
                tool: req.tool.name,
                resolve: (d) => {
                  setApproval(null);
                  setTrace((prev) => [...prev, `${req.label} — ${d === "apply" ? "applied" : "discarded"}`]);
                  resolve(d);
                },
              });
            }),
        },
      });
      finishTurn(r.text, undefined, r.stopped && r.text.trim() === "" ? r.stopped : undefined);
    }
    setBusy(false);
    abortRef.current = null;
  }, [draft, busy, providerId, modelId, customModel, turns, baseURL, skill.name, skill.system]);

  const stop = () => abortRef.current?.abort();

  const saveKey = () => {
    setProviderKey(providerId, keyInput);
    setKeySaved(keyInput.trim() !== "");
    setModelsState("idle");
  };

  const clearKeys = () => {
    clearProviderKeys();
    setKeyInput("");
    setKeySaved(false);
    setModels([]);
    setModelId("");
    setModelsState("idle");
  };

  const modelHint = (m: AiModelOption): string => {
    const bits: string[] = [];
    if (m.contextLength) bits.push(`${Math.round(m.contextLength / 1000)}k ctx`);
    if (m.promptPrice) bits.push(`$${m.promptPrice}/1M`);
    return bits.join(" · ");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Ask the GRAVENX agent"
        aria-label="Toggle AI agent panel"
        className="fixed bottom-5 right-5 z-50 flex h-11 items-center gap-2 rounded-full border border-[var(--color-line)] bg-ivory-950 px-4 text-[13px] font-semibold text-ivory-100 shadow-xl transition-colors hover:bg-bronze-600 cursor-pointer"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
        Ask AI
      </button>

      {open && (
        <aside
          role="dialog"
          aria-label="GRAVENX AI agent"
          className="fixed right-4 top-[64px] bottom-4 z-50 flex w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_24px_64px_-24px_rgba(24,20,12,0.5)]"
        >
          <div className="flex items-start justify-between gap-2 border-b border-[var(--color-line-soft)] px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
                Agent · advising: {skill.label}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ivory-600">
                Key stays in this tab - calls go straight from your browser to the provider.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close AI panel"
              className="rounded-md p-1.5 text-ivory-500 transition-colors cursor-pointer hover:bg-ivory-300 hover:text-ivory-950"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="border-b border-[var(--color-line-soft)] px-4 py-3 space-y-2">
            <div className="flex gap-1.5">
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                aria-label="Provider"
                className="min-w-0 flex-1 cursor-pointer truncate rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 text-xs font-semibold text-ivory-950"
              >
                {PROVIDER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <Button size="sm" variant="secondary" onClick={clearKeys} title="Forget all provider keys in this tab">
                Forget keys
              </Button>
            </div>
            {providerId === "custom" && (
              <input
                value={customBase}
                onChange={(e) => setCustomBase(e.target.value)}
                placeholder="https://your-host/v1"
                spellCheck={false}
                aria-label="Custom endpoint base URL"
                className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 font-mono text-[11px] text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
              />
            )}
            <div className="flex gap-1.5">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={preset.keyPlaceholder}
                autoComplete="off"
                spellCheck={false}
                aria-label={preset.keyLabel}
                className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 font-mono text-[11px] text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
              />
              <Button size="sm" onClick={saveKey} disabled={keyInput.trim() === "" && !keySaved}>
                {keySaved ? "Update" : "Save"}
              </Button>
            </div>
            <p className="text-[10px] leading-relaxed text-ivory-500">{preset.hint}{keySaved ? " · key saved for this tab" : ""}</p>
            <div className="flex gap-1.5">
              {!customModel ? (
                <select
                  value={modelId}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") setCustomModel(true);
                    else setModelId(e.target.value);
                  }}
                  aria-label="Model"
                  disabled={modelsState === "loading"}
                  className="min-w-0 flex-1 cursor-pointer truncate rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 font-mono text-[11px] text-ivory-950 disabled:opacity-60"
                >
                  <option value="">{modelsState === "loading" ? "Loading models…" : models.length === 0 ? "No models yet - refresh or type one" : "Pick a model…"}</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}{modelHint(m) ? ` · ${modelHint(m)}` : ""}
                    </option>
                  ))}
                  <option value="__custom__">Type a model ID…</option>
                </select>
              ) : (
                <input
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="e.g. openai/gpt-4.1-mini"
                  spellCheck={false}
                  aria-label="Custom model ID"
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 font-mono text-[11px] text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none"
                />
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (customModel) {
                    setCustomModel(false);
                    setModelId(models[0]?.id ?? "");
                  } else void loadModels();
                }}
                disabled={modelsState === "loading"}
                title={customModel ? "Back to the list" : "Reload models from the provider"}
              >
                {modelsState === "loading" ? "…" : customModel ? "List" : "Refresh"}
              </Button>
            </div>
            {modelsError && (
              <p className="rounded-lg border border-[#E5C98F] bg-[#F5EEDF] px-2.5 py-1.5 text-[11px] text-[#8A6A2F]" role="alert">
                {modelsError}
              </p>
            )}
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            {turns.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--color-line)] px-3 py-4 text-center">
                <p className="text-xs font-semibold text-ivory-950">Brainstorm with the {skill.label} agent</p>
                <p className="mx-auto mt-1 max-w-[260px] text-[11px] leading-relaxed text-ivory-600">
                  Advisor mode: it explains and drafts, you act. Tool-calling that edits canvases arrives next.
                </p>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "ml-8 rounded-xl bg-ivory-950 px-3 py-2 text-xs leading-relaxed text-ivory-100" : "mr-4 rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-3 py-2 text-xs leading-relaxed text-ivory-950"}>
                <p className="whitespace-pre-wrap">{t.content}{busy && i === turns.length - 1 && t.role === "assistant" ? "▍" : ""}</p>
                {t.error && (
                  <p className="mt-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700" role="alert">
                    {t.error}
                  </p>
                )}
                {t.usage?.totalTokens !== undefined && (
                  <p className="mt-1 font-mono text-[10px] text-ivory-500">
                    {t.usage.promptTokens ?? "?"} in · {t.usage.completionTokens ?? "?"} out · {t.usage.totalTokens} total
                  </p>
                )}
              </div>
            ))}
            {sendError && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-xs text-red-700" role="alert">
                {sendError}
              </p>
            )}
            {trace.length > 0 && (
              <div className="rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-ivory-500">Agent activity</p>
                <ul className="mt-1 space-y-0.5">
                  {trace.map((line, i) => (
                    <li key={i} className="font-mono text-[10px] leading-relaxed text-ivory-600">· {line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="border-t border-[var(--color-line-soft)] px-4 py-3">
            {approval && (
              <div className="mb-2 rounded-xl border border-[#C9A86A] bg-[#FBF6EC] px-3 py-2.5" role="alertdialog" aria-label="Approve agent change">
                <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[#8A6A2F]">Needs your approval</p>
                <p className="mt-0.5 text-xs font-semibold text-ivory-950">{approval.label}</p>
                <p className="mt-0.5 font-mono text-[10px] text-ivory-600">{approval.tool} · applies to the live canvas, undoable</p>
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" onClick={() => approval.resolve("apply")}>
                    Apply
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => approval.resolve("discard")}>
                    Discard
                  </Button>
                </div>
              </div>
            )}
            {(lastUsage?.totalTokens !== undefined || totals.in > 0 || totals.out > 0) && (
              <p className="mb-1.5 font-mono text-[10px] text-ivory-500">
                {lastUsage?.totalTokens !== undefined
                  ? `last reply: ${lastUsage.promptTokens ?? "?"} in · ${lastUsage.completionTokens ?? "?"} out · `
                  : ""}
                session: {totals.in} in · {totals.out} out
              </p>
            )}
            <div className="flex gap-1.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={`Ask about ${skill.label}…`}
                aria-label="Ask the agent"
                disabled={busy}
                className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2.5 py-2 text-xs text-ivory-950 placeholder-ivory-400 focus:border-bronze-500 focus:outline-none disabled:opacity-60"
              />
              {busy ? (
                <Button size="sm" variant="danger" onClick={stop}>
                  Stop
                </Button>
              ) : (
                <Button size="sm" onClick={() => void send()} disabled={draft.trim() === ""}>
                  Send
                </Button>
              )}
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
