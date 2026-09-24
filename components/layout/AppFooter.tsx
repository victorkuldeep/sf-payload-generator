"use client";

export function AppFooter() {
  return (
    <footer className="w-full border-t border-[var(--color-line)] bg-[var(--color-surface)] py-7 mt-auto">
      <div className="w-full px-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--color-muted)]">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[var(--color-ink)]">
            Salesforce sObject Payload Studio
          </span>
          <span aria-hidden="true">•</span>
          <span className="hidden sm:inline">
            For Architects · API-First Teams · Salesforce Practitioners
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)]"
            aria-hidden="true"
          />
          <span>Token lives in session memory only · Calls proxied server-side</span>
        </div>

        <div className="flex items-center gap-3">
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
          <span aria-hidden="true">•</span>
          <small className="text-[10px]">Independent utility. Not affiliated with Salesforce.</small>
        </div>
      </div>
    </footer>
  );
}
