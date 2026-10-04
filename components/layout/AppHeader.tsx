"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type ModeEntry = { kind: "mode"; id: Exclude<NavMode, "home">; label: string; desc: string };
type RouteEntry = { kind: "route"; href: string; label: string; desc: string; plus?: boolean };
type NavEntry = ModeEntry | RouteEntry;
interface NavGroup {
  id: string;
  label: string;
  eyebrow: string;
  headline: string;
  punch: string;
  items: NavEntry[];
}

/** Small graph mark for the mega-panel brand zone - nodes and edges, the product in miniature. */
function BrandMark() {
  return (
    <svg width="36" height="22" viewBox="0 0 36 22" fill="none" stroke="#C9A86A" strokeWidth="1.6" aria-hidden="true">
      <path d="M8.6 9.8 14.4 7.2M8.6 12.2 14.4 14.8M19.6 7.2 25.4 9.8M19.6 14.8 25.4 12.2" />
      <circle cx="6" cy="11" r="3" />
      <circle cx="17" cy="6" r="3" />
      <circle cx="17" cy="16" r="3" />
      <circle cx="28" cy="11" r="3" />
    </svg>
  );
}

/**
 * Full-width mega-panel for a nav group: brand zone on the left, sub-tab
 * links in the middle, and the hovered entry's tagline on the right.
 * Dark chocolate, cream and burgundy - the tab as architecture, not menu.
 */
