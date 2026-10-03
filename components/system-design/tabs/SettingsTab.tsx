"use client";

/**
 * Settings tab: environments (base URLs only - secrets stay in the
 * session vault), production marking with run guardrails, run-evidence
 * retention, and storage maintenance.
 */

import { useEffect, useState } from "react";
import Button from "../../ui/Button";
import { deleteSystemRun, listSystemRuns } from "@/lib/system-design/runStore";
import { newId, type SystemProject } from "@/lib/system-design/model";
import { fieldLabel, monoInput, panelShell, textInput, type Mutate } from "./shared";

interface Props {
  project: SystemProject;
  mutate: Mutate;
}

export function SettingsTab({ project, mutate }: Props) {
  const [runCount, setRunCount] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", baseUrl: "" });

  useEffect(() => {
    let live = true;
    void listSystemRuns(100).then((runs) => {
      if (live) setRunCount(runs.length);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className={panelShell}>
      <h2 className="text-sm font-bold text-ivory-950">Settings</h2>

      <section aria-label="Environments" className="mt-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-ivory-950">Environments · {project.environments.length}</h3>
          <span className="text-[11px] text-ivory-500">base URLs only - tokens live in the session vault, never here</span>
        </div>
        <ul className="mt-1.5 space-y-1.5">
          {project.environments.map((e) => (
            <li key={e.id} className="rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="flex items-center gap-1.5" title="Active environment for runs">
                  <input
                    type="radio"
                    name="sd-active-env"
                    checked={project.activeEnvironmentId === e.id}
                    onChange={() => mutate((p) => ({ ...p, activeEnvironmentId: e.id }))}
                    className="cursor-pointer accent-amber-800"
                  />
                  <input
                    value={e.name}
                    onChange={(ev) => mutate((p) => ({ ...p, environments: p.environments.map((x) => (x.id === e.id ? { ...x, name: ev.target.value } : x)) }))}
                    spellCheck={false}
                    aria-label="Environment name"
                    className="w-32 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs font-bold text-ivory-950 hover:border-[var(--color-line)] focus:border-bronze-500 focus:outline-none"
                  />
                </label>
                <input
                  value={e.baseUrl}
                  onChange={(ev) => mutate((p) => ({ ...p, environments: p.environments.map((x) => (x.id === e.id ? { ...x, baseUrl: ev.target.value } : x)) }))}
                  placeholder="https://host (fallback when a system has no base URL)"
                  spellCheck={false}
                  aria-label={`Base URL for ${e.name}`}
                  className={`${monoInput} min-w-52 flex-1`}
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-bold text-red-700" title="Runs against this environment require an explicit confirm">
                  <input
                    type="checkbox"
                    checked={!!e.isProduction}
                    onChange={(ev) => mutate((p) => ({ ...p, environments: p.environments.map((x) => (x.id === e.id ? { ...x, isProduction: ev.target.checked || undefined } : x)) }))}
                    className="cursor-pointer accent-red-700"
                  />
                  PROD
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Delete environment "${e.name}"?`)) return;
                    mutate((p) => ({
                      ...p,
                      environments: p.environments.filter((x) => x.id !== e.id),
                      activeEnvironmentId: p.activeEnvironmentId === e.id ? null : p.activeEnvironmentId,
                    }));
                  }}
                  aria-label={`Delete environment ${e.name}`}
                  className="rounded px-1.5 text-ivory-400 hover:text-red-700 cursor-pointer"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex gap-1.5">
          <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Name, e.g. UAT" spellCheck={false} aria-label="New environment name" className={`${textInput} w-40`} />
          <input value={draft.baseUrl} onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))} placeholder="https://…" spellCheck={false} aria-label="New environment base URL" className={`${monoInput} min-w-52 flex-1`} />
          <Button
            size="sm"
            disabled={!draft.name.trim()}
            onClick={() => {
              if (!draft.name.trim()) return;
              mutate((p) => ({ ...p, environments: [...p.environments, { id: newId("env"), name: draft.name.trim(), baseUrl: draft.baseUrl.trim() }] }));
              setDraft({ name: "", baseUrl: "" });
            }}
          >
            + Environment
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ivory-600">
          Production environments are a guardrail, not a mode: every run targeting one asks for an explicit confirm first.
        </p>
      </section>

      <section aria-label="Retention" className="mt-4 border-t border-[var(--color-line-soft)] pt-3">
        <h3 className="text-xs font-bold text-ivory-950">Run evidence retention</h3>
        <div className="mt-1.5 flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ivory-800">
            Keep runs for
            <input
              type="number"
              min={1}
              max={365}
              value={project.settings.retentionDays}
              onChange={(e) => {
                const n = Number(e.target.value);
                mutate((p) => ({ ...p, settings: { retentionDays: !Number.isFinite(n) ? 30 : Math.min(365, Math.max(1, Math.trunc(n))) } }));
              }}
              aria-label="Retention days"
              className={`${monoInput} w-20`}
            />
            days
          </label>
          <span className="text-[11px] text-ivory-500">The Runs tab prunes older evidence on request - nothing auto-deletes.</span>
        </div>
      </section>

      <section aria-label="Storage" className="mt-4 border-t border-[var(--color-line-soft)] pt-3">
        <h3 className="text-xs font-bold text-ivory-950">Storage</h3>
        <div className="mt-1.5 flex items-center gap-2">
          <p className="text-xs text-ivory-700">{runCount === null ? "Counting run evidence…" : `${runCount} saved run${runCount === 1 ? "" : "s"} in this browser.`}</p>
          <Button
            size="sm"
            variant="ghost"
            disabled={!runCount}
            onClick={async () => {
              if (!window.confirm("Delete ALL saved run evidence in this browser?")) return;
              const all = await listSystemRuns(100);
              for (const r of all) await deleteSystemRun(r.id);
              setRunCount(0);
            }}
          >
            Clear all runs
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ivory-600">
          <span className={fieldLabel}>Safety</span>
          Real calls go through the allowlisted execution proxy; private hosts (VPN / Zscaler) are unreachable by design - mock those operations instead. Never paste literal secrets into headers, mocks, or payloads; use vault variables.
        </p>
      </section>
    </div>
  );
}
