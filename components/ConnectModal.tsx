"use client";

import { useEffect, useRef, useState } from "react";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Select from "./ui/Select";

interface ConnectModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  initialInstanceUrl: string;
  initialToken: string;
  initialApiVersion: string;
  onClose: () => void;
  onConnect: (instanceUrl: string, token: string, apiVersion: string) => Promise<void>;
}

const VERSIONS = [
  "v70.0", "v69.0", "v68.0", "v67.0", "v66.0", "v65.0",
  "v64.0", "v63.0", "v62.0", "v61.0", "v60.0", "v59.0",
];

type Tab = "credentials" | "token-help";

export function ConnectModal({
  open,
  loading,
  error,
  initialInstanceUrl,
  initialToken,
  initialApiVersion,
  onClose,
  onConnect,
}: ConnectModalProps) {
  const [tab, setTab] = useState<Tab>("credentials");
  const [instanceUrl, setInstanceUrl] = useState(initialInstanceUrl);
  const [token, setToken] = useState(initialToken);
  const [apiVersion, setApiVersion] = useState(initialApiVersion);
  const [showToken, setShowToken] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [tokenError, setTokenError] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);

  // Re-seed fields every time the modal opens (e.g. session restore / switch org)
  useEffect(() => {
    if (open) {
      setInstanceUrl(initialInstanceUrl);
      setToken(initialToken);
      setApiVersion(initialApiVersion);
      setUrlError("");
      setTokenError("");
      setTab("credentials");
      const t = setTimeout(() => urlRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open, initialInstanceUrl, initialToken, initialApiVersion]);

  // ESC to close (unless a connection attempt is in flight)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const submit = async () => {
    setUrlError("");
    setTokenError("");
    let bad = false;
    if (!instanceUrl.trim()) { setUrlError("Instance URL is required"); bad = true; }
    else if (!/^https:\/\//i.test(instanceUrl.trim())) { setUrlError("Must start with https://"); bad = true; }
    if (!token.trim()) { setTokenError("Access token is required"); bad = true; }
    if (bad) return;
    await onConnect(instanceUrl.trim(), token.trim(), apiVersion);
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-title"
      onClick={() => { if (!loading) onClose(); }}
    >
      <div className="modal-card max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[var(--color-line-soft)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
              Live connection
            </p>
            <h2 id="connect-title" className="mt-1 text-lg font-bold text-ivory-950">
              Connect to Salesforce
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close connect dialog"
            className="rounded-md p-1.5 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-300 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex rounded-lg border border-[var(--color-line)] overflow-hidden w-fit text-xs font-medium" role="tablist" aria-label="Connect dialog tabs">
            {(["credentials", "token-help"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 transition-colors cursor-pointer ${
                  tab === t ? "bg-ivory-950 text-ivory-100" : "bg-[var(--color-surface)] text-ivory-700 hover:text-ivory-950"
                }`}
              >
                {t === "credentials" ? "Credentials" : "Where's my token?"}
              </button>
            ))}
          </div>
        </div>

        {tab === "credentials" ? (
          <div className="px-6 py-4 space-y-4">
            <Input
              ref={urlRef}
              label="Salesforce Instance URL"
              type="url"
              placeholder="https://myorg.my.salesforce.com"
              value={instanceUrl}
              onChange={(e) => setInstanceUrl(e.target.value)}
              error={urlError}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
            <div>
              <Input
                label="Access Token"
                type={showToken ? "text" : "password"}
                placeholder="00D... / session id"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                error={tokenError}
                disabled={loading}
                autoComplete="off"
                spellCheck={false}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              />
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                className="mt-1 text-[11px] font-medium text-bronze-600 hover:text-bronze-700 cursor-pointer"
              >
                {showToken ? "Hide token" : "Show token"}
              </button>
            </div>
            <Select
              label="API Version"
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
              disabled={loading}
            >
              {VERSIONS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>

            {error && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 py-4 space-y-3 text-xs leading-relaxed text-ivory-700">
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3">
              <p className="font-semibold text-ivory-950">Option 1 — Workbench</p>
              <p className="mt-1">Log in at workbench.developerforce.com, then open the session info page to copy your Session ID and use it as the token.</p>
            </div>
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3">
              <p className="font-semibold text-ivory-950">Option 2 — Salesforce CLI</p>
              <p className="mt-1">Run <code className="font-mono text-[11px] bg-ivory-300 px-1 rounded">sf org display --target-org &lt;alias&gt;</code> and copy the Access Token.</p>
            </div>
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3">
              <p className="font-semibold text-ivory-950">Option 3 — Connected App</p>
              <p className="mt-1">Use an OAuth client-credentials or authorization-code flow against your org, then paste the issued access token here.</p>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-[var(--color-line-soft)] bg-[var(--color-canvas)] flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="flex-1 text-[11px] leading-relaxed text-ivory-600">
            Token is kept in session memory only — never written to disk. All Salesforce calls are proxied server-side.
          </p>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={submit} loading={loading} disabled={loading}>
              Test &amp; Connect
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
