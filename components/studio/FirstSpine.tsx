"use client";

import { useEffect, useState } from "react";
import { computeSpine, loadSpineInput, spineDismiss, SPINE_STEPS, type SpineStepId } from "@/lib/studio/spine";

/**
 * First-assembly spine: five steps from connect to exported pack.
 * Completion derives from live stores; nothing new to maintain.
 * Dismisses permanently per browser; reappears never.
 */
export function FirstSpine() {
  const [done, setDone] = useState<Record<SpineStepId, boolean> | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSpineInput().then((input) => {
      if (cancelled) return;
      if (input.dismissed) {
        setDismissed(true);
        return;
      }
      setDone(computeSpine(input));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || done === null) return null;
  const allDone = (Object.keys(done) as SpineStepId[]).every((k) => done[k]);

  return (
    <div className="rounded-xl border border-[#E8E2D8] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">
          {allDone ? "First assembly complete ✓" : "First assembly - connect to exported pack"}
        </p>
        <button
          type="button"
          onClick={() => {
            spineDismiss();
            setDismissed(true);
          }}
          aria-label="Dismiss guide"
          className="cursor-pointer rounded-lg px-2 py-1 text-[11px] text-[#A39B8E] hover:bg-[#FAF8F2] hover:text-[#27241F]"
        >
          ✕
        </button>
      </div>
      {!allDone && (
        <ol className="mt-2 grid gap-1.5 sm:grid-cols-5">
          {SPINE_STEPS.map((s) => (
            <li key={s.id}>
              <a
                href={s.href}
                className={`block h-full rounded-xl border px-3 py-2 transition-colors ${
                  done[s.id] ? "border-[#BFD9C6] bg-[#E9F3EC]" : "border-[#F0EBE0] bg-[#FAF8F2] hover:border-[#A98450]"
                }`}
              >
                <span className={`font-mono text-[10px] font-bold ${done[s.id] ? "text-[#2F7D4F]" : "text-[#A98450]"}`}>
                  {done[s.id] ? "✓" : s.n}
                </span>
                <span className="mt-0.5 block text-[12px] font-semibold text-[#27241F]">{s.label}</span>
                <span className="block text-[10px] leading-snug text-[#777168]">{s.desc}</span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
