"use client";

import Button from "./ui/Button";

interface WelcomeModalProps {
  open: boolean;
  onConnect: () => void;
  onExplore: () => void;
}

const ARSENAL: { title: string; body: string }[] = [
  { title: "Builder", body: "Single-record REST payloads across 10 tabs - required fields autopicked with samples." },
  { title: "Composite", body: "25-request transactions with reference chaining across 10 bundles, one call." },
  { title: "Query", body: "SOQL with query plan, then CSV + JSON export straight to Collections." },
  { title: "GraphQL", body: "Object + field picker with read-only runs against your org." },
  { title: "Schema", body: "ERD tables + radial graph, Neural auto-map, laser present mode, hi-res PNG." },
  { title: "Rest", body: "Any-method explorer for the long tail of platform APIs, collectable." },
  { title: "JSON Studio", body: "Editor, graph and diff views with a laser pointer for walkthroughs." },
  { title: "Validate", body: "OpenAPI 3.0 / 3.1 payload conformance with exact $. finding paths." },
  { title: "Mapping", body: "Source-to-Salesforce field maps, drift fingerprint, Excel handoff." },
  { title: "Experience", body: "Screen flows, API bindings and Word / Excel deliverables per workspace." },
  { title: "Contracts", body: "Versioned API contract profiles and revisions, one source of truth." },
  { title: "Architect", body: "Solution design room - sketches, decisions and delivery notes together." },
];

export function WelcomeModal({ open, onConnect, onExplore }: WelcomeModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="modal-card max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 sm:px-10 pt-8 pb-6 border-b border-[var(--color-line-soft)] text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
            Salesforce API Workbench
          </p>
          <h2 id="welcome-title" className="hero-title mt-2 text-4xl sm:text-5xl">
            Payloads without <em>the grunt work.</em>
          </h2>
          <p className="mx-auto mt-3 text-sm leading-relaxed text-ivory-700 max-w-2xl">
            Welcome to <strong className="text-ivory-950">sObject Studio</strong> - twelve
            tools, one session. Connect once, then build payloads, map data models,
            validate contracts and present the graph - no manual field copy-paste.
          </p>
        </div>

        <div className="px-6 sm:px-10 py-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ARSENAL.map((t) => (
            <div key={t.title} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)] p-4">
              <p className="text-xs font-bold text-ivory-950">{t.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ivory-600">{t.body}</p>
            </div>
          ))}
        </div>

        <div className="px-6 sm:px-10 pb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <Button size="lg" onClick={onConnect} className="sm:flex-1">
            Connect to Salesforce
          </Button>
          <Button size="lg" variant="secondary" onClick={onExplore} className="sm:flex-1">
            Explore the studio first
          </Button>
        </div>

        <p className="px-6 sm:px-10 pb-6 text-center text-[11px] text-ivory-600">
          Your access token is never written to disk - session memory only.
        </p>
      </div>
    </div>
  );
}
