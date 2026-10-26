"use client";

import { useEffect, useRef, useState } from "react";
import { BridgeInbox } from "@/lib/bridge/inbox";
import type { BridgeCall } from "@/lib/bridge/protocol";
import { describeCommand } from "@/lib/bridge/protocol";
import { ensureTabId, getBridgeSettings, setBridgeSettings, useBridgeSettings } from "@/lib/bridge/settings";
import { isSalesforceConnected } from "@/lib/ai/gate";
import { logToolRun } from "@/lib/setup/audit";
import { ConfirmDialog } from "../ui/ConfirmDialog";

/**
 * Agent bridge dock: owns the tab-side inbox lifecycle, renders the
 * connection pill + pairing panel, and surfaces the approval modal every
 * mutating agent command must pass. Reads run free; writes wait here.
 * Mounted app-wide; commands dispatch to whichever tab registered them.
 */
export function BridgeDock() {
  const settings = useBridgeSettings();
  const inboxRef = useRef<BridgeInbox | null>(null);
  const approveRef = useRef<((ok: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<BridgeCall | null>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const [portDraft, setPortDraft] = useState("");

  useEffect(() => {
    if (!settings.enabled) {
      inboxRef.current?.close();
      inboxRef.current = null;
      if (getBridgeSettings().status !== "off") setBridgeSettings({ status: "off", error: null });
      return;
    }
    if (!settings.code.trim()) {
      inboxRef.current?.close();
      inboxRef.current = null;
      setBridgeSettings({ status: "off", error: "Enter the pairing code the MCP server printed." });
      return;
    }
    if (!isSalesforceConnected()) {
      inboxRef.current?.close();
      inboxRef.current = null;
      setBridgeSettings({ status: "off", error: "Connect Salesforce first - the bridge acts on the live org." });
      return;
    }
    const inbox = new BridgeInbox({
      onStatus: (status, error) => setBridgeSettings({ status, error: error ?? null }),
      onApproval: (call, approve) => {
        approveRef.current = approve;
        setPending(call);
      },
      onEvent: (kind, ok, detail) => {
        void logToolRun({ skill: "agent-bridge", tool: kind, label: detail.slice(0, 200), ok, detail: detail.slice(0, 500) });
      },
    });
    inboxRef.current?.close();
    inboxRef.current = inbox;
    inbox.connect(settings.port, settings.code.trim(), ensureTabId());
    return () => {
      inbox.close();
      if (inboxRef.current === inbox) inboxRef.current = null;
    };
  }, [settings.enabled, settings.code, settings.port]);

  const decide = (ok: boolean) => {
    const call = pending;
    setPending(null);
    approveRef.current?.(ok);
    approveRef.current = null;
    if (call) {
      void logToolRun({
        skill: "agent-bridge",
        tool: call.command,
        label: ok ? "Approved by the architect." : "Denied by the architect.",
        ok,
      });
    }
  };

  const dot =
    settings.status === "live" ? "bg-emerald-500" : settings.status === "connecting" ? "bg-amber-400 animate-pulse" : settings.status === "error" ? "bg-red-500" : "bg-ivory-400";
  const label =
    settings.status === "live"
      ? "Bridge live"
      : settings.status === "connecting"
        ? "Bridge pairing…"
        : settings.status === "error"
          ? "Bridge error"
          : "Bridge off";

  return (
    <>
      <div className="fixed bottom-4 left-4 z-40">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setCodeDraft(getBridgeSettings().code);
            setPortDraft(String(getBridgeSettings().port));
          }}
          title="Agent bridge - let a paired terminal agent drive the live canvas"
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-ivory-800 shadow-sm hover:border-bronze-500"
        >
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </button>
        {open && (
          <div className="mt-2 w-72 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-lg">
            <p className="text-xs font-bold text-ivory-950">Agent bridge</p>
            <p className="mt-0.5 text-[11px] leading-snug text-ivory-600">
              A paired terminal agent (via MCP) drives this tab like you do. Reads are free; every change waits for your allow.
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-ivory-800">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setBridgeSettings({ enabled: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#722F37]"
              />
              Enable bridge
            </label>
            <label className="mt-2 block">
              <span className="text-[11px] font-semibold text-ivory-700">Pairing code (from the MCP server log)</span>
              <span className="mt-1 flex gap-1.5">
                <input
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  inputMode="numeric"
                  placeholder="6-digit code"
                  spellCheck={false}
                  aria-label="Pairing code"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-white px-2 font-mono text-xs text-ivory-950 focus:border-bronze-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setBridgeSettings({ code: codeDraft.trim() })}
                  className="cursor-pointer rounded-lg border border-[var(--color-line)] px-2.5 text-xs font-semibold text-ivory-800 hover:border-bronze-500"
                >
                  Pair
                </button>
              </span>
            </label>
            <label className="mt-2 block">
              <span className="text-[11px] font-semibold text-ivory-700">Bridge port</span>
              <input
                value={portDraft}
                onChange={(e) => setPortDraft(e.target.value.replace(/\D/g, "").slice(0, 5))}
                onBlur={() => {
                  const n = Number(portDraft);
                  if (Number.isFinite(n) && n > 0 && n < 65536) setBridgeSettings({ port: n });
                }}
                inputMode="numeric"
                aria-label="Bridge port"
                className="mt-1 h-8 w-full rounded-lg border border-[var(--color-line)] bg-white px-2 font-mono text-xs text-ivory-950 focus:border-bronze-500 focus:outline-none"
              />
            </label>
            {settings.error && <p className="mt-1.5 text-[11px] text-red-700">{settings.error}</p>}
            {settings.status === "live" && (
              <button
                type="button"
                onClick={() => setBridgeSettings({ enabled: false })}
                className="mt-2 cursor-pointer rounded-lg border border-red-300 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
              >
                Disconnect (kill switch)
              </button>
            )}
          </div>
        )}
      </div>
      {pending && (
        <ConfirmDialog
          title="Allow this agent action?"
          message={`${describeCommand(pending.command, pending.args)} — requested by the paired terminal agent on the connected org. Deny costs nothing.`}
          confirmLabel="Allow + run"
          tone={pending.command.startsWith("erd.author") ? "danger" : "default"}
          onCancel={() => decide(false)}
          onConfirm={() => decide(true)}
        />
      )}
    </>
  );
}
