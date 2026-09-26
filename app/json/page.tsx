import Link from "next/link";
import { JsonStudio } from "@/components/json-studio/JsonStudio";
import { AppFooter } from "@/components/layout/AppFooter";

export const metadata = { title: "JSON Studio" };

const ROUTES = [
  { href: "/", label: "Home" },
  { href: "/schema", label: "Schema" },
  { href: "/json", label: "JSON" },
];

export default function JsonPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 w-full bg-[var(--color-canvas)]/95 backdrop-blur-sm border-b border-[var(--color-line)]">
        <div className="w-full px-5 flex items-center gap-3 h-[56px]">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-ivory-700 hover:text-ivory-950 hover:border-[var(--color-accent)] transition-colors"
            title="Back to the studio"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="m14 6-6 6 6 6" />
            </svg>
            Studio
          </Link>
          <span className="text-xs font-bold text-ivory-950">JSON Studio</span>
          <span className="hidden sm:inline text-[11px] text-ivory-600">
            Editor + A/B payload comparator
          </span>
          <span className="flex-1" />
          <nav className="flex items-center gap-4 text-xs font-medium text-[var(--color-ink-soft)]" aria-label="Routes">
            {ROUTES.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                aria-current={r.href === "/json" ? "page" : undefined}
                className={r.href === "/json" ? "text-[var(--color-ink)] underline underline-offset-4 decoration-[var(--color-accent)] decoration-2 font-semibold" : "hover:text-[var(--color-ink)] transition-colors"}
              >
                {r.label}
              </Link>
            ))}
            <a
              href="https://workbench.developerforce.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--color-ink)] transition-colors hidden sm:inline"
            >
              Workbench ↗
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] px-5 py-6 flex-1">
        <JsonStudio />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}

