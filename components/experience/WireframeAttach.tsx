"use client";

import { useEffect, useState } from "react";
import Button from "../ui/Button";
import type { Experience } from "@/lib/wireframe/model";
import { listExperiences } from "@/lib/wireframe/store";
import { summarizeWireScreen } from "@/lib/experience/wireframeRef";
import type { WireframeRef } from "@/lib/experience/types";

/**
 * Attach a live Wireframe Studio screen as this mapping screen's design.
 * PNG stays as the fallback - the wireframe is the living source: component
 * count, Salesforce bindings and proposed fields summarize live, and a stale
 * ref (deleted wireframe) keeps its last-known label instead of breaking.
 */
export function WireframeAttach({
  current,
  onAttach,
  onDetach,
}: {
  current?: WireframeRef;
  onAttach: (ref: WireframeRef) => void;
  onDetach: () => void;
}) {
  const [experiences, setExperiences] = useState<Experience[] | null>(null);
  const [expId, setExpId] = useState("");
  const [screenId, setScreenId] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listExperiences()
      .then((all) => {
        if (!cancelled) setExperiences(all);
      })
      .catch(() => {
        if (!cancelled) setExperiences([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const live = current && (experiences ?? []).find((e) => e.id === current.experienceId);
  const summary = current ? summarizeWireScreen(live ?? null, current.screenId) : null;
  const picked = experiences?.find((e) => e.id === expId);

  return (
    <div className="mt-2 rounded-xl border border-[#F0EBE0] bg-[#FAF8F2] p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Wireframe screen</p>
      {current ? (
        <div className="mt-1.5">
          {summary ? (
            <>
              <p className="text-[12px] font-semibold text-[#27241F]">
                {summary.experienceName} → {summary.screenName}
                <span className="ml-1.5 rounded bg-[#E9F3EC] px-1.5 py-0.5 font-mono text-[10px] font-normal text-[#2F7D4F]">{summary.status}</span>
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-[#777168]">
                {summary.components} components · {summary.salesforceBindings.length} Salesforce bindings · {summary.proposedFields.length} proposed fields
              </p>
              {summary.proposedFields.length > 0 && (
                <p className="mt-0.5 font-mono text-[11px] text-[#8A6A2F]">+ {summary.proposedFields.join(", ")}</p>
              )}
            </>
          ) : experiences === null ? (
            <p className="mt-1 text-[12px] text-[#777168]">Loading wireframes…</p>
          ) : (
            <p className="mt-1 text-[12px] text-[#8A6A2F]">
              ⚠ Wireframe{current.experienceName ? ` "${current.experienceName}"` : ""} no longer exists - kept as “{current.screenName ?? current.screenId}” for history.
            </p>
          )}
          <div className="mt-1.5 flex gap-1.5">
            <a href="/wireframe" className="inline-flex items-center rounded-lg border border-[#E8E2D8] bg-white px-2 py-1 text-[12px] font-semibold text-[#A98450] hover:underline">
              Open in Wireframe ↗
            </a>
            <button type="button" onClick={onDetach} className="cursor-pointer rounded-lg px-2 py-1 text-[12px] text-[#B3261E] hover:bg-[#F9E8E6]">
              Detach
            </button>
          </div>
        </div>
      ) : experiences === null ? (
        <p className="mt-1 text-[12px] text-[#777168]">Loading wireframes…</p>
      ) : experiences.length === 0 ? (
        <p className="mt-1 text-[12px] text-[#777168]">
          No wireframes yet - design the screen in <a href="/wireframe" className="font-semibold text-[#A98450] hover:underline">Wireframe Studio</a>, then attach it here instead of a static PNG.
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <select
            value={expId}
            onChange={(e) => {
              setExpId(e.target.value);
              setScreenId("");
            }}
            aria-label="Wireframe experience"
            className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 font-mono text-[12px]"
          >
            <option value="">Experience…</option>
            {experiences.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.screens.length})
              </option>
            ))}
          </select>
          <select
            value={screenId}
            onChange={(e) => setScreenId(e.target.value)}
            disabled={!picked}
            aria-label="Wireframe screen"
            className="cursor-pointer rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 font-mono text-[12px] disabled:opacity-40"
          >
            <option value="">Screen…</option>
            {picked?.screens.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!picked || !screenId}
            onClick={() => {
              const s = picked?.screens.find((x) => x.id === screenId);
              if (picked && s) onAttach({ experienceId: picked.id, screenId: s.id, experienceName: picked.name, screenName: s.name });
            }}
          >
            Attach
          </Button>
        </div>
      )}
    </div>
  );
}
