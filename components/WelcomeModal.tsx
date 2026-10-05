"use client";

import { useState } from "react";
import Button from "./ui/Button";

interface WelcomeModalProps {
  open: boolean;
  onConnect: () => void;
  onExplore: () => void;
}

const CHIPS = ["REST payloads", "ERD + Graph", "Composite batches", "OpenAPI validate"];

export function WelcomeModal({ open, onConnect, onExplore }: WelcomeModalProps) {
  const [accepted, setAccepted] = useState(false);
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="modal-card max-w-xl">
        <div className="px-6 sm:px-8 pt-7 pb-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
            Salesforce Engineering Studio
          </p>
          <h2 id="welcome-title" className="hero-title hero-title--burgundy mt-2 text-4xl sm:text-5xl">
            Payloads without <em>the grunt work.</em>
          </h2>
          <p className="mx-auto mt-3 text-sm leading-relaxed text-ivory-700 max-w-md">
            Welcome to{" "}
            <strong className="font-bold tracking-tight">
              <span className="gravenx-brand__lead">GRAVEN</span>
              <span className="gravenx-brand__rest">X</span>
            </strong>{" "}
            - connect to any org and build accurate payloads from live metadata. No manual
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

        <div className="px-6 sm:px-8 pb-3">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)] px-4 py-3 text-left">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              aria-label="Accept the Terms and Conditions and Privacy Policy"
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#A98450]"
            />
            <span className="text-xs leading-relaxed text-ivory-700">
              I accept the{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-medium underline hover:text-ivory-950"
              >
                Terms &amp; Conditions
              </a>{" "}
              and{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-medium underline hover:text-ivory-950"
              >
                Privacy Policy
              </a>
              , and I have authority to connect this org.
            </span>
          </label>
        </div>

        <div className="px-6 sm:px-8 pb-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <Button
            size="lg"
            onClick={onConnect}
            disabled={!accepted}
            title={accepted ? "Open the connection dialog" : "Accept the Terms & Privacy Policy first"}
            className="sm:flex-1"
          >
            Connect to Salesforce
          </Button>
          <Button size="lg" variant="secondary" onClick={onExplore} className="sm:flex-1">
            Explore the studio first
          </Button>
        </div>

        <p className="px-6 sm:px-8 pb-5 text-center text-[11px] leading-relaxed text-ivory-600">
          Your access token is never written to disk - session memory only. Independent project.
        </p>
      </div>
    </div>
  );
}
