"use client";

import { useState } from "react";
import Button from "../ui/Button";
import { getAssetRecord, saveAssetRecord } from "@/lib/experience/assets";
import {
  apiCatalogCsv,
  buildWordPack,
  downloadExperienceWorkbook,
  downloadText,
  screenApiMatrixCsv,
  screenApiMatrixTsv,
} from "@/lib/experience/deliverables";
import { logChange } from "@/lib/experience/migrate";
import {
  downloadBlob,
  exportProjectZip,
  extractAssets,
  inspectPackage,
  type InspectResult,
} from "@/lib/experience/package";
import { saveProject } from "@/lib/mapping/store";
import type { MappingProject } from "@/lib/mapping/types";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Deliverables: portable ZIP export + staged ZIP import. */
export function DeliverablesPanel({
  project,
  onImported,
}: {
  project: MappingProject;
  onImported: (p: MappingProject) => void;
}) {
  const [exportBusy, setExportBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [checked, setChecked] = useState<InspectResult | null>(null);
  const [checkedFile, setCheckedFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doExport = async () => {
    setExportBusy(true);
    try {
      const { blob, summary } = await exportProjectZip(project, async (key) => {
        try {
          const rec = await getAssetRecord(key);
          return rec?.blob ?? null;
        } catch {
          return null;
        }
      });
      const safe = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
      downloadBlob(blob, `${safe}.sobject-studio.zip`);
      void summary;
    } finally {
      setExportBusy(false);
    }
  };

  const takeFile = async (file: File | undefined) => {
    if (!file) return;
    setInspecting(true);
    setError(null);
    setChecked(null);
    setCheckedFile(file);
    try {
      const result = await inspectPackage(file);
      setChecked(result);
      if (!result.ok) setError(result.errors.join(" "));
    } finally {
      setInspecting(false);
    }
  };

  const importAsNew = async (file: File) => {
    if (!checked?.ok || !checked.project || !checked.manifest) return;
    setImportBusy(true);
    try {
      const now = new Date().toISOString();
      const incoming = JSON.parse(JSON.stringify(checked.project)) as MappingProject;
      const newId = uid("map");
      incoming.id = newId;
      incoming.name = `${incoming.name} (imported)`;
      incoming.updatedAt = now;
      logChange(incoming, "project", newId, "imported", "Imported from a portable ZIP package as a new project.", now, "import");
      // Persist image blobs under their existing storage keys (artifact ids preserved).
      const assets = await extractAssets(file, checked.manifest);
      for (const a of assets) {
        await saveAssetRecord({ id: a.storageKey, projectId: newId, assetId: a.storageKey, blob: a.blob, thumbnail: a.thumbnail ?? undefined }).catch(() => undefined);
      }
      await saveProject(incoming);
      onImported(incoming);
      setChecked(null);
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <div className="space-y-3">
      <div className="rounded-xl border border-[#E8E2D8] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Export portable ZIP</p>
        <p className="mt-1 text-[12px] text-[#777168]">
          Canonical exchange format: manifest, full project record, derived mirrors, original screenshots, README. Another
          architect imports it and continues locally - no backend involved.
        </p>
        <div className="mt-3">
          <Button size="sm" disabled={exportBusy} onClick={() => void doExport()}>
            {exportBusy ? "Packaging…" : "Download .zip"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[#E8E2D8] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Architecture documents</p>
        <p className="mt-1 text-[12px] text-[#777168]">
          Client-ready outputs with stable IDs. Proposed items stay labeled proposed.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            disabled={docBusy}
            onClick={() =>
              void (async () => {
                setDocBusy(true);
                try {
                  const blob = await buildWordPack(project, async (key) => {
                    try {
                      return (await getAssetRecord(key))?.blob ?? null;
                    } catch {
                      return null;
                    }
                  });
                  const safe = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${safe}-architecture-pack.docx`;
                  a.click();
                  URL.revokeObjectURL(url);
                } finally {
                  setDocBusy(false);
                }
              })()
            }
          >
            {docBusy ? "Building…" : "Word pack (.docx)"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => downloadExperienceWorkbook(project)}>
            Excel workbook (.xlsx)
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const safe = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
              downloadText(apiCatalogCsv(project), `${safe}-api-catalog.csv`, "text/csv");
            }}
          >
            API CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const safe = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
              downloadText(screenApiMatrixCsv(project), `${safe}-screen-api-matrix.csv`, "text/csv");
            }}
          >
            Matrix CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void (async () => {
                try {
                  await navigator.clipboard.writeText(screenApiMatrixTsv(project).text);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                } catch {
                  /* clipboard unavailable */
                }
              })()
            }
          >
            {copied ? "Copied" : "Copy matrix"}
          </Button>
        </div>
      </div>
      </div>

      <div className="rounded-xl border border-[#E8E2D8] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#A39B8E]">Import ZIP as new project</p>
        <label className="mt-2 block cursor-pointer rounded-xl border border-dashed border-[#D8CFC0] bg-[#FAF8F2] p-4 text-center text-[12px] text-[#777168] hover:border-[#A98450]">
          Choose a .zip package…
          <input
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              void takeFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {inspecting && <p className="mt-2 text-[12px] text-[#A39B8E]">Inspecting package…</p>}
        {error && (
          <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {error}
          </p>
        )}
        {checked?.ok && checked.manifest && checkedFile && (
          <ImportPreview
            checked={checked}
            busy={importBusy}
            onConfirm={() => void importAsNew(checkedFile)}
            onCancel={() => {
              setChecked(null);
              setCheckedFile(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function ImportPreview({
  checked,
  busy,
  onConfirm,
  onCancel,
}: {
  checked: InspectResult;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const m = checked.manifest!;
  return (
    <div className="mt-2 rounded-xl border border-[#BFD9C6] bg-[#E9F3EC] p-3">
      <p className="text-[13px] font-semibold text-[#27241F]">{m.project.name}</p>
      <p className="font-mono text-[11px] text-[#2F7D4F]">
        {m.counts.screens} screens · {m.assets.length} images · {m.counts.operations} operations · {m.counts.bindings} bindings · {m.counts.mappings} mappings
      </p>
      <p className="font-mono text-[10px] text-[#2F7D4F]">modules: {m.modules.join(", ")} · exported {m.exportedAt.slice(0, 16).replace("T", " ")}</p>
      {checked.warnings.map((w) => (
        <p key={w} className="mt-0.5 text-[11px] text-[#8A6A2F]">
          ⚠ {w}
        </p>
      ))}
      <p className="mt-1 text-[11px] text-[#2F7D4F]">Imports as a NEW project - existing projects are never overwritten.</p>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy} onClick={onConfirm}>
          {busy ? "Importing…" : "Import"}
        </Button>
      </div>
    </div>
  );
}
