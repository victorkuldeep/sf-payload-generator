"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadArtifactIndex,
  rankEntries,
  type ArtifactEntry,
  type ArtifactKind,
} from "@/lib/studio/artifacts";

interface GoAction {
  key: string;
  label: string;
  detail: string;
  href: string;
}

const GO_ACTIONS: GoAction[] = [
  { key: "go-home", label: "Home", detail: "Start here", href: "/" },
  { key: "go-mapping", label: "Mapping Studio", detail: "Payload-to-object integration mapping", href: "/mapping" },
  { key: "go-wireframe", label: "Wireframe Studio", detail: "Schema-aware experience modeling", href: "/wireframe" },
  { key: "go-system", label: "System Design", detail: "Visual architecture workbench", href: "/system" },
  { key: "go-sequence", label: "Sequence", detail: "Describe the interaction", href: "/sequence" },
  { key: "go-contracts", label: "Contracts", detail: "OpenAPI profiles", href: "/contracts" },
  { key: "go-notes", label: "Notes", detail: "General notes with lifecycle", href: "/notes" },
  { key: "go-validate", label: "Validate", detail: "OpenAPI spec vs payload", href: "/validate" },
  { key: "go-architect", label: "Architect", detail: "Design custom APIs", href: "/architect" },
  { key: "go-studio", label: "Studio", detail: "Themed diagram packs", href: "/studio" },
  { key: "go-draw", label: "Draw", detail: "Freeform whiteboard", href: "/draw" },
  { key: "go-console", label: "Console", detail: "Personal task console", href: "/console" },
];

const KIND_LABEL: Record<ArtifactKind, string> = {
  "wireframe-screen": "Wireframes",
  "integration-mapping": "Mappings",
  "contract-profile": "Contracts",
};

const KIND_ORDER: ArtifactKind[] = ["wireframe-screen", "integration-mapping", "contract-profile"];

function targetFor(e: ArtifactEntry): string {
  if (e.kind === "wireframe-screen") return "/wireframe";
  if (e.kind === "contract-profile") return "/contracts";
  // Standalone mappings deep-link; attached ones open under their project.
  if (e.projectName) return "/mapping";
  return e.mappingId ? `/mapping?project=${e.mappingId}` : "/mapping";
}

interface Row {
  key: string;
  group: string;
  label: string;
  detail: string;
  href: string;
}

/**
 * Global command palette (Cmd/Ctrl+K). A1: fuzzy search + grouped results +
 * navigate. Attaching lands in A2 - this phase never mutates anything.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<ArtifactEntry[] | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onSignal = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("gravenx:palette", onSignal);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("gravenx:palette", onSignal);
    };
  }, []);

  useEffect(() => {
    if (!open || entries !== null) return;
    let cancelled = false;
    void loadArtifactIndex()
      .then((all) => {
        if (!cancelled) setEntries(all);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, entries]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open ]);

  const rows: Row[] = useMemo(() => {
    const q = query.trim();
    const go = GO_ACTIONS.filter(
      (g) => !q || g.label.toLowerCase().includes(q.toLowerCase()) || g.detail.toLowerCase().includes(q.toLowerCase())
    ).map((g) => ({ key: g.key, group: "Go", label: g.label, detail: g.detail, href: g.href }));
    if (!entries) return go;
    const ranked = rankEntries(entries, q).slice(0, 30);
    const arts: Row[] = ranked.map((r) => ({
      key: r.entry.key,
      group: KIND_LABEL[r.entry.kind],
      label: r.entry.label,
      detail: `${r.entry.detail}${r.entry.usedIn.length > 0 ? ` · used in ${r.entry.usedIn.join(", ")}` : ""}`,
      href: targetFor(r.entry),
    }));
    const order = (g: string) => (g === "Go" ? -1 : KIND_ORDER.indexOf(Object.keys(KIND_LABEL).find((k) => KIND_LABEL[k as ArtifactKind] === g)! as ArtifactKind));
    return [...go, ...arts].sort((a, b) => order(a.group) - order(b.group));
  }, [query, entries]);

  useEffect(() => {
    setActive(0);
  }, [rows.length]);

  const pick = (row: Row | undefined) => {
    if (!row) return;
    setOpen(false);
    router.push(row.href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Command palette" onClick={() => setOpen(false)}>
      <div
        className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-[#E8E2D8] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (rows.length === 0 ? 0 : (a + 1) % rows.length));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (rows.length === 0 ? 0 : (a - 1 + rows.length) % rows.length));
          } else if (e.key === "Enter") {
            pick(rows[active]);
          }
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search screens, mappings, contracts, places…"
          aria-label="Search everything"
          spellCheck={false}
          className="w-full border-b border-[#E8E2D8] px-4 py-3 text-[14px] focus:outline-none"
        />
        {entries === null ? (
          <p className="px-4 py-6 text-center text-[12px] text-[#777168]">Loading index…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-[#777168]">No matches - try fewer letters.</p>
        ) : (
          <ul className="max-h-[50vh] overflow-y-auto p-1.5">
            {rows.map((r, i) => (
              <li key={r.key}>
                {(i === 0 || rows[i - 1].group !== r.group) && (
                  <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-[1.6px] text-[#A39B8E]">{r.group}</p>
                )}
                <button
                  type="button"
                  onClick={() => pick(r)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${i === active ? "bg-[#FAF3E3]" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[#27241F]">{r.label}</span>
                    <span className="block truncate font-mono text-[10px] text-[#A39B8E]">{r.detail}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-[#A39B8E]">↵</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-[#F0EBE0] px-4 py-1.5 font-mono text-[10px] text-[#A39B8E]">
          ↑↓ move · ↵ open · esc close · ⌘K toggle
        </p>
      </div>
    </div>
  );
}
