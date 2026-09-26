"use client";

import { useState } from "react";
import { parseJsonInput, formatJson, formatBytes } from "@/lib/json/studio";
import { VanillaEditor } from "./VanillaEditor";
import Button from "../ui/Button";

/** Single-pane JSON editor: paste, validate, tree/text edit, copy/download. */
export function JsonEditorPane() {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<object | null>(null);
  const [loadId, setLoadId] = useState(0);
  const [live, setLive] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    const r = parseJsonInput(raw);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setDoc(r.value as object);
    setLive(r.value);
    setLoadId((n) => n + 1);
  };

  const current = live ?? doc;
  const size = current ? formatBytes(new Blob([formatJson(current)]).size) : null;

  const copy = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(formatJson(current));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    if (!current) return;
    const blob = new Blob([formatJson(current)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="rounded-xl border border-[#E8E2D8] bg-white p-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">
          Source
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='Paste JSON here… {"allOrNone": true, …}'
          rows={12}
          spellCheck={false}
          className="w-full rounded-lg border border-[#E8E2D8] p-2 font-mono text-xs focus:border-[#A98450] focus:outline-none"
        />
        {error && (
          <p className="mt-1.5 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 font-mono text-[11px] text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" onClick={load} disabled={raw.trim() === ""}>
            Load into editor
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setRaw(""); setError(null); }}>
            Clear
          </Button>
        </div>
        {size && <p className="mt-2 font-mono text-[11px] text-[#A39B8E]">{size} · tree/text via editor menu</p>}
      </div>

      <div>
        {!doc ? (
          <div className="rounded-xl border border-dashed border-[#E8E2D8] bg-white p-10 text-center">
            <p className="text-sm font-semibold text-[#27241F]">No document loaded</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-[#777168]">
              Paste JSON on the left and load it - then browse, collapse, search and edit every node.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={copy}>{copied ? "Copied" : "Copy formatted"}</Button>
              <Button variant="ghost" size="sm" onClick={download}>Download</Button>
            </div>
            <VanillaEditor key={loadId} value={doc} onChange={setLive} />
          </>
        )}
      </div>
    </div>
  );
}