function MegaPanel({
  group,
  open,
  isEntryActive,
  onNavigate,
  onPick,
  entryHint,
  renderLabel,
}: {
  group: NavGroup;
  open: boolean;
  isEntryActive: (entry: NavEntry) => boolean;
  onNavigate?: (mode: NavMode) => void;
  /** Close the panel (link click, Escape, route change). */
  onPick: () => void;
  entryHint: (entry: NavEntry) => string;
  renderLabel: (entry: NavEntry) => ReactNode;
}) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const keyOf = (e: NavEntry): string => (e.kind === "mode" ? `mode:${e.id}` : `route:${e.href}`);
  const active = group.items.find(isEntryActive) ?? null;
  const shown = group.items.find((e) => keyOf(e) === hoverKey) ?? active ?? group.items[0];

  const linkCls = (entry: NavEntry): string => {
    const on = isEntryActive(entry) || keyOf(entry) === hoverKey;
    return `group/link flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
      on ? "bg-white/[0.07]" : ""
    }`;
  };
  const labelCls = (entry: NavEntry): string =>
    `text-[15px] font-semibold transition-colors ${
      isEntryActive(entry) || keyOf(entry) === hoverKey ? "text-white" : "text-[#EFE3CC]"
    }`;

  const renderMegaEntry = (entry: NavEntry) => {
    const k = keyOf(entry);
    const marker = (
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-opacity ${
          isEntryActive(entry) ? "bg-[#C4505C] opacity-100" : "bg-[#C9A86A] opacity-0 group-hover/link:opacity-100"
        }`}
      />
    );
    const body = (
      <>
        {marker}
        <span className={labelCls(entry)}>{renderLabel(entry)}</span>
      </>
    );
    if (entry.kind === "route") {
      return (
        <Link
          key={entry.href}
          href={entry.href}
          role="menuitem"
          onClick={onPick}
          onMouseEnter={() => setHoverKey(k)}
          onFocus={() => setHoverKey(k)}
          aria-current={isEntryActive(entry) ? "page" : undefined}
          title={entry.desc}
          className={linkCls(entry)}
        >
          {body}
        </Link>
      );
    }
    // Home wires onNavigate; every other route deep-links the mode instead.
    if (onNavigate) {
      return (
        <button
          key={entry.id}
          type="button"
          role="menuitem"
          onClick={() => {
            onPick();
            onNavigate(entry.id);
          }}
          onMouseEnter={() => setHoverKey(k)}
          onFocus={() => setHoverKey(k)}
          aria-current={isEntryActive(entry) ? "page" : undefined}
          title={entryHint(entry)}
          className={linkCls(entry)}
        >
          {body}
        </button>
      );
    }
    return (
      <Link
        key={entry.id}
        href={`/?tab=${entry.id}`}
        role="menuitem"
        onClick={onPick}
        onMouseEnter={() => setHoverKey(k)}
        onFocus={() => setHoverKey(k)}
        aria-current={isEntryActive(entry) ? "page" : undefined}
        title={entryHint(entry)}
        className={linkCls(entry)}
      >
        {body}
      </Link>
    );
  };

  return (
    <div
      className={`fixed inset-x-0 top-[53px] z-50 transition-opacity duration-150 ${
        open ? "visible opacity-100" : "invisible opacity-0"
      }`}
    >
      <div className="border-b border-[#3A2318] bg-[#201209] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.55)]">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-8 py-8 md:grid-cols-[250px_1fr_230px]">
          <div>
            <BrandMark />
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[2px] text-[#C9A86A]">{group.eyebrow}</p>
            <p className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight text-[#F4EAD6]">{group.headline}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#BFA98C]">{group.punch}</p>
          </div>
          <div role="menu" aria-label={group.label} className={`grid content-start gap-0.5 ${group.items.length > 2 ? "sm:grid-cols-2" : ""}`}>
            {group.items.map(renderMegaEntry)}
          </div>
          <div className="border-l border-white/10 pl-8" aria-live="polite">
            <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[#8F7A5F]">On this tab</p>
            {shown && (
              <>
                <p className="mt-2 text-lg font-bold leading-snug text-[#F4EAD6]">{renderLabel(shown)}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#BFA98C]">{shown.desc}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type NavMode = "home" | "builder" | "composite" | "soql" | "graphql" | "schema" | "rest";

interface AppHeaderProps {
  connected?: boolean;
  instanceUrl?: string;
  apiVersion?: string;
  objectCount?: number;
  connecting?: boolean;
  onConnectClick?: () => void;
  onDisconnect?: () => void;
  onNavigate?: (mode: NavMode) => void;
  /** Current mode - the matching tab renders underlined. Omit on routes. */
  activeMode?: NavMode;
}

const ROUTE_OFFLINE = { connected: false, instanceUrl: "", apiVersion: "", objectCount: 0 };

export function AppHeader(props: AppHeaderProps) {
  const { onNavigate, activeMode } = props;
  const router = useRouter();
  // Route pages render bare: the session comes from the tab-scoped store,
  // exactly like the old ToolHeader did. Home passes live props instead.
  const [routeSession, setRouteSession] = useState(ROUTE_OFFLINE);
  useEffect(() => {
    if (props.connected !== undefined) return;
    const read = () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem("gravenx_session") ?? "null") as {
          instanceUrl?: string;
          token?: string;
          apiVersion?: string;
        } | null;
        setRouteSession(
          saved?.token && saved?.instanceUrl
            ? { connected: true, instanceUrl: saved.instanceUrl, apiVersion: saved.apiVersion ?? "", objectCount: 0 }
            : ROUTE_OFFLINE,
        );
      } catch {
        setRouteSession(ROUTE_OFFLINE);
      }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
    };
  }, [props.connected]);
  const connected = props.connected ?? routeSession.connected;
  const instanceUrl = props.instanceUrl ?? routeSession.instanceUrl;
  const apiVersion = props.apiVersion ?? routeSession.apiVersion;
  const objectCount = props.objectCount ?? routeSession.objectCount;
  const connecting = props.connecting ?? false;
  const onConnectClick = props.onConnectClick ?? (() => router.push("/"));
  const onDisconnect =
    props.onDisconnect ??
    (() => {
      try {
        sessionStorage.removeItem("gravenx_session");
      } catch {
        /* storage unavailable */
      }
      setRouteSession(ROUTE_OFFLINE);
    });
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedOrg, setCopiedOrg] = useState(false);
  // Controlled mega-panels: hover intent with a grace timer (sub-pixel gaps
  // must not slam the panel), closed on pick, route change, or Escape.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const openPanel = (id: string) => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpenGroup(id);
  };
  const scheduleClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setOpenGroup(null);
    }, 140);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroup(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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

  // Grouped product navigation. Build / Design / Govern / Deliver open
  // full-width mega-panels; JSON, Draw+ and Console stand alone at the end.
  // The same structures drive desktop panels and the mobile scroll row so
  // they cannot drift apart.
  const navGroups: NavGroup[] = [
    {
      id: "build",
      label: "Build",
      eyebrow: "Build",
      headline: "Shape every payload.",
      punch: "Accurate REST, composite and query payloads from live metadata - no manual field copy-paste.",
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
      eyebrow: "Design",
      headline: "Think in systems.",
      punch: "Topologies, sequences and experiences on canvas - architecture before implementation.",
      items: [
        { kind: "mode", id: "schema", label: "Schema", desc: "ERD + graph schema explorer" },
        { kind: "route", href: "/system", label: "System", desc: "Visual architecture and integration workbench" },
        { kind: "route", href: "/sequence", label: "Sequence", desc: "Describe the interaction, see the architecture" },
        { kind: "route", href: "/wireframe", label: "Wireframe", desc: "Schema-aware experience modeling" },
      ],
    },
    {
      id: "govern",
      label: "Govern",
      eyebrow: "Govern",
      headline: "Decide with receipts.",
      punch: "Decision records and requirements with derived coverage - trace every choice.",
      items: [
        { kind: "route", href: "/decisions", label: "Decisions", desc: "Architecture Decision Records" },
        { kind: "route", href: "/requirements", label: "Requirements", desc: "Intent with derived coverage" },
      ],
    },
    {
      id: "deliver",
      label: "Deliver",
      eyebrow: "Deliver",
      headline: "Ship the contract.",
      punch: "Contracts and custom APIs - the handoff engineers trust.",
      items: [
        { kind: "route", href: "/contracts", label: "Contracts", desc: "OpenAPI profiles" },
        { kind: "route", href: "/architect", label: "Architect", desc: "Design custom APIs" },
      ],
    },
  ];

  /** Standalone tabs after the groups: JSON, Draw+, Console. */
  const standaloneRoutes: RouteEntry[] = [
    { kind: "route", href: "/json", label: "JSON", desc: "Editor and A/B payload comparator" },
    { kind: "route", href: "/draw", label: "Draw", plus: true, desc: "Engineering whiteboard" },
    { kind: "route", href: "/console", label: "Console", desc: "Architect task manager, two-way sync with canvas TODOs" },
  ];

  const pathname = usePathname();
  // Navigation always closes the panel - the red-dot-active tab never sits
  // under an open menu.
  useEffect(() => {
    setOpenGroup(null);
  }, [pathname]);
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

  /** Flat item for the mobile scroll row and standalone desktop tabs. */
  const renderFlatEntry = (entry: NavEntry) => {
    const active = isEntryActive(entry);
    const cls = `whitespace-nowrap self-center ${active ? activeClass : `${idleClass} cursor-pointer`}`;
    if (entry.kind === "route") {
      return (
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
    }
    // Home wires onNavigate; every other route deep-links the mode instead.
    if (onNavigate) {
      return (
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
      );
    }
    return (
      <Link
        key={entry.id}
        href={`/?tab=${entry.id}`}
        aria-current={active ? "page" : undefined}
        className={cls}
        title={entryHint(entry)}
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
          {onNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate("home")}
              aria-current={activeMode === "home" ? "page" : undefined}
              title="Back to the start"
              className={`cursor-pointer self-center whitespace-nowrap ${activeMode === "home" ? activeClass : idleClass}`}
            >
              Home
            </button>
          ) : (
            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              title="Back to the start"
              className={`self-center whitespace-nowrap ${pathname === "/" ? activeClass : idleClass}`}
            >
              Home
            </Link>
          )}
          {navGroups.map((group) => {
            const groupActive = group.items.some(isEntryActive);
            const open = openGroup === group.id;
            return (
              <div
                key={group.id}
                className="group flex items-stretch"
                onMouseEnter={() => openPanel(group.id)}
                onMouseLeave={scheduleClose}
              >
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={open}
                  onFocus={() => openPanel(group.id)}
                  onClick={() => (open ? setOpenGroup(null) : openPanel(group.id))}
                  title={`${group.label} studios`}
                  className={`flex cursor-pointer items-center gap-1 whitespace-nowrap ${groupActive ? activeClass : idleClass}`}
                >
                  {group.label}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <MegaPanel
                  group={group}
                  open={open}
                  isEntryActive={isEntryActive}
                  onNavigate={onNavigate}
                  onPick={() => setOpenGroup(null)}
                  entryHint={entryHint}
                  renderLabel={renderEntryLabel}
                />
              </div>
            );
          })}
          {standaloneRoutes.map(renderFlatEntry)}
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
        {onNavigate ? (
          <button
            type="button"
            onClick={() => onNavigate("home")}
            aria-current={activeMode === "home" ? "page" : undefined}
            title="Back to the start"
            className={`whitespace-nowrap cursor-pointer ${activeMode === "home" ? activeClass : idleClass}`}
          >
            Home
          </button>
        ) : (
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            title="Back to the start"
            className={`whitespace-nowrap ${pathname === "/" ? activeClass : idleClass}`}
          >
            Home
          </Link>
        )}
        {navGroups.flatMap((group) => group.items.map(renderFlatEntry))}
        {standaloneRoutes.map(renderFlatEntry)}
      </nav>
    </header>
  );
}
