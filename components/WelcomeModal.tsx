"use client";

import Button from "./ui/Button";

interface WelcomeModalProps {
  open: boolean;
  onConnect: () => void;
  onExplore: () => void;
}

const STEPS = [
  { n: "01", title: "Connect securely", body: "Instance URL + access token. Token stays in session memory, calls are proxied server-side." },
  { n: "02", title: "Describe any sObject", body: "Live metadata - types, picklists, references and writability for POST vs PATCH." },
  { n: "03", title: "Generate & export", body: "Table API payloads, Composite batches, then JSON, cURL, JS fetch or Apex." },
];

export function WelcomeModal({ open, onConnect, onExplore }: WelcomeModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="modal-card max-w-2xl">
        <div className="px-6 sm:px-8 pt-7 pb-5 border-b border-[var(--color-line-soft)]">
          <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
            Salesforce Architect Toolkit
          </p>
          <h2 id="welcome-title" className="hero-title mt-2 text-4xl sm:text-5xl">
            Payloads without <em>the grunt work.</em>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ivory-700 max-w-lg">
            Welcome to <strong className="text-ivory-950">Salesforce sObject Payload Studio</strong> - connect
            to any org, describe live sObjects, and generate accurate REST payloads for
            single records and Composite API batches. No manual field copy-paste.
          </p>
        </div>

        <div className="px-6 sm:px-8 py-5 grid sm:grid-cols-3 gap-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)] p-4">
              <p className="font-display text-2xl font-extrabold text-bronze-500">{s.n}</p>
              <p className="mt-1 text-xs font-semibold text-ivory-950">{s.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ivory-600">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="px-6 sm:px-8 pb-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <Button size="lg" onClick={onConnect} className="sm:flex-1">
            Connect to Salesforce
          </Button>
          <Button size="lg" variant="secondary" onClick={onExplore} className="sm:flex-1">
            Explore the studio first
          </Button>
        </div>

        <p className="px-6 sm:px-8 pb-5 text-center text-[11px] text-ivory-600">
          Your access token is never written to disk - session memory only.
        </p>
      </div>
    </div>
  );
}
