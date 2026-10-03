"use client";

import Button from "./ui/Button";

interface WelcomeModalProps {
  open: boolean;
  onConnect: () => void;
  onExplore: () => void;
}

const CHIPS = ["REST payloads", "ERD + Graph", "Composite batches", "OpenAPI validate"];

export function WelcomeModal({ open, onConnect, onExplore }: WelcomeModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="modal-card max-w-xl">
        <div className="px-6 sm:px-8 pt-7 pb-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
            The Architecture Engineering Studio
          </p>
          <h2 id="welcome-title" className="hero-title mt-2 text-4xl sm:text-5xl">
            Payloads without <em>the grunt work.</em>
          </h2>
          <p className="mx-auto mt-3 text-sm leading-relaxed text-ivory-700 max-w-md">
            Welcome to <strong className="text-ivory-950">GRAVENX</strong> - connect
            to any org and build accurate payloads from live metadata. No manual
            field copy-paste.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            {CHIPS.map((c) => (
              <span
                key={c}
                className="rounded-full border border-[var(--color-line)] bg-[var(--color-canvas)] px-2.5 py-1 text-[11px] font-medium text-ivory-700"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="px-6 sm:px-8 pb-3 flex flex-col sm:flex-row sm:items-center gap-3">
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
