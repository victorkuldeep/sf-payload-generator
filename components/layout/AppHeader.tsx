"use client";

import Link from "next/link";

interface AppHeaderProps {
  connected: boolean;
  instanceUrl: string;
  apiVersion: string;
  objectCount: number;
  connecting: boolean;
  onConnectClick: () => void;
  onDisconnect: () => void;
  onSearchClick: () => void;
  onNavigate: (mode: "builder" | "composite" | "graphql" | "schema") => void;
  collectionCount: number;
  onCollectionClick: () => void;
}

function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.length > 32 ? url.slice(0, 32) + "…" : url;
  }
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
  collectionCount,
  onCollectionClick,
}: AppHeaderProps) {
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
          <button
            type="button"
            onClick={() => onNavigate("builder")}
            className="hover:text-[var(--color-ink)] hover:underline underline-offset-4 transition-colors cursor-pointer"
            title={connected ? "Go to single-object builder" : "Connect to open the builder"}
          >
            Builder
          </button>
          <button
            type="button"
            onClick={() => onNavigate("composite")}
            className="hover:text-[var(--color-ink)] hover:underline underline-offset-4 transition-colors cursor-pointer"
            title={connected ? "Go to composite builder" : "Connect to open composite"}
          >
            Composite
          </button>
          <button
            type="button"
            onClick={() => onNavigate("graphql")}
            className="hover:text-[var(--color-ink)] hover:underline underline-offset-4 transition-colors cursor-pointer"
            title={connected ? "Go to GraphQL query builder" : "Connect to open GraphQL"}
          >
            GraphQL
          </button>
          <button
            type="button"
            onClick={() => onNavigate("schema")}
            className="hover:text-[var(--color-ink)] hover:underline underline-offset-4 transition-colors cursor-pointer"
            title={connected ? "Go to schema deep dive" : "Connect to open the ERD"}
          >
            Schema
          </button>
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

          {/* Connectivity pill */}
          <div
            className={`flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-full border text-xs ${
              connected
                ? "bg-[var(--color-success-bg)] border-green-200 text-green-800"
                : "bg-[var(--color-surface)] border-[var(--color-line)] text-[var(--color-muted)]"
            }`}
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
            <span className="font-medium max-w-[150px] truncate hidden sm:inline">
              {connected ? shortHost(instanceUrl) : connecting ? "Connecting…" : "Offline"}
            </span>
            {connected ? (
              <button
                type="button"
                onClick={onDisconnect}
                className="px-2 py-0.5 rounded-full hover:bg-red-500/10 hover:text-red-700 transition-colors cursor-pointer font-medium"
                title="Disconnect"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectClick}
                className="px-2.5 py-0.5 rounded-full bg-ivory-950 text-ivory-100 hover:bg-bronze-600 transition-colors cursor-pointer font-semibold"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
