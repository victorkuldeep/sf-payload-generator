"use client";

import { useState } from "react";
import { JsonEditorPane } from "@/components/json-studio/JsonEditorPane";
import { JsonCompare } from "@/components/json-studio/JsonCompare";

type Tab = "editor" | "compare";

/** JSON Studio: editor + A/B comparator for API payloads. */
export function JsonStudio() {
  const [tab, setTab] = useState<Tab>("compare");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#E8E2D8] bg-white px-4 pt-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[#27241F]">JSON Studio</h2>
            <p className="text-xs text-[#777168]">Edit payloads, then diff versions node by node.</p>
          </div>
        </div>
        <div className="mt-2 flex" role="tablist" aria-label="JSON Studio screens">
          {(
            [
              { id: "editor", label: "Editor" },
              { id: "compare", label: "Compare A/B" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
                tab === t.id
                  ? "text-[#27241F] underline underline-offset-8 decoration-[#A98450] decoration-2"
                  : "text-[#A39B8E] hover:text-[#27241F]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "editor" ? <JsonEditorPane /> : <JsonCompare />}
    </div>
  );
}
