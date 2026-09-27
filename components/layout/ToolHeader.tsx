"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Slim shared chrome for tool routes (/schema uses its own canvas chrome,
 * /json and /contracts use this). Brand + route/mode links + Workbench.
 * Mode links land on /?mode= which the home page honors (connect first
 * when offline). No session state - routes own their connection UI.
 */

const MODE_LINKS: { label: string; href: string }[] = [
  { label: "Builder", href: "/?mode=single" },
  { label: "Composite", href: "/?mode=composite" },
  { label: "SOQL", href: "/?mode=soql" },
  { label: "GraphQL", href: "/?mode=graphql" },
  { label: "REST", href: "/?mode=rest" },
];

const ROUTE_LINKS: { label: string; href: string }[] = [
  { label: "Schema", href: "/schema" },
  { label: "JSON", href: "/json" },
  { label: "Contracts", href: "/contracts" },
];

export function ToolHeader() {
  const pathname = usePathname();
  const linkCls = (href: string) =>
    pathname === href
      ? "text-[var(--color-ink)] underline underline-offset-4 decoration-[var(--color-accent)] decoration-2 font-semibold transition-colors"
      : "hover:text-[var(--color-ink)] transition-colors";

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--color-canvas)]/95 backdrop-blur-sm border-b border-[var(--color-line)]">
      <div className="w-full px-5 flex items-center gap-3 h-[64px]">
        <Link href="/" className="sf-brand" aria-label="Salesforce sObject Payload Studio - home">
          <span className="sf-brand__title">
            <span className="sf-brand__lead">Salesforce</span>
            <span className="sf-brand__rest">sObject Payload Studio</span>
          </span>
          <span className="sf-brand__tagline">Architect Toolkit</span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-[var(--color-ink-soft)]" aria-label="Product">
          <Link href="/" className={linkCls("/")}>Home</Link>
          {MODE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-[var(--color-ink)] transition-colors">
              {l.label}
            </Link>
          ))}
          {ROUTE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined} className={linkCls(l.href)}>
              {l.label}
            </Link>
          ))}
          <a
            href="https://workbench.developerforce.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--color-ink)] transition-colors"
          >
            Workbench ↗
          </a>
        </nav>
        <div className="flex-1" />
        <nav className="md:hidden flex items-center gap-4 overflow-x-auto text-xs font-medium text-[var(--color-ink-soft)]" aria-label="Product">
          <Link href="/" className={linkCls("/")}>Home</Link>
          {ROUTE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`${linkCls(l.href)} whitespace-nowrap`}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
