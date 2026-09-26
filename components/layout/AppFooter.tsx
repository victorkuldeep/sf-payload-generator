"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function AppFooter({ trail, variant }: { trail?: ReactNode; variant: "full" | "slim" }) {
  const year = new Date().getFullYear();

  if (variant === "slim") {
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
        {/* Capabilities */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pb-8">
          {[
            { t: "Table API payloads", d: "POST & PATCH bodies with type-correct values, required-field awareness and record-ID handling." },
            { t: "Composite batches", d: "Multi-sObject graphs with reference IDs in a single Composite API call." },
            { t: "JSON Studio", d: "Edit payloads in a tree and diff versions side by side, node by node." },
            { t: "Export anywhere", d: "JSON, cURL with $SF_ACCESS_TOKEN placeholder, JS fetch, or Apex HttpRequest." },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">{f.t}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-ink-soft)]">{f.d}</p>
            </div>
          ))}
        </div>

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
                className="group flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-[var(--color-surface)] transition-colors"
                aria-label="Kuldeep Singh - Architect, Engineering Leader (LinkedIn)"
              >
                <span className="relative block h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[var(--color-line)] bg-[var(--color-canvas)] shadow-sm ring-1 ring-[var(--color-accent)]/30 group-hover:ring-[var(--color-accent)]/60 transition-all">
                  <Image
                    src="/kuldeep-profile.webp"
                    alt="Kuldeep Singh"
                    width={44}
                    height={44}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-xs font-bold text-[var(--color-ink)] group-hover:text-[var(--color-accent-dark)] transition-colors">
                    Kuldeep Singh
                    <span aria-hidden="true" className="text-[var(--color-muted)]">↗</span>
                  </span>
                  <span className="block truncate font-mono text-[11px] text-[var(--color-muted)]">
                    Architect / Engineering Leader
                  </span>
                </span>
              </a>
            </div>

            {/* Social icon row */}
            <div className="pt-1">
              <span className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-2">
                Connections &amp; source
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="https://github.com/victorkuldeep"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Kuldeep Singh on GitHub"
                  title="GitHub"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-accent)] transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                    <path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943" />
                  </svg>
                </a>
                <a
                  href="https://linkedin.com/in/victorkuldeep"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Kuldeep Singh on LinkedIn"
                  title="LinkedIn"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-accent)] transition-all"
                >
                  <svg viewBox="0 0 34 34" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                    <path d="M34 2.5v29a2.5 2.5 0 0 1-2.5 2.5h-29A2.5 2.5 0 0 1 0 31.5v-29A2.5 2.5 0 0 1 2.5 0h29A2.5 2.5 0 0 1 34 2.5M10 13H5v16h5zm.45-5.5a2.88 2.88 0 0 0-2.86-2.9H7.5a2.9 2.9 0 0 0 0 5.8 2.88 2.88 0 0 0 2.95-2.81zM29 19.28c0-4.81-3.06-6.68-6.1-6.68a5.7 5.7 0 0 0-5.06 2.58h-.14V13H13v16h5v-8.51a3.32 3.32 0 0 1 3-3.58h.19c1.59 0 2.77 1 2.77 3.52V29h5z" />
                  </svg>
                </a>
                <a
                  href="mailto:kuldeep@coffeediscussions.com"
                  aria-label="Email Kuldeep Singh"
                  title="Email"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-accent)] transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                </a>
                <a
                  href="https://coffeediscussions.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Coffee Discussions"
                  title="Coffee Discussions"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-accent)] transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4">
                    <path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" />
                    <path d="M16 9h2a2 2 0 0 1 0 4h-2M7 4c0 1-1 1.5-1 2.5M11 4c0 1-1 1.5-1 2.5" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
                Explore
              </span>
              <nav aria-label="Explore">
                <ul className="space-y-2 font-mono text-xs">
                  <li>
                    <Link
                      href="/"
                      className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors"
                    >
                      Home
                    </Link>
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
                      href="https://excalidraw.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors inline-flex items-center gap-1"
                    >
                      Excalidraw <span aria-hidden="true">↗</span>
                    </a>
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
                      href="https://research.kuldeepsingh.ai"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline transition-colors inline-flex items-center gap-1"
                    >
                      KS Research Lab <span aria-hidden="true">↗</span>
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
