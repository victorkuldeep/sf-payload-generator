"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "../ui/Button";
import { analyzeProject, sequencesForProject, type RiskFinding } from "@/lib/risks/rules";
import type { SystemProject } from "@/lib/system-design/model";
import { listSequences } from "@/lib/sequence/store";
import { linkDecision, newDecision, nextDecisionNumber } from "@/lib/decisions/model";
import { listDecisions, saveDecision } from "@/lib/decisions/store";
import type { SequenceDocument } from "@/lib/sequence/model";

const SEVERITY_STYLE: Record<RiskFinding["severity"], string> = {
  high: "border-red-300 bg-red-50 text-red-700",
  medium: "border-[#E3D9C6] bg-[#FBF6EC] text-[#7A5C3A]",
  low: "border-[var(--color-line-soft)] bg-[var(--color-canvas)] text-ivory-600",
};

/**
 * Risk lens dialog: deterministic findings over the open project, each
 * citing its records. Any finding can become a linked ADR proposal.
 */
export function RisksDialog({
  project,
  onClose,
  onSelectNode,
}: {
  project: SystemProject;
  onClose: () => void;
  onSelectNode: (id: string) => void;
}) {
  const [sequences, setSequences] = useState<SequenceDocument[]>([]);
  const [proposed, setProposed] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    void listSequences()
      .catch(() => [])
      .then((s) => {
        if (live) setSequences(s);
      });
    return () => {
      live = false;
    };
  }, []);

  const findings = useMemo(
    () => analyzeProject(project, sequencesForProject(project, sequences)),
    [project, sequences],
  );

  const propose = async (f: RiskFinding) => {
    const key = `${f.rule}:${f.refs.map((r) => r.id).join(",")}`;
    const existing = await listDecisions().catch(() => []);
    let d = newDecision(`Risk: ${f.message.slice(0, 120)}`, nextDecisionNumber(existing));
    d = {
      ...d,
      context: `Raised by the risk lens (${f.rule}, ${f.severity}): ${f.message}`,
      history: [...d.history, { at: Date.now(), what: "Raised from the risk lens." }],
    };
    d = linkDecision(d, { surface: "system", recordId: project.id, label: project.name });
    await saveDecision(d);
    setProposed((prev) => ({ ...prev, [key]: d.number }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Architecture risks"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
          Risk lens
        </p>
        <h2 className="mt-1 text-lg font-bold text-[var(--color-ink)]">
          {findings.length} finding{findings.length === 1 ? "" : "s"} · {project.name}
        </h2>
        <p className="mt-1 text-[11px] text-ivory-600">
          Deterministic rules over the model - every finding cites its records. Unstated policy reads as
          unchecked, never as safe.
        </p>
        {findings.length === 0 ? (
          <p className="mt-3 rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-canvas)] px-3 py-4 text-center text-[12px] text-ivory-600">
            No risks stated against this design. Add timeouts, retries and versions - or enjoy the clean sheet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {findings.map((f) => {
              const key = `${f.rule}:${f.refs.map((r) => r.id).join(",")}`;
              return (
                <li key={key} className="rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-canvas)] p-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEVERITY_STYLE[f.severity]}`}>
                      {f.severity}
                    </span>
                    <span className="font-mono text-[10px] text-ivory-500">{f.rule}</span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-snug text-ivory-950">{f.message}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {f.refs.map((r) =>
                      r.surface === "system" ? (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            onSelectNode(r.id);
                            onClose();
                          }}
                          title={`Select ${r.name} on the canvas`}
                          className="cursor-pointer rounded-md border border-[var(--color-line)] bg-white px-1.5 py-0.5 font-mono text-[10px] text-bronze-700 hover:border-bronze-500"
                        >
                          {r.name}
                        </button>
                      ) : (
                        <a
                          key={r.id}
                          href="/sequence"
                          title="Open in Sequence tab"
                          className="rounded-md border border-[var(--color-line)] bg-white px-1.5 py-0.5 font-mono text-[10px] text-bronze-700 hover:border-bronze-500"
                        >
                          {r.name}
                        </a>
                      ),
                    )}
                    {proposed[key] ? (
                      <a
                        href="/decisions"
                        title="Open in Decisions tab"
                        className="ml-auto font-mono text-[10px] font-bold text-[#2F6B45] hover:underline"
                      >
                        {proposed[key]} proposed →
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void propose(f)}
                        title="Propose an ADR answering this finding, pre-linked to this project"
                        className="ml-auto cursor-pointer rounded-md border border-bronze-500 px-1.5 py-0.5 text-[10px] font-semibold text-bronze-700 hover:bg-bronze-100"
                      >
                        Propose ADR
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
