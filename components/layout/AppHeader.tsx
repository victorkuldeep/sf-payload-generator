"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type NavMode = "home" | "builder" | "composite" | "soql" | "graphql" | "schema" | "rest";

interface AppHeaderProps {
  connected: boolean;
  instanceUrl: string;
  apiVersion: string;
  objectCount: number;
  connecting: boolean;
  onConnectClick: () => void;
  onDisconnect: () => void;
  onSearchClick: () => void;
  onNavigate: (mode: NavMode) => void;
  /** Current mode - the matching tab renders underlined. */
  activeMode: NavMode;
  collectionCount: number;
  onCollectionClick: () => void;
}

export function AppHeader({
  connected,
  instanceUrl,
  apiVersion,
  objectCount,
  connecting,
  onConnectClick,
  onDisconnect,
  onSearchClick,
  onNavigate,
  activeMode,
  collectionCount,
  onCollectionClick,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedOrg, setCopiedOrg] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const closeMenu = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  // Single product navigation (Home first). Desktop renders it inline;
  // mobile gets the same list as a scrollable row under the header.
  const navItems: { id: "home" | "builder" | "composite" | "soql" | "graphql" | "schema" | "rest"; label: string; title: string }[] = [
    { id: "home", label: "Home", title: "Back to the start" },
    { id: "builder", label: "Builder", title: connected ? "Go to single-object builder" : "Connect to open the builder" },
    { id: "composite", label: "Composite", title: connected ? "Go to composite builder" : "Connect to open composite" },
    { id: "soql", label: "SOQL", title: connected ? "Go to SOQL builder" : "Connect to open SOQL" },
    { id: "graphql", label: "GraphQL", title: connected ? "Go to GraphQL query builder" : "Connect to open GraphQL" },
    { id: "schema", label: "Schema", title: connected ? "Go to schema deep dive" : "Connect to open the ERD" },
    { id: "rest", label: "REST", title: connected ? "Go to REST explorer" : "Connect to open REST explorer" },
  ];
  const navLinkClass =
    "hover:text-[var(--color-ink)] hover:underline underline-offset-4 transition-colors cursor-pointer whitespace-nowrap";

  const renderNavItems = () => (
    <>
      {navItems.map((item) => {
        const active = item.id === activeMode;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "text-[var(--color-ink)] underline underline-offset-4 decoration-[var(--color-accent)] decoration-2 font-semibold transition-colors cursor-pointer whitespace-nowrap"
                : navLinkClass
            }
            title={item.title}
          >
            {item.label}
          </button>
        );
      })}
    </>
  );

  const copyOrgUrl = async () => {
    try {
      await navigator.clipboard.writeText(instanceUrl);
      setCopiedOrg(true);
      window.setTimeout(() => setCopiedOrg(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--color-canvas)]/95 backdrop-blur-sm border-b border-[var(--color-line)]">
      <div className="w-full px-5 flex items-center justify-between h-[64px] gap-3">
        <Link href="/" className="sf-brand" aria-label="Salesforce sObject Payload Studio - Architect Toolkit">
          <span className="sf-brand__title">
            <span className="sf-brand__lead">Salesforce</span>
            <span className="sf-brand__rest">sObject Payload Studio</span>
          </span>
          <span className="sf-brand__tagline">Architect Toolkit</span>
        </Link>

        <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-[var(--color-ink-soft)]" aria-label="Product">
          {renderNavItems()}
          <a
            href="https://workbench.developerforce.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--color-ink)] transition-colors"
          >
            Workbench ↗
          </a>
        </nav>

        <div className="flex items-center gap-2">
          {/* Collection tray */}
          <button
            type="button"
            onClick={onCollectionClick}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-line)] text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:border-[var(--color-accent)] transition-all cursor-pointer"
            title={collectionCount === 0 ? "Staged request collection (empty)" : `Open collection (${collectionCount} staged)`}
            aria-label={`Open request collection, ${collectionCount} staged requests`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
            </svg>
            <span className="hidden sm:inline">Collection</span>
            {collectionCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-ivory-950 text-ivory-100 text-[10px] font-bold">
                {collectionCount > 99 ? "99+" : collectionCount}
              </span>
            )}
          </button>
          {connected && (
            <button
              type="button"
              onClick={onSearchClick}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-line)] text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:border-[var(--color-accent)] transition-all cursor-pointer"
              title="Find objects (Ctrl/⌘ K)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <span>Find objects</span>
              <kbd className="text-[10px] font-mono bg-[var(--color-canvas)] px-1.5 py-0.5 rounded border border-[var(--color-line)]">⌘K</kbd>
            </button>
          )}

          {/* Connectivity pill - status badge trigger, details live in the dropdown */}
          <div className="relative" ref={menuRef}>
            <div
              className="flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-xs"
              role="status"
              aria-label={connected ? `Connected to ${instanceUrl}` : "Not connected"}
              title={connected ? `${instanceUrl} · ${apiVersion} · ${objectCount} objects` : "Not connected"}
            >
              <span
                className={`status-dot ${connected ? "is-live" : ""}`}
                style={{
                  backgroundColor: connected ? "#4A7C59" : "#AEA48E",
                  color: connected ? "#4A7C59" : "#AEA48E",
                }}
                aria-hidden="true"
              />
              {connected ? (
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
                  <span className="font-medium text-[var(--color-muted)] hidden sm:inline">
                    {connecting ? "Connecting…" : "Offline"}
                  </span>
                  {!connecting && (
                    <button
                      type="button"
                      onClick={onConnectClick}
                      className="px-2.5 py-0.5 rounded-full bg-ivory-950 text-ivory-100 hover:bg-bronze-600 transition-colors cursor-pointer font-semibold"
                    >
                      Connect
                    </button>
                  )}
                </>
              )}
            </div>

            {connected && menuOpen && (
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
                    <p className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-ivory-950" title={instanceUrl}>
                      {instanceUrl.replace(/^https:\/\//, "")}
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
                  <p className="mt-1 text-[11px] text-ivory-600">
                    {apiVersion}
                    {objectCount > 0 && <> · {objectCount.toLocaleString()} objects</>}
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={closeMenu(onSearchClick)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-ivory-800 hover:bg-ivory-200 transition-colors cursor-pointer"
                    title="Find objects (⌘K)"
                  >
                    Find
                    <kbd className="font-mono text-[10px] text-ivory-500">⌘K</kbd>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={closeMenu(onConnectClick)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-ivory-800 hover:bg-ivory-200 transition-colors cursor-pointer"
                    title="Connect a different org"
                  >
                    Switch org
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={closeMenu(onDisconnect)}
                    aria-label="Disconnect"
                    title="Disconnect"
                    className="flex items-center justify-center rounded-lg p-2 text-ivory-500 hover:text-red-700 hover:bg-red-500/10 transition-colors cursor-pointer"
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
        {renderNavItems()}
        <a
          href="https://workbench.developerforce.com"
          target="_blank"
          rel="noreferrer"
          className="hover:text-[var(--color-ink)] transition-colors whitespace-nowrap"
        >
          Workbench ↗
        </a>
      </nav>
    </header>
  );
}
