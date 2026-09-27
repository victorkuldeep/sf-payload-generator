"use client";

import { useState } from "react";
import Button from "../ui/Button";
import { extractPaths, parseSourceJson } from "@/lib/mapping/source";
import { blankProject, type MappingProject } from "@/lib/mapping/types";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Short progressive setup: details -> source JSON -> create. */
export function ProjectWizard({
  onCreate,
  onCancel,
}: {
  onCreate: (project: MappingProject) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceSystem, setSourceSystem] = useState("");
  const [sourceApi, setSourceApi] = useState("");
  const [domain, setDomain] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceName, setSourceName] = useState("source-payload.json");
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    const parsed = parseSourceJson(sourceText);
    if (!parsed.ok) {
      setError(parsed.error ?? "Invalid JSON.");
      return;
    }
    const now = new Date().toISOString();
    const project = blankProject({
      id: uid("map"),
      name: name.trim() || "Untitled mapping",
      description: description.trim() || undefined,
      sourceSystem: sourceSystem.trim() || undefined,
      sourceApi: sourceApi.trim() || undefined,
      domain: domain.trim() || undefined,
      now,
    });
    project.source = {
      kind: "json-sample",
      name: sourceName,
      originalText: sourceText,
      paths: extractPaths(parsed.value),
      capturedAt: now,
    };
    onCreate(project);
  };

  const inputCls =
    "w-full rounded-lg border border-[#E8E2D8] bg-white px-2.5 py-1.5 text-[13px] focus:border-[#A98450] focus:outline-none";

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-[#E8E2D8] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 font-mono text-[11px] text-[#A39B8E]" aria-label="Setup progress">
        {["Project details", "Source JSON"].map((label, i) => (
          <span key={label} className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 ${i === step ? "bg-[#211F1B] text-white" : i < step ? "bg-[#E9F3EC] text-[#2F7D4F]" : "bg-[#F5F1E8] text-[#A39B8E]"}`}>
              {i + 1}
            </span>
            <span className={i === step ? "text-[#27241F] font-semibold" : ""}>{label}</span>
            {i === 0 && <span aria-hidden="true">→</span>}
          </span>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <label className="block text-[12px] font-semibold text-[#27241F]">
            Project name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="TMF622 Product Order to Salesforce" className={`${inputCls} mt-1 font-normal`} />
          </label>
          <label className="block text-[12px] font-semibold text-[#27241F]">
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Client workshop mapping" className={`${inputCls} mt-1 font-normal`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12px] font-semibold text-[#27241F]">
              Source system
              <input value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} placeholder="TM Forum" className={`${inputCls} mt-1 font-normal`} />
            </label>
            <label className="block text-[12px] font-semibold text-[#27241F]">
              Source API
              <input value={sourceApi} onChange={(e) => setSourceApi(e.target.value)} placeholder="TMF 622" className={`${inputCls} mt-1 font-normal`} />
            </label>
          </div>
          <label className="block text-[12px] font-semibold text-[#27241F]">
            Business domain (optional)
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Order management" className={`${inputCls} mt-1 font-normal`} />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <label className="block text-[12px] font-semibold text-[#27241F]">
            Source file name
            <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} className={`${inputCls} mt-1 font-mono font-normal`} />
          </label>
          <label className="block text-[12px] font-semibold text-[#27241F]">
            Paste source JSON (preserved exactly as the template)
            <textarea
              value={sourceText}
              onChange={(e) => {
                setSourceText(e.target.value);
                setError(null);
              }}
              rows={12}
              spellCheck={false}
              placeholder='{"order": {"orderNumber": "A1"}}'
              className={`${inputCls} mt-1 font-mono text-[12px] leading-relaxed font-normal`}
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? onCancel() : setStep(0))}>
          {step === 0 ? "Cancel" : "← Back"}
        </Button>
        {step === 0 ? (
          <Button onClick={() => setStep(1)}>Continue →</Button>
        ) : (
          <Button onClick={create}>Create project</Button>
        )}
      </div>
    </div>
  );
}
