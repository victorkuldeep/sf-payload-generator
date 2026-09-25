"use client";

import type { ReactNode } from "react";

export function AppFooter({ trail }: { trail?: ReactNode }) {
  return (
    <footer className="w-full border-t border-[var(--color-line)] bg-[var(--color-surface)] mt-auto">
      {trail && (
        <div className="border-b border-[var(--color-line-soft)] px-5 py-3 flex justify-center">
          <div className="w-full max-w-3xl">{trail}</div>
        </div>
      )}
      <div className="w-full px-5 py-2 flex items-center justify-between gap-x-4 gap-y-0.5 flex-wrap text-[10px] leading-tight text-[var(--color-muted)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-[var(--color-ink)] whitespace-nowrap">
            Salesforce sObject Payload Studio
          </span>
          <span aria-hidden="true">•</span>
          <span className="hidden md:inline whitespace-nowrap">
            For Architects · API-First Teams · Salesforce Practitioners
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 whitespace-nowrap">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)]"
            aria-hidden="true"
          />
          <span>Token lives in session memory only · Calls proxied server-side</span>
        </div>

        <div className="flex items-center gap-2 whitespace-nowrap">
          <span>
            Designed &amp; developed by{" "}
            <a
              href="https://www.linkedin.com/in/victorkuldeep/"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-[var(--color-ink)] text-[var(--color-ink-soft)] transition-colors"
            >
              Kuldeep Singh
            </a>
          </span>
          <span aria-hidden="true" className="hidden sm:inline">•</span>
          <small className="hidden sm:inline">Independent utility. Not affiliated with Salesforce.</small>
        </div>
      </div>
    </footer>
  );
}
