"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavMode = "home" | "builder" | "composite" | "soql" | "graphql" | "schema" | "rest";

interface AppHeaderProps {
  connected: boolean;
  instanceUrl: string;
  apiVersion: string;
  objectCount: number;
  connecting: boolean;
  onConnectClick: () => void;
  onDisconnect: () => void;
  onNavigate: (mode: NavMode) => void;
  /** Current mode - the matching tab renders underlined. Omit on routes. */
  activeMode?: NavMode;
}

export function AppHeader({
  connected,
  instanceUrl,
  apiVersion,
  objectCount,
  connecting,
  onConnectClick,
  onDisconnect,
  onNavigate,
  activeMode,
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

  // Grouped product navigation (Home + Console stay direct; the studios sit
  // under Build / Design / Deliver hover panels). One structure drives both
  // desktop panels and the mobile scroll row so they cannot drift apart.
  type ModeEntry = { kind: "mode"; id: Exclude<NavMode, "home">; label: string; desc: string };
  type RouteEntry = { kind: "route"; href: string; label: string; desc: string; plus?: boolean };
  type NavEntry = ModeEntry | RouteEntry;
  interface NavGroup {
    id: string;
    label: string;
    items: NavEntry[];
  }

  const navGroups: NavGroup[] = [
    {
      id: "build",
      label: "Build",
      items: [
        { kind: "mode", id: "builder", label: "Builder", desc: "Single-object payload builder" },
        { kind: "mode", id: "composite", label: "Composite", desc: "Composite batch builder" },
        { kind: "mode", id: "soql", label: "Query", desc: "SOQL + SOSL query builder" },
        { kind: "mode", id: "graphql", label: "GraphQL", desc: "GraphQL query builder" },
        { kind: "mode", id: "rest", label: "Rest", desc: "REST explorer" },
      ],
    },
    {
      id: "design",
      label: "Design",
      items: [
        { kind: "mode", id: "schema", label: "Schema", desc: "ERD + graph schema explorer" },
        { kind: "route", href: "/system", label: "System", desc: "Visual architecture and integration workbench" },
        { kind: "route", href: "/sequence", label: "Sequence", desc: "Describe the interaction, see the architecture" },
        { kind: "route", href: "/wireframe", label: "Wireframe", desc: "Schema-aware experience modeling" },
        { kind: "route", href: "/draw", label: "Draw", plus: true, desc: "Engineering whiteboard" },
      ],
    },
    {
      id: "govern",
      label: "Govern",
      items: [
        { kind: "route", href: "/decisions", label: "Decisions", desc: "Architecture Decision Records" },
        { kind: "route", href: "/requirements", label: "Requirements", desc: "Intent with derived coverage" },
      ],
    },
    {
      id: "deliver",
      label: "Deliver",
      items: [
        { kind: "route", href: "/contracts", label: "Contracts", desc: "OpenAPI profiles" },
        { kind: "route", href: "/architect", label: "Architect", desc: "Design custom APIs" },
        { kind: "route", href: "/json", label: "JSON", desc: "Editor and A/B payload comparator" },
      ],
    },
  ];

  const pathname = usePathname();
  const activeClass =
    "text-[var(--color-ink)] underline underline-offset-4 decoration-[var(--color-accent)] decoration-2 font-semibold transition-colors";
  const idleClass = "hover:text-[var(--color-ink)] transition-colors";

  const isEntryActive = (entry: NavEntry) =>
    entry.kind === "mode" ? entry.id === activeMode : pathname === entry.href;

  const entryHint = (entry: NavEntry) =>
    entry.kind === "mode" && !connected ? `Connect to open ${entry.label}` : entry.desc;

  const renderEntryLabel = (entry: NavEntry) => (
    <>
      {entry.label}
      {entry.kind === "route" && entry.plus && (
        <sup className="ml-[1px] text-[var(--color-accent)]">+</sup>
      )}
    </>
  );

  /** Row inside a desktop hover panel: label + one-line description. */
  const renderPanelEntry = (entry: NavEntry) => {
    const active = isEntryActive(entry);
    const cls = `block w-full rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer ${
      active ? "bg-[var(--color-canvas)]" : "hover:bg-[var(--color-canvas)]"
    }`;
    const body = (
      <>
        <span className="block text-xs font-semibold text-[var(--color-ink)]">
          {renderEntryLabel(entry)}
        </span>
        <span className="block text-[11px] text-[var(--color-muted)]">{entry.desc}</span>
      </>
    );
    return entry.kind === "mode" ? (
      <button
        key={entry.id}
        type="button"
        onClick={() => onNavigate(entry.id)}
        aria-current={active ? "page" : undefined}
        title={entryHint(entry)}
        className={cls}
      >
        {body}
      </button>
    ) : (
      <Link
        key={entry.href}
        href={entry.href}
        aria-current={active ? "page" : undefined}
        title={entry.desc}
        className={cls}
      >
        {body}
      </Link>
    );
  };

  /** Flat item for the mobile scroll row. */
  const renderFlatEntry = (entry: NavEntry) => {
    const active = isEntryActive(entry);
    const cls = `whitespace-nowrap ${active ? activeClass : `${idleClass} cursor-pointer`}`;
    return entry.kind === "mode" ? (
      <button
        key={entry.id}
        type="button"
        onClick={() => onNavigate(entry.id)}
        aria-current={active ? "page" : undefined}
        className={cls}
        title={entryHint(entry)}
      >
        {renderEntryLabel(entry)}
      </button>
    ) : (
      <Link
        key={entry.href}
        href={entry.href}
        aria-current={active ? "page" : undefined}
        className={cls}
        title={entry.desc}
      >
        {renderEntryLabel(entry)}
      </Link>
    );
  };

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
    <header className="app-chrome-header sticky top-0 z-40 w-full bg-[var(--color-canvas)]/95 backdrop-blur-sm border-b border-[var(--color-line)]">
      <div className="w-full px-5 flex items-center justify-between h-[54px] gap-3">
        <Link href="/" className="gravenx-brand" aria-label="GRAVENX - Engineering Studio">
          <span className="gravenx-brand__title">
            <span className="gravenx-brand__lead">GRAVEN</span>
            <span className="gravenx-brand__rest">X</span>
          </span>
          <span className="gravenx-brand__tagline">Engineering Studio</span>
        </Link>

        <nav className="hidden md:flex items-stretch gap-5 text-xs font-medium text-[var(--color-ink-soft)]" aria-label="Product">
          <button
            type="button"
            onClick={() => onNavigate("home")}
            aria-current={activeMode === "home" ? "page" : undefined}
            title="Back to the start"
            className={`cursor-pointer self-center whitespace-nowrap ${activeMode === "home" ? activeClass : idleClass}`}
          >
            Home
          </button>
          {navGroups.map((group) => {
            const groupActive = group.items.some(isEntryActive);
            return (
              <div key={group.id} className="group relative flex items-stretch">
                <button
                  type="button"
                  aria-haspopup="true"
                  title={`${group.label} studios`}
                  className={`flex cursor-pointer items-center gap-1 whitespace-nowrap ${groupActive ? activeClass : idleClass}`}
                >
                  {group.label}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="transition-transform group-hover:rotate-180">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <div role="menu" aria-label={group.label} className="w-64 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-1.5 shadow-[0_16px_48px_-12px_rgba(24,20,12,0.35)]">
                    {group.items.map(renderPanelEntry)}
                  </div>
                </div>
              </div>
            );
          })}
          <Link
            href="/console"
            aria-current={pathname === "/console" ? "page" : undefined}
            className={`self-center whitespace-nowrap ${pathname === "/console" ? activeClass : idleClass}`}
            title="Console - architect task manager, two-way sync with canvas TODOs"
          >
            Console
          </Link>
        </nav>

        <div className="flex items-center gap-2">
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
                  <p className="mt-1 font-inter text-[11px] text-ivory-600">
                    {apiVersion}
                    {objectCount > 0 && <> · {objectCount.toLocaleString()} objects</>}
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={closeMenu(onConnectClick)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold bg-ivory-950 text-ivory-100 hover:bg-bronze-600 transition-colors cursor-pointer"
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
          <Link
            href="/docs"
            aria-current={pathname === "/docs" ? "page" : undefined}
            aria-label="Docs"
            title="Docs - architect onboarding and guides"
            className={`shrink-0 rounded-full border p-2 transition-colors ${
              pathname === "/docs"
                ? "border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-ink)]"
                : "border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </Link>
        </div>
      </div>
      <nav className="md:hidden flex items-center gap-4 overflow-x-auto px-5 pb-2.5 text-xs font-medium text-[var(--color-ink-soft)]" aria-label="Product">
        <button
          type="button"
          onClick={() => onNavigate("home")}
          aria-current={activeMode === "home" ? "page" : undefined}
          title="Back to the start"
          className={`whitespace-nowrap cursor-pointer ${activeMode === "home" ? activeClass : idleClass}`}
        >
          Home
        </button>
        {navGroups.flatMap((group) => group.items.map(renderFlatEntry))}
        <Link
          href="/console"
          aria-current={pathname === "/console" ? "page" : undefined}
          className={`whitespace-nowrap ${pathname === "/console" ? activeClass : idleClass}`}
          title="Console - architect task manager, two-way sync with canvas TODOs"
        >
          Console
        </Link>
      </nav>
    </header>
  );
}
