"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/**
 * Shared route chrome (HARD RULE: identical right cluster to AppHeader).
 * Brand + nav + Connected pill, bridged to the tab-scoped session.
 * Collections live inside the tabs that use them (REST/Builder/Composite),
 * never here. Search lives in Builder + global ⌘K on home.
 */

const MODE_LINKS: { label: string; href: string }[] = [
  { label: "Builder", href: "/?mode=single" },
  { label: "Composite", href: "/?mode=composite" },
  { label: "Query", href: "/?mode=soql" },
  { label: "GraphQL", href: "/?mode=graphql" },
  { label: "Rest", href: "/?mode=rest" },
];

const ROUTE_LINKS: { label: ReactNode; href: string }[] = [
  { label: "Schema", href: "/?mode=schema" },
  { label: "JSON", href: "/json" },
  { label: "Validate", href: "/validate" },
  { label: "Mapping", href: "/mapping" },
  { label: "Contracts", href: "/contracts" },
  { label: "Architect", href: "/architect" },
  { label: "System", href: "/system" },
  {
    label: (
      <>
        Draw<sup className="ml-[1px] text-[var(--color-accent)]">+</sup>
      </>
    ),
    href: "/draw",
  },
  { label: "Wireframe", href: "/wireframe" },
  { label: "Sequence", href: "/sequence" },
];

interface SessionView {
  connected: boolean;
  instanceUrl: string;
  apiVersion: string;
}

const OFFLINE: SessionView = { connected: false, instanceUrl: "", apiVersion: "" };

export function ToolHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionView>(OFFLINE);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedOrg, setCopiedOrg] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem("gravenx_session") ?? "null") as {
          instanceUrl?: string;
          token?: string;
          apiVersion?: string;
        } | null;
        if (saved?.token && saved?.instanceUrl) {
          setSession({ connected: true, instanceUrl: saved.instanceUrl, apiVersion: saved.apiVersion ?? "" });
        } else {
          setSession(OFFLINE);
        }
      } catch {
        setSession(OFFLINE);
      }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
    };
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const disconnect = () => {
    try {
      sessionStorage.removeItem("gravenx_session");
    } catch {
      /* storage unavailable */
    }
    setSession(OFFLINE);
    setMenuOpen(false);
  };

  const copyOrgUrl = async () => {
    try {
      await navigator.clipboard.writeText(session.instanceUrl);
      setCopiedOrg(true);
      window.setTimeout(() => setCopiedOrg(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const linkCls = (href: string) =>
    pathname === href
      ? "text-[var(--color-ink)] underline underline-offset-4 decoration-[var(--color-accent)] decoration-2 font-semibold transition-colors"
      : "hover:text-[var(--color-ink)] transition-colors";

  return (
    <header className="app-chrome-header sticky top-0 z-40 w-full bg-[var(--color-canvas)]/95 backdrop-blur-sm border-b border-[var(--color-line)]">
      <div className="w-full px-5 flex items-center justify-between h-[64px] gap-3">
        <Link href="/" className="gravenx-brand" aria-label="GRAVENX - home">
          <span className="gravenx-brand__title">
            <span className="gravenx-brand__lead">GRAVEN</span>
            <span className="gravenx-brand__rest">X</span>
          </span>
          <span className="gravenx-brand__tagline">Engineering Studio</span>
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
        </nav>

        <div className="flex items-center gap-2">
          <div className="relative" ref={menuRef}>
            <div
              className="flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-xs"
              role="status"
              aria-label={session.connected ? `Connected to ${session.instanceUrl}` : "Not connected"}
              title={session.connected ? session.instanceUrl : "Not connected"}
            >
              <span
                className={`status-dot ${session.connected ? "is-live" : ""}`}
                style={{
                  backgroundColor: session.connected ? "#4A7C59" : "#AEA48E",
                  color: session.connected ? "#4A7C59" : "#AEA48E",
                }}
                aria-hidden="true"
              />
              {session.connected ? (
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label="Connection details and actions"
                  className="flex items-center gap-1.5 pr-1 cursor-pointer"
                  title="Org details, switch org, disconnect"
                >
                  <span className="font-bold tracking-wide bg-gradient-to-r from-bronze-600 via-[#C9A86A] to-bronze-600 bg-clip-text text-transparent">
                    Connected
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7A5C3A" strokeWidth="2.4" aria-hidden="true" className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              ) : (
                <>
                  <span className="font-medium text-[var(--color-muted)] hidden sm:inline">Offline</span>
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="px-2.5 py-0.5 rounded-full bg-ivory-950 text-ivory-100 hover:bg-bronze-600 transition-colors cursor-pointer font-semibold"
                  >
                    Connect
                  </button>
                </>
              )}
            </div>

            {session.connected && menuOpen && (
              <div
                role="menu"
                aria-label="Connection"
                className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_16px_48px_-12px_rgba(24,20,12,0.35)]"
              >
                <div className="border-b border-[var(--color-line-soft)] px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
                    <span className="text-[10px] font-semibold uppercase tracking-[1.6px] text-[var(--color-accent-dark)]">
                      Live org
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-ivory-950" title={session.instanceUrl}>
                      {session.instanceUrl.replace(/^https:\/\//, "")}
                    </p>
                    <button
                      type="button"
                      onClick={copyOrgUrl}
                      aria-label="Copy org URL"
                      title="Copy org URL"
                      className="shrink-0 rounded-md p-1 text-ivory-500 hover:text-bronze-600 hover:bg-ivory-200 transition-colors cursor-pointer"
                    >
                      {copiedOrg ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true" className="text-green-600">
                          <path d="m4 12.5 5 5L20 6.5" />
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                          <rect x="9" y="9" width="12" height="12" rx="2" />
                          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {session.apiVersion !== "" && (
                    <p className="mt-1 font-inter text-[11px] text-ivory-600">{session.apiVersion}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 p-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/");
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold bg-ivory-950 text-ivory-100 hover:bg-bronze-600 transition-colors cursor-pointer"
                    title="Connect a different org on home"
                  >
                    Switch org
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={disconnect}
                    aria-label="Disconnect"
                    title="Disconnect"
                    className="flex items-center justify-center rounded-lg border border-red-400 p-2 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 3v8" />
                      <path d="M6.3 6.5a8 8 0 1 0 11.4 0" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <nav className="md:hidden flex items-center gap-4 overflow-x-auto px-5 pb-2.5 text-xs font-medium text-[var(--color-ink-soft)]" aria-label="Product">
        <Link href="/" className={linkCls("/")}>Home</Link>
        {ROUTE_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`${linkCls(l.href)} whitespace-nowrap`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
