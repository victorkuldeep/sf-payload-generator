"use client";

import { useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import { serializeDraftValue } from "@/lib/erd/recordWalk";

export interface RecordFieldMeta {
  name: string;
  label: string;
  type: string;
  updateable: boolean;
  picklistValues?: { label: string; value: string }[];
}

export interface RecordSection {
  key: string;
  viaLabel: string;
  childApi: string;
  rows: Record<string, unknown>[];
  exhausted: boolean;
  loadingMore: boolean;
}

export interface RecordPopData {
  apiName: string;
  nodeLabel: string;
  /** Single-record rows (root / parent pulls). */
  single: { label: string; value: string }[] | null;
  singleId: string | null;
  /** 1-many sections, one per loaded parent. */
  sections: RecordSection[];
  /** Unreachable hint + the canvas parent to load first. */
  blockedHint: string | null;
  blockedApi: string | null;
  loading: boolean;
  error: string | null;
  /** Viewport anchor (icon rect) - panel flips to fit. */
  x: number;
  y: number;
  /** Picker = choose which aboard record the entity box visualizes.
   * Record = full dump + edit for the selected record.
   * Lookup = on-demand target of one reference field from one source row. */
  mode: "picker" | "record" | "lookup";
  /** Every aboard id with a human name; the entity box shows selectedId. */
  candidates: { id: string; name: string }[];
  selectedId: string | null;
  /** Lookup jump context: which source field's target this panel shows. */
  lookup?: {
    sourceApi: string;
    sourceName: string;
    fieldName: string;
    targetLabel: string;
    targetId: string;
    keyField: string | null;
  } | null;
}

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
};

const NUMBER_TYPES = new Set(["int", "double", "currency", "percent", "long", "number"]);

