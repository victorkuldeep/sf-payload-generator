"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { NavMode } from "./AppHeader";

const STUDIO_LINKS: { label: string; mode: NavMode }[] = [
  { label: "Single Object", mode: "builder" },
  { label: "Composite", mode: "composite" },
  { label: "SOQL", mode: "soql" },
  { label: "GraphQL", mode: "graphql" },
  { label: "Schema Map", mode: "schema" },
  { label: "REST", mode: "rest" },
];

export function AppFooter({ trail, onNavigate }: { trail?: ReactNode; onNavigate: (mode: NavMode) => void }) {
  const year = new Date().getFullYear();

  return (
    <footer
      aria-label="Site footer"
      className="w-full border-t border-[var(--color-line)] bg-[#F5F1E8]/60 mt-auto relative overflow-hidden"
    >
      {/* Ambient dotted detail */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#AE9B7D_1px,transparent_1px)] [background-size:24px_24px]"
      />

      {trail && (
        <div className="relative border-b border-[var(--color-line-soft)] px-5 py-3 flex justify-center">
          <div className="w-full max-w-3xl">{trail}</div>
        </div>
      )}

      <div className="relative mx-auto w-full px-5 lg:px-8 pt-10 pb-6">
        {/* Brand + nav grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-8">
          <div className="md:col-span-5 space-y-4">
            <div>
              <p className="text-sm font-bold text-[var(--color-ink)]">
                Salesforce sObject Payload Studio
              </p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[2px] text-[var(--color-muted)]">
                Architect Toolkit
              </p>
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-[var(--color-ink-soft)]">
              API-first payload design for Salesforce architects - describe live
              metadata, compose batches, diff versions, export anywhere.
            </p>
            <div className="pt-3 border-t border-[var(--color-line-soft)] max-w-sm">
              <a
                href="https://www.linkedin.com/in/victorkuldeep/"
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink)]"
                aria-label="Kuldeep Singh on LinkedIn"
              >
                Kuldeep Singh
                <span aria-hidden="true" className="text-[var(--color-muted)] group-hover:text-[var(--color-accent-dark)] transition-colors">↗</span>
              </a>
              <p className="mt-0.5 font-mono text-[11px] text-[var(--color-muted)]">
                Architect / Engineering Leader
              </p>
            </div>
          </div>

          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-6">
            <div className="space-y-2.5">
              <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
                Toolkit
              </span>
              <nav aria-label="Toolkit">
                <ul className="space-y-2 font-mono text-xs">
                  {STUDIO_LINKS.map((l) => (
                    <li key={l.mode}>
                      <button
                        type="button"
                        onClick={() => onNavigate(l.mode)}
                        className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors cursor-pointer"
                      >
                        {l.label}
                      </button>
                    </li>
                  ))}
                  <li>
                    <Link
                      href="/json"
                      className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors"
                    >
                      JSON Studio
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>

            <div className="space-y-2.5">
              <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
                Explore
              </span>
              <nav aria-label="Explore">
                <ul className="space-y-2 font-mono text-xs">
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigate("home")}
                      className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors cursor-pointer"
                    >
                      Home
                    </button>
                  </li>
                  <li>
                    <Link
                      href="/schema"
                      className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors"
                    >
                      Schema
                    </Link>
                  </li>
                  <li>
                    <a
                      href="https://workbench.developerforce.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors inline-flex items-center gap-1"
                    >
                      Workbench <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://developer.salesforce.com/docs"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors inline-flex items-center gap-1"
                    >
                      Salesforce Docs <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                </ul>
              </nav>
            </div>

            <div className="space-y-2.5 col-span-2 sm:col-span-1">
              <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
                Connect
              </span>
              <nav aria-label="Ecosystem">
                <ul className="space-y-2 font-mono text-xs">
                  <li>
                    <a
                      href="https://victorkuldeep.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors inline-flex items-center gap-1"
                    >
                      Portfolio <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://coffeediscussions.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors inline-flex items-center gap-1"
                    >
                      Coffee Discussions <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                </ul>
              </nav>
              <p className="pt-1 text-[11px] font-mono leading-relaxed text-[var(--color-muted)]">
                Token lives in session memory only. Calls proxied server-side.
              </p>
            </div>
          </div>
        </div>

        {/* Workflow track */}
        <div className="py-4 border-y border-[var(--color-line-soft)] flex flex-col md:flex-row md:items-center justify-between gap-3 font-mono text-[11px]">
          <span className="font-bold uppercase tracking-wider text-[var(--color-accent-dark)] shrink-0">
            Builder Workflow
          </span>
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-[11px] text-[var(--color-muted)]">
            {["CONNECT", "SELECT", "CONFIGURE", "EXPORT", "VERIFY"].map((step, i, arr) => (
              <span key={step} className="flex items-center gap-1 sm:gap-2">
                <span className="text-[var(--color-ink-soft)] hover:text-[var(--color-accent-dark)] transition-colors font-medium">
                  {step}
                </span>
                {i < arr.length - 1 && <span aria-hidden="true">→</span>}
              </span>
            ))}
          </div>
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted)] shrink-0 hidden lg:block">
            Architect Toolkit
          </span>
        </div>

        {/* Bottom bar */}
        <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-mono text-[11px] text-[var(--color-muted)]">
          <div>
            <span>© {year} Salesforce sObject Payload Studio.</span>
            <span className="block sm:inline text-[10px]">
              {" "}Independent utility. Not affiliated with Salesforce.
            </span>
          </div>
          <span className="text-[var(--color-accent-dark)] font-medium">
            Designed for architects.
          </span>
        </div>
      </div>
    </footer>
  );
}
