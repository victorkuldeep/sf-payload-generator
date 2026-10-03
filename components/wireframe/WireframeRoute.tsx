"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "../ui/Button";
import { canTransition, newExperience, type Experience, type SnapshotStatus } from "@/lib/wireframe/model";
import { deleteExperience, listExperiences, saveExperience } from "@/lib/wireframe/store";

const STATUS_STYLE: Record<SnapshotStatus, string> = {
  draft: "bg-[#F5F1E8] text-[#777168] border-[#E3D9C6]",
  "in-review": "bg-[#F5EEDF] text-[#8A6A2F] border-[#E5C98F]",
  approved: "bg-[#EAF3ED] text-[#2F7D4F] border-[#BFDCC9]",
};

const STATUS_LABEL: Record<SnapshotStatus, string> = {
  draft: "Draft",
  "in-review": "In review",
  approved: "Approved",
};

/**
 * Wireframe Studio route (EPIC 01): experience library with the
 * approval workflow. The canvas itself lands in EPIC 02; this shell owns
 * identity, version, status - the model, not the pixels.
 */
export function WireframeRoute() {
  const [items, setItems] = useState<Experience[]>([]);
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setItems(await listExperiences().catch(() => []));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    const exp = newExperience(name);
    if (await saveExperience(exp).catch(() => false)) {
      setName("");
      setActiveId(exp.id);
      await refresh();
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this experience and its screens?")) return;
    await deleteExperience(id).catch(() => {});
    if (activeId === id) setActiveId(null);
    await refresh();
  };

  const transition = async (exp: Experience, to: SnapshotStatus) => {
    if (!canTransition(exp.status, to)) return;
    if (await saveExperience({ ...exp, status: to }).catch(() => false)) {
      await refresh();
    }
  };

  const active = items.find((i) => i.id === activeId) ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        {!active ? (
          <>
            <svg
              width="430"
              height="150"
              viewBox="0 0 430 150"
              fill="none"
              aria-hidden="true"
              className="mx-auto mt-1 h-auto w-full max-w-[400px]"
            >
              <rect x="115" y="14" width="200" height="122" rx="12" fill="#FFFFFF" stroke="#9A7653" strokeWidth="1.5" />
              <rect x="115" y="14" width="200" height="22" rx="11" fill="#F5F1E8" stroke="#9A7653" strokeWidth="1.5" />
              <circle cx="131" cy="25" r="3" fill="#C9A86A" />
              <circle cx="141" cy="25" r="3" fill="#C9A86A" />
              <circle cx="151" cy="25" r="3" fill="#C9A86A" />
              <rect x="129" y="48" width="120" height="10" rx="5" fill="#27241F" />
              <rect x="129" y="64" width="172" height="8" rx="4" fill="#E3D9C6" />
              <rect x="129" y="78" width="80" height="26" rx="6" fill="#FFFFFF" stroke="#9A7653" strokeWidth="1.5" />
              <rect x="217" y="78" width="80" height="26" rx="6" fill="#FFFFFF" stroke="#E3D9C6" strokeWidth="1.5" />
              <rect x="129" y="110" width="172" height="14" rx="7" fill="#C9A86A" />
              <line x1="315" y1="75" x2="352" y2="75" stroke="#C9A86A" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="352" cy="75" r="9" fill="#27241F" />
              <path d="M348 75 L351.5 78.5 L357 71.5" stroke="#C9A86A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <text x="215" y="148" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10" fontWeight="700" fill="#A39B8E">SCREEN · BIND · SHIP</text>
            </svg>
            <h2 className="mt-1 text-center text-[15px] font-semibold text-[#27241F]">Wireframe Studio</h2>
            <p className="mx-auto mt-1 max-w-xl text-center text-xs text-[#777168]">
              Schema-aware experience modeling: screens composed of structured, composable assets bound to Salesforce
              schema - existing, proposed or external. The canvas is a view; the model is the truth.
            </p>
            <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[2px] text-[#A39B8E]">
              Experience · Schema · API · Build
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setActiveId(null)} title="Back to the library">
              ← Library
            </Button>
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#27241F]">{active.name}</h2>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[active.status]}`}>
              {STATUS_LABEL[active.status]} · v{active.version}
            </span>
            {active.status === "draft" && (
              <Button size="sm" variant="secondary" onClick={() => void transition(active, "in-review")}>
                Submit for review
              </Button>
            )}
            {active.status === "in-review" && (
              <>
                <Button size="sm" variant="secondary" onClick={() => void transition(active, "draft")}>
                  Request changes
                </Button>
                <Button size="sm" onClick={() => void transition(active, "approved")}>
                  Approve
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {!active && (
        <>
          <div className="flex gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
              }}
              placeholder="New experience - e.g. Customer Management Portal"
              aria-label="New experience name"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl border border-[#E8E2D8] bg-white px-3 py-2 text-[13px] text-[#27241F] placeholder-[#A39B8E] focus:border-[#C9A86A] focus:outline-none"
            />
            <Button onClick={() => void create()}>New experience</Button>
          </div>

          {loaded && items.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((exp) => (
                <li key={exp.id} className="group flex items-center gap-2 rounded-xl border border-[#E8E2D8] bg-white px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveId(exp.id)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    title={`Open ${exp.name}`}
                  >
                    <span className="block truncate text-[13px] font-semibold text-[#27241F]">{exp.name}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-[#A39B8E]">
                      v{exp.version} · {exp.screens.length} screen{exp.screens.length === 1 ? "" : "s"} ·{" "}
                      {new Date(exp.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[exp.status]}`}>
                    {STATUS_LABEL[exp.status]}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(exp.id)}
                    title={`Delete ${exp.name}`}
                    aria-label={`Delete ${exp.name}`}
                    className="shrink-0 rounded p-1 text-[#C9BFAE] opacity-0 transition-colors cursor-pointer hover:bg-red-500/10 hover:text-red-700 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {loaded && items.length === 0 && (
            <p className="rounded-xl border border-dashed border-[#E3D9C6] px-4 py-6 text-center text-xs text-[#777168]">
              No experiences yet - name one above and start modeling. The design canvas arrives in EPIC 02.
            </p>
          )}
        </>
      )}

      {active && (
        <div className="rounded-xl border border-dashed border-[#E3D9C6] bg-white px-4 py-10 text-center">
          <p className="text-[13px] font-semibold text-[#27241F]">Design canvas lands in EPIC 02</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[#777168]">
            {active.name} holds {active.screens.length} screen{active.screens.length === 1 ? "" : "s"} and{" "}
            {active.proposedFields.length} proposed field{active.proposedFields.length === 1 ? "" : "s"}.
            Only <span className="font-semibold text-[#2F7D4F]">approved</span> snapshots feed the Author-mode prefill queue.
          </p>
        </div>
      )}
    </div>
  );
}