function FieldInput({
  meta,
  value,
  onChange,
}: {
  meta?: RecordFieldMeta;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  if (!meta || !meta.updateable) {
    return (
      <span className="min-w-0 break-all text-right font-mono text-[11px] text-ivory-400">
        {typeof value === "boolean" ? String(value) : cell(value)}
      </span>
    );
  }
  if (meta.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-bronze-600"
        aria-label={meta.label}
      />
    );
  }
  if (meta.type === "picklist" && meta.picklistValues && meta.picklistValues.length > 0) {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={meta.label}
        className="max-w-[170px] cursor-pointer rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 font-mono text-[11px] text-ivory-950"
      >
        <option value="">—</option>
        {meta.picklistValues.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    );
  }
  if (meta.type === "date") {
    return (
      <input
        type="date"
        value={typeof value === "string" ? value.slice(0, 10) : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={meta.label}
        className="max-w-[170px] rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 font-mono text-[11px] text-ivory-950"
      />
    );
  }
  if (meta.type === "datetime") {
    return (
      <input
        type="datetime-local"
        value={typeof value === "string" ? value.slice(0, 16) : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={meta.label}
        className="max-w-[170px] rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 font-mono text-[11px] text-ivory-950"
      />
    );
  }
  if (NUMBER_TYPES.has(meta.type)) {
    return (
      <input
        type="number"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={meta.label}
        className="max-w-[170px] rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 font-mono text-[11px] text-ivory-950"
      />
    );
  }
  return (
    <input
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={meta.label}
      spellCheck={false}
      className="max-w-[170px] rounded-md border border-[var(--color-line)] bg-white px-1.5 py-1 font-mono text-[11px] text-ivory-950"
    />
  );
}

function SectionRows({
  rows,
  metas,
  editingId,
  draft,
  onDraft,
  onEditRow,
  selectedId,
  onSelectRow,
}: {
  rows: Record<string, unknown>[];
  metas: RecordFieldMeta[];
  editingId: string | null;
  draft: Record<string, string | boolean>;
  onDraft: (field: string, v: string | boolean) => void;
  onEditRow: (id: string) => void;
  selectedId: string | null;
  onSelectRow?: (id: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => {
        const id = typeof r.Id === "string" ? r.Id : String(i);
        const isEditing = editingId === id;
        const isSelected = selectedId === id;
        const metaOf = (k: string) => metas.find((m) => m.name === k);
        return (
          <li
            key={id}
            onClick={onSelectRow && !isEditing ? () => onSelectRow(id) : undefined}
            title={onSelectRow && !isEditing ? "Visualize this record in the entity box" : undefined}
            className={`rounded-lg border px-2 py-1.5 bg-[var(--color-canvas)] ${
              isSelected ? "border-bronze-500 ring-1 ring-bronze-500" : "border-[var(--color-line-soft)]"
            } ${onSelectRow && !isEditing ? "cursor-pointer hover:border-bronze-400" : ""}`}
          >
            {isSelected && onSelectRow && (
              <p className="pb-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-bronze-700">
                Visualizing
              </p>
            )}
            {Object.entries(r).map(([k, v]) => {
              const meta = metaOf(k);
              const editable = isEditing && !!meta?.updateable && k !== "Id";
              return (
                <p key={k} className="flex items-baseline justify-between gap-2">
                  <span className="shrink-0 font-mono text-[10px] text-ivory-500">{k}</span>
                  {editable ? (
                    <FieldInput meta={meta} value={draft[k] ?? (typeof v === "boolean" ? v : String(v ?? ""))} onChange={(nv) => onDraft(k, nv)} />
                  ) : (
                    <span className="min-w-0 break-all text-right font-mono text-[11px] text-ivory-950">{cell(v)}</span>
                  )}
                </p>
              );
            })}
            {!isEditing && metas.some((m) => m.updateable && m.name !== "Id") && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditRow(id);
                }}
                aria-label="Edit this row"
                title="Edit this row"
                className="mt-1 rounded p-1 text-ivory-400 hover:text-bronze-600 hover:bg-ivory-200 transition-colors cursor-pointer"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
                  <path d="m13.5 6.5 3 3" />
                </svg>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function RecordPopover({
  pop,
  fieldMeta,
  sectionFieldMeta,
  onClose,
  onLoadMore,
  onFetchMissing,
  onClear,
  onRefresh,
  refreshing,
  onSave,
  onSelectRecord,
  onModeChange,
  onCopyLookup,
}: {
  pop: RecordPopData;
  /** Editable metadata for the single record's object (null = read-only). */
  fieldMeta: RecordFieldMeta[] | null;
  /** Editable metadata per child object apiName. */
  sectionFieldMeta: Record<string, RecordFieldMeta[]>;
  onClose: () => void;
  onLoadMore: (sectionKey: string) => void;
  onFetchMissing: (apiName: string) => void;
  onClear: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onSave: (apiName: string, id: string, changes: Record<string, unknown>) => Promise<void>;
  /** Visualize an aboard record in the entity box (picker + section rows). */
  onSelectRecord: (apiName: string, id: string) => void;
  onModeChange: (mode: "picker" | "record" | "lookup") => void;
  /** Copy a lookup's target label + Id for the row it came from. */
  onCopyLookup: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [editingSingle, setEditingSingle] = useState(false);
  const [editingRow, setEditingRow] = useState<{ sectionKey: string; id: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedLookup, setCopiedLookup] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  // Reset edit state whenever a different node or panel opens.
  useEffect(() => {
    setEditingSingle(false);
    setEditingRow(null);
    setDraft({});
    setSaveError(null);
    setCopiedLookup(false);
  }, [pop.apiName, pop.mode]);

  const W = 320;
  const left = Math.min(Math.max(8, pop.x), Math.max(8, window.innerWidth - W - 8));
  const top = Math.min(Math.max(8, pop.y), Math.max(8, window.innerHeight - 420));

  const startSingleEdit = () => {
    setDraft({});
    setSaveError(null);
    setEditingSingle(true);
  };

  const doSave = async (apiName: string, id: string, source: Record<string, unknown>) => {
    const metas = apiName === pop.apiName ? (fieldMeta ?? []) : (sectionFieldMeta[apiName] ?? []);
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      const meta = metas.find((m) => m.name === k);
      const original = source[k];
      const origStr = typeof original === "boolean" ? original : String(original ?? "");
      const draftStr = typeof v === "boolean" ? v : v;
      if (draftStr === origStr || (draftStr === "" && (original === null || original === undefined || original === ""))) continue;
      const serialized = serializeDraftValue(meta?.type, v);
      if (serialized !== undefined) changes[k] = serialized;
    }
    if (Object.keys(changes).length === 0) {
      setEditingSingle(false);
      setEditingRow(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(apiName, id, changes);
      setEditingSingle(false);
      setEditingRow(null);
      setDraft({});
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const singleEditable = !!fieldMeta?.some((m) => m.updateable && m.name !== "Id");

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`${pop.nodeLabel} record data`}
      className="fixed z-[80] w-[320px] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_16px_48px_-12px_rgba(24,20,12,0.4)]"
      style={{ left, top }}
    >
      <div className="border-b border-[var(--color-line-soft)] bg-[var(--color-surface-soft)] px-3 py-2">
        <div className="flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ivory-950">
            {pop.nodeLabel} · <span className="font-mono">{pop.apiName}</span>
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing || pop.loading}
            aria-label="Pull latest data from the server"
            title="Pull latest data from the server"
            className="rounded p-1 text-ivory-500 hover:text-bronze-600 hover:bg-ivory-200 transition-colors cursor-pointer disabled:opacity-40"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className={refreshing ? "animate-spin" : ""}>
              <path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" />
              <path d="M18 4v4h-4M6 20v-4h4" />
            </svg>
          </button>
          {pop.single && singleEditable && !editingSingle && (
            <button
              type="button"
              onClick={startSingleEdit}
              aria-label="Edit this record"
              title="Edit this record"
              className="rounded p-1 text-ivory-500 hover:text-bronze-600 hover:bg-ivory-200 transition-colors cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
                <path d="m13.5 6.5 3 3" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close record panel"
            title="Close record panel"
            className="rounded p-1 text-ivory-500 hover:text-ivory-950 hover:bg-ivory-200 transition-colors cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-ivory-600">Live record data · session only, never stored</p>
      </div>
      <div className="max-h-[300px] overflow-y-auto p-2.5">
        {pop.loading && <p className="px-1 py-2 text-xs text-bronze-600">Pulling record…</p>}
        {pop.error && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-700" role="alert">
            {pop.error}
          </p>
        )}
        {saveError && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-700" role="alert">
            {saveError}
          </p>
        )}
        {pop.blockedHint && (
          <div className="px-1 py-1">
            <p className="text-[11px] leading-relaxed text-ivory-700">{pop.blockedHint}</p>
            {pop.blockedApi && (
              <Button size="sm" variant="secondary" className="mt-1.5 w-full" onClick={() => onFetchMissing(pop.blockedApi!)}>
                Load {pop.blockedApi} first
              </Button>
            )}
          </div>
        )}
        {pop.mode === "picker" && !pop.blockedHint && (
          <div className="px-1 py-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
              {pop.candidates.length === 0
                ? "No records aboard yet"
                : pop.candidates.length === 1
                  ? "1 record aboard - visualizing it"
                  : `${pop.candidates.length} records aboard - pick one to visualize`}
            </p>
            {pop.candidates.length > 0 && (
              <ul className="mt-1.5 max-h-[180px] space-y-1 overflow-y-auto">
                {pop.candidates.map((c) => {
                  const active = pop.selectedId === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onSelectRecord(pop.apiName, c.id)}
                        title={active ? "Visualizing in the entity box" : "Visualize in the entity box"}
                        className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors cursor-pointer ${
                          active
                            ? "border-bronze-500 bg-bronze-100 ring-1 ring-bronze-500"
                            : "border-[var(--color-line-soft)] bg-[var(--color-canvas)] hover:border-bronze-400"
                        }`}
                      >
                        <p className="truncate text-[11px] font-bold text-ivory-950">{c.name}</p>
                        <p className="truncate font-mono text-[10px] text-ivory-500">{c.id}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {pop.single && (
              <Button size="sm" variant="secondary" className="mt-1.5 w-full" onClick={() => onModeChange("record")}>
                Inspect selected record
              </Button>
            )}
          </div>
        )}
        {pop.mode === "record" && pop.candidates.length > 1 && (
          <div className="px-1 pb-1">
            <button
              type="button"
              onClick={() => onModeChange("picker")}
              className="text-[11px] font-semibold text-bronze-600 hover:text-bronze-700 cursor-pointer"
            >
              ← {pop.candidates.length} records aboard
            </button>
          </div>
        )}
        {pop.mode === "lookup" && pop.lookup && (
          <div className="px-1 py-1">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ivory-500">
              {pop.lookup.sourceApi} · {pop.lookup.fieldName}
            </p>
            <p className="mt-0.5 break-all font-mono text-[11px] font-bold leading-relaxed text-ivory-950" title={pop.lookup.targetId}>
              {pop.lookup.targetLabel}
            </p>
            <p className="mt-0.5 break-all font-mono text-[10px] text-ivory-500" title={pop.lookup.targetId}>
              {pop.lookup.targetId}
              {pop.lookup.keyField && pop.lookup.targetLabel !== pop.lookup.targetId
                ? ` · via ${pop.lookup.keyField}`
                : ""}
            </p>
            <div className="mt-1.5 flex gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  onCopyLookup(pop.lookup!.targetLabel === pop.lookup!.targetId
                    ? pop.lookup!.targetId
                    : `${pop.lookup!.targetLabel} (${pop.lookup!.targetId})`);
                  setCopiedLookup(true);
                  window.setTimeout(() => setCopiedLookup(false), 1200);
                }}
              >
                {copiedLookup ? "Copied ✓" : "Copy"}
              </Button>
              <Button size="sm" className="flex-1" onClick={() => onModeChange("record")}>
                Inspect record
              </Button>
            </div>
          </div>
        )}
        {pop.mode === "record" && pop.single && (
          editingSingle ? (
            <div>
              <dl className="divide-y divide-[var(--color-line-soft)]">
                {pop.single.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-2 px-1 py-1">
                    <dt className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ivory-500">{row.label}</dt>
                    <dd className="min-w-0">
                      <FieldInput
                        meta={fieldMeta?.find((m) => m.name === row.label)}
                        value={draft[row.label] ?? row.value}
                        onChange={(nv) => setDraft((p) => ({ ...p, [row.label]: nv }))}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-1.5 flex gap-1.5">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={saving}
                  onClick={() => {
                    if (!pop.singleId) return;
                    const source: Record<string, unknown> = {};
                    for (const r of pop.single!) source[r.label] = r.value;
                    void doSave(pop.apiName, pop.singleId, source);
                  }}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setEditingSingle(false); setDraft({}); setSaveError(null); }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <dl className="divide-y divide-[var(--color-line-soft)]">
              {pop.single.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-2 px-1 py-1">
                  <dt className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ivory-500">{row.label}</dt>
                  <dd className="min-w-0 break-all text-right font-mono text-[11px] text-ivory-950">{row.value}</dd>
                </div>
              ))}
            </dl>
          )
        )}
        {pop.sections.map((s) => {
          const metas = sectionFieldMeta[s.childApi] ?? [];
          const rowEditingId = editingRow?.sectionKey === s.key ? editingRow.id : null;
          return (
            <div key={s.key} className="mb-2 last:mb-0">
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ivory-600">
                {s.viaLabel} · {s.rows.length}{s.exhausted ? "" : "+"}
              </p>
              <SectionRows
                rows={s.rows}
                metas={metas}
                editingId={rowEditingId}
                draft={draft}
                onDraft={(field, v) => setDraft((p) => ({ ...p, [field]: v }))}
                selectedId={pop.selectedId}
                onSelectRow={(id) => onSelectRecord(s.childApi, id)}
                onEditRow={(id) => {
                  setDraft({});
                  setSaveError(null);
                  setEditingRow({ sectionKey: s.key, id });
                }}
              />
              {rowEditingId && (
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={saving}
                    onClick={() => {
                      const row = s.rows.find((r) => String(r.Id ?? "") === rowEditingId);
                      if (!row) return;
                      const source: Record<string, unknown> = {};
                      for (const [k, v] of Object.entries(row)) source[k] = typeof v === "boolean" ? v : String(v ?? "");
                      void doSave(s.childApi, rowEditingId, source);
                    }}
                  >
                    {saving ? "Saving…" : "Save row"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setEditingRow(null); setDraft({}); setSaveError(null); }}>
                    Cancel
                  </Button>
                </div>
              )}
              {!s.exhausted && !rowEditingId && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 w-full"
                  disabled={s.loadingMore}
                  onClick={() => onLoadMore(s.key)}
                >
                  {s.loadingMore ? "Loading…" : "Load 10 more"}
                </Button>
              )}
            </div>
          );
        })}
        {!pop.loading && !pop.error && !pop.blockedHint && !pop.single && pop.sections.length === 0 && (
          <p className="px-1 py-2 text-[11px] text-ivory-600">No rows returned for this node.</p>
        )}
      </div>
      <div className="flex gap-1.5 border-t border-[var(--color-line-soft)] p-2">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={onClear}
          title="Forget this node's loaded records only. The root record Id you typed stays saved in the Record Walk box, so fetching again is one click."
        >
          Drop {pop.nodeLabel} data · root Id stays
        </Button>
      </div>
    </div>
  );
}
