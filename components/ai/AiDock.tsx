"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Button from "../ui/Button";
import {
  presetById,
  streamChatCompletion,
  type ChatMessage,
  type ChatUsage,
} from "@/lib/ai/providers";
import { getProviderKey } from "@/lib/ai/keyVault";
import { skillForPath } from "@/lib/ai/skills";
import { runAgentLoop } from "@/lib/ai/tools";
import { toolsForSkill } from "@/lib/ai/toolsSystem";
import { isSalesforceConnected } from "@/lib/ai/gate";
import { AiMarkdown } from "./Markdown";
import { ModelStudio } from "./ModelStudio";

interface Turn extends ChatMessage {
  usage?: ChatUsage;
  error?: string;
}

/**
 * GRAVENX agent dock. Global floating button + right-side panel with the
 * active tab's skill pack, tool loop and approval cards. Provider keys,
 * adapters and model catalogue live in Model Studio; the drawer stays a
 * lean chat surface. V1 gate: a live Salesforce connection unlocks AI.
 */
export function AiDock() {
  const pathname = usePathname() ?? "/";
  const skill = useMemo(() => skillForPath(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState("openrouter");
  const [modelId, setModelId] = useState("");
  const [studioOpen, setStudioOpen] = useState(false);
  const [sfOk, setSfOk] = useState(false);
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
  const baseURL = preset.baseURL;

  useEffect(() => {
    if (!open) return;
    const check = () => setSfOk(isSalesforceConnected());
    check();
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
    };
  }, [open]);

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
    if (!isSalesforceConnected()) {
      setSfOk(false);
      setSendError("Connect to Salesforce first - the org connection unlocks the agent.");
      return;
    }
    const key = getProviderKey(providerId);
    const model = modelId.trim();
    if (!key || !model) {
      setSendError("Open Model Studio, save a key and activate a model first.");
      setStudioOpen(true);
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
  }, [draft, busy, providerId, modelId, turns, baseURL, skill.name, skill.system]);

  const stop = () => abortRef.current?.abort();

  const tools = toolsForSkill(skill.name);

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
                Key stays in this tab - forwarded per request, never stored or logged.
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

          <div className="border-b border-[var(--color-line-soft)] px-4 py-2.5">
            {!sfOk ? (
              <div className="flex items-center gap-2 rounded-xl border border-[#E5C98F] bg-[#F5EEDF] px-3 py-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="shrink-0 text-[#8A6A2F]">
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-[#8A6A2F]">
                  Agent locked - connect to Salesforce first.
                </p>
                <Link href="/" className="shrink-0 rounded-lg bg-ivory-950 px-2.5 py-1.5 text-[11px] font-semibold text-ivory-100 hover:bg-bronze-600 transition-colors">
                  Connect
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${modelId ? "bg-[#32815B]" : "bg-ivory-400"}`} title={modelId ? "Provider active" : "No model activated"} />
                <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-ivory-700">
                  {preset.label}{modelId ? ` · ${modelId}` : " · no model"}
                </p>
                <button
                  type="button"
                  onClick={() => setStudioOpen(true)}
                  title="Open Model Studio - keys, adapters, models"
                  aria-label="Open Model Studio"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 text-[11px] font-semibold text-ivory-800 transition-colors cursor-pointer hover:border-[#C9A86A] hover:text-ivory-950"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
                    <circle cx="16" cy="8" r="2.2" />
                    <circle cx="8" cy="16" r="2.2" />
                  </svg>
                  Model Studio
                </button>
              </div>
            )}
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            {turns.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--color-line)] px-3 py-4 text-center">
                <p className="text-xs font-semibold text-ivory-950">Brainstorm with the {skill.label} agent</p>
                <p className="mx-auto mt-1 max-w-[260px] text-[11px] leading-relaxed text-ivory-600">
                  {tools.length > 0
                    ? "It reads the live canvas and proposes changes - every mutation waits for your Apply."
                    : "It explains and drafts, you act. Activate a model in Model Studio to begin."}
                </p>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "ml-8 rounded-xl bg-ivory-950 px-3 py-2 text-xs leading-relaxed text-ivory-100" : "mr-4 rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-3 py-2 text-xs leading-relaxed text-ivory-950"}>
                {t.role === "assistant" && !(busy && i === turns.length - 1) && t.content ? (
                  <AiMarkdown content={t.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{t.content}{busy && i === turns.length - 1 && t.role === "assistant" ? "▍" : ""}</p>
                )}
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
      <ModelStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        activeProviderId={providerId}
        activeModelId={modelId}
        onActivate={(pid, mid) => {
          setProviderId(pid);
          setModelId(mid);
        }}
      />
    </>
  );
}
