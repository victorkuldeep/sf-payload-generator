"use client";

import { useRef, useState } from "react";
import Button from "../ui/Button";
import { SAMPLE_FILE_NAME, SAMPLE_PAYLOAD, SAMPLE_SPEC } from "@/lib/validate/sample";

const ACCEPT = ".json,.yaml,.yml,application/json,application/yaml,application/x-yaml";

/** Empty state + import controls for the Validate workspace. */
export function SpecImport({
  busy,
  onLoad,
  onSample,
}: {
  busy: boolean;
  onLoad: (fileName: string, text: string, byteSize: number) => void;
  onSample: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const readFile = (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    if (file.size === 0) {
      setLocalError("That file is empty.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onLoad(file.name, String(reader.result ?? ""), file.size);
    reader.onerror = () => setLocalError("Could not read that file.");
    reader.readAsText(file);
  };

  const submitPaste = () => {
    if (!pasteText.trim()) {
      setLocalError("Paste a specification first.");
      return;
    }
    setLocalError(null);
    onLoad("pasted-specification", pasteText, new Blob([pasteText]).size);
    setPasteText("");
    setPasteOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[#27241F]">Start with an API contract</h2>
        <p className="mx-auto mt-1 max-w-xl text-[13px] leading-relaxed text-[#777168]">
          Upload an OpenAPI specification to discover its operations and validate payloads
          against the exact request and response schemas. Processing happens locally in your browser.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload an OpenAPI specification"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          readFile(e.dataTransfer.files?.[0]);
        }}
        className={`mx-auto max-w-xl cursor-pointer rounded-xl border border-dashed bg-white px-6 py-10 text-center transition-colors ${
          dragOver ? "border-[#A98450] bg-[#FAF6EC]" : "border-[#D8CFC0] hover:border-[#A98450]"
        }`}
      >
        <p className="text-sm font-semibold text-[#27241F]">
          {busy ? "Reading specification…" : "Drop a spec file here, or browse"}
        </p>
        <p className="mt-1 font-mono text-[11px] text-[#A39B8E]">OpenAPI JSON / YAML · .json · .yaml · .yml</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" disabled={busy} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
            Browse files
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              setPasteOpen((v) => !v);
            }}
          >
            Paste specification
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            readFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {localError && (
        <p role="alert" className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {localError}
        </p>
      )}

      {pasteOpen && (
        <div className="mx-auto max-w-xl rounded-xl border border-[#E8E2D8] bg-white p-3">
          <label htmlFor="validate-paste" className="mb-1.5 block text-[12px] font-semibold text-[#27241F]">
            Paste specification (JSON or YAML)
          </label>
          <textarea
            id="validate-paste"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder='{"openapi": "3.1.0", …} or openapi: 3.0.3 …'
            className="w-full rounded-lg border border-[#E8E2D8] bg-[#FCFBF8] p-2.5 font-mono text-[12px] leading-relaxed text-[#27241F] focus:border-[#A98450] focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={submitPaste}>
              Import pasted spec
            </Button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-xl rounded-xl border border-[#E8E2D8] bg-[#F5F1E8]/60 px-4 py-3 text-center">
        <p className="text-[12px] text-[#777168]">
          No spec handy? Load the explicitly labeled example —{" "}
          <button
            type="button"
            onClick={() => {
              onSample();
            }}
            className="font-semibold text-[#A98450] hover:underline cursor-pointer"
          >
            {SAMPLE_FILE_NAME}
          </button>{" "}
          with a matching payload.
        </p>
      </div>
    </div>
  );
}

export { SAMPLE_PAYLOAD, SAMPLE_SPEC };
