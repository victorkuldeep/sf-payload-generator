"use client";

import Button from "../ui/Button";
import { defFor } from "@/lib/wireframe/registry";
import type { BindingState, WireComponent } from "@/lib/wireframe/model";
import type { WireSchema } from "./useWireSchema";

const inputCls =
  "w-full rounded-lg border border-[#E8E2D8] bg-white px-2 py-1.5 text-xs text-[#27241F] placeholder-[#A39B8E] focus:border-[#C9A86A] focus:outline-none";
const labelCls = "mb-1 block font-mono text-[10px] uppercase tracking-[1.5px] text-[#A39B8E]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[#EFE9DC] px-3 py-2.5 last:border-0">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-[#27241F]">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Lines({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <label className={labelCls} htmlFor={`insp-${label}`}>{label} (one per line)</label>
      <textarea
        id={`insp-${label}`}
        value={values.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 200))}
        rows={Math.min(Math.max(values.length + 1, 2), 6)}
        spellCheck={false}
        className={`${inputCls} font-mono text-[11px]`}
      />
    </div>
  );
}

/**
 * Component inspector (EPIC 04): label, data binding + state, validation,
 * API refs, interaction intent, known list-props. Proposed-field authoring
 * and Salesforce pickers arrive in EPIC 05-06; ODA shows read-only.
 */
export function Inspector({
  comp,
  schema,
  onPatch,
  onMove,
  onDelete,
  onClose,
}: {
  comp: WireComponent;
  schema?: WireSchema;
  onPatch: (patch: Partial<WireComponent>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const def = defFor(comp.kind);
  const binding = comp.binding;
  const describeFields = binding?.object ? (schema?.describes.get(binding.object)?.fields ?? []) : [];
  const state: BindingState | "" = comp.bindingState ?? "";
  const props = comp.props as Record<string, unknown>;
  const interaction = comp.interaction;

  const setBinding = (next: WireComponent["binding"] | undefined) => onPatch({ binding: next });

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-[#E8E2D8] bg-white" style={{ maxHeight: 640 }} aria-label="Component inspector">
      <div className="flex items-center justify-between gap-2 border-b border-[#EFE9DC] px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#27241F]">{def.label}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="rounded p-1 text-[#A39B8E] cursor-pointer hover:bg-[#F5F1E8] hover:text-[#27241F]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Component">
          <div>
            <label className={labelCls} htmlFor="insp-label">Label</label>
            <input
              id="insp-label"
              value={comp.label}
              onChange={(e) => onPatch({ label: e.target.value.slice(0, 160) })}
              spellCheck={false}
              className={inputCls}
            />
          </div>
          <p className="font-mono text-[10px] text-[#A39B8E]">kind: {comp.kind} · id: {comp.id}</p>
        </Section>

        <Section title="Data">
          <div>
            <label className={labelCls} htmlFor="insp-state">Binding state</label>
            <select
              id="insp-state"
              value={state}
              onChange={(e) => {
                const v = e.target.value as BindingState | "";
                if (v === "") onPatch({ bindingState: undefined, binding: undefined, proposedField: undefined });
                else onPatch({ bindingState: v, binding: binding ?? { source: v === "external" ? "rest" : "salesforce" } });
              }}
              className={`${inputCls} cursor-pointer`}
            >
              <option value="">Unbound</option>
              <option value="existing">✓ Existing field</option>
              <option value="proposed">+ Proposed field</option>
              <option value="external">⇅ External data</option>
            </select>
          </div>
          {state !== "" && (
            <>
              <div>
                <label className={labelCls} htmlFor="insp-source">Source</label>
                <select
                  id="insp-source"
                  value={binding?.source ?? "salesforce"}
                  onChange={(e) => setBinding({ ...(binding ?? {}), source: e.target.value as "salesforce" | "rest" | "event" })}
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="salesforce">Salesforce</option>
                  <option value="rest">REST API</option>
                  <option value="event">Event</option>
                </select>
              </div>
              {state === "external" ? (
                <div>
                  <label className={labelCls} htmlFor="insp-ext">External label</label>
                  <input
                    id="insp-ext"
                    value={binding?.externalLabel ?? ""}
                    onChange={(e) => setBinding({ ...(binding ?? { source: "rest" as const }), externalLabel: e.target.value.slice(0, 120) })}
                    placeholder="e.g. Credit API"
                    spellCheck={false}
                    className={inputCls}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className={labelCls} htmlFor="insp-obj">Object</label>
                    <input
                      id="insp-obj"
                      value={binding?.object ?? ""}
                      onChange={(e) => setBinding({ ...(binding ?? { source: "salesforce" as const }), object: e.target.value.slice(0, 120) || undefined })}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v) void schema?.loadDescribe(v);
                      }}
                      placeholder="Account"
                      spellCheck={false}
                      list={schema && schema.objects.length > 0 ? "insp-objects" : undefined}
                      className={`${inputCls} font-mono text-[11px]`}
                    />
                    {schema && schema.objects.length > 0 && (
                      <datalist id="insp-objects">
                        {schema.objects.slice(0, 500).map((o) => (
                          <option key={o.name} value={o.name}>{o.label}</option>
                        ))}
                      </datalist>
                    )}
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="insp-field">Field</label>
                    <input
                      id="insp-field"
                      value={binding?.field ?? ""}
                      onChange={(e) => setBinding({ ...(binding ?? { source: "salesforce" as const }), field: e.target.value.slice(0, 120) || undefined })}
                      placeholder="Name"
                      spellCheck={false}
                      list={describeFields.length > 0 ? "insp-fields" : undefined}
                      className={`${inputCls} font-mono text-[11px]`}
                    />
                    {describeFields.length > 0 && (
                      <datalist id="insp-fields">
                        {describeFields.slice(0, 500).map((f) => (
                          <option key={f.name} value={f.name}>{f.label} · {f.type}</option>
                        ))}
                      </datalist>
                    )}
                  </div>
                </div>
              )}
              {comp.proposedField && (
                <p className="rounded-md bg-[#F5EEDF] px-2 py-1 font-mono text-[10px] text-[#8A6A2F]">
                  + {comp.proposedField.object}.{comp.proposedField.apiName} · {comp.proposedField.type}
                </p>
              )}
              {state === "proposed" && !comp.proposedField && (
                <p className="text-[11px] leading-relaxed text-[#A39B8E]">
                  Field definition dialog lands in EPIC 06 - set object + field above for now.
                </p>
              )}
            </>
          )}
        </Section>

        <Section title="State & validation">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#27241F]">
            <input
              type="checkbox"
              checked={comp.validation?.required ?? false}
              onChange={(e) => onPatch({ validation: { ...(comp.validation ?? {}), required: e.target.checked } })}
              className="h-3.5 w-3.5 cursor-pointer accent-[#9A7653]"
            />
            Required
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className={labelCls} htmlFor="insp-maxlen">Max length</label>
              <input
                id="insp-maxlen"
                type="number"
                min={1}
                value={comp.validation?.maxLength ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? undefined : Math.max(1, parseInt(e.target.value, 10) || 0);
                  onPatch({ validation: { ...(comp.validation ?? {}), maxLength: v } });
                }}
                className={`${inputCls} font-mono text-[11px]`}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="insp-pattern">Pattern</label>
              <input
                id="insp-pattern"
                value={comp.validation?.pattern ?? ""}
                onChange={(e) => onPatch({ validation: { ...(comp.validation ?? {}), pattern: e.target.value.slice(0, 300) || undefined } })}
                placeholder="regex"
                spellCheck={false}
                className={`${inputCls} font-mono text-[11px]`}
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="insp-vis">Show when</label>
            <input
              id="insp-vis"
              value={comp.visibleWhen ?? ""}
              onChange={(e) => onPatch({ visibleWhen: e.target.value.slice(0, 300) || undefined })}
              placeholder='e.g. Type == "Enterprise"'
              spellCheck={false}
              className={`${inputCls} font-mono text-[11px]`}
            />
          </div>
        </Section>

        <Section title="API">
          <div>
            <label className={labelCls} htmlFor="insp-read">Read</label>
            <input
              id="insp-read"
              value={binding?.readApi ?? ""}
              onChange={(e) => setBinding({ ...(binding ?? { source: "salesforce" as const }), readApi: e.target.value.slice(0, 300) || undefined })}
              placeholder="GET /sobjects/Account/:id"
              spellCheck={false}
              className={`${inputCls} font-mono text-[11px]`}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="insp-write">Write</label>
            <input
              id="insp-write"
              value={binding?.writeApi ?? ""}
              onChange={(e) => setBinding({ ...(binding ?? { source: "salesforce" as const }), writeApi: e.target.value.slice(0, 300) || undefined })}
              placeholder="PATCH /sobjects/Account/:id"
              spellCheck={false}
              className={`${inputCls} font-mono text-[11px]`}
            />
          </div>
        </Section>

        <Section title="Interaction">
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className={labelCls} htmlFor="insp-trigger">On</label>
              <select
                id="insp-trigger"
                value={interaction?.trigger ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onPatch({ interaction: v === "" ? undefined : { trigger: v as "click", action: interaction?.action ?? "save", target: interaction?.target } });
                }}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">No action</option>
                <option value="click">Click</option>
                <option value="change">Change</option>
                <option value="load">Load</option>
                <option value="submit">Submit</option>
                <option value="delete">Delete</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="insp-target">Target</label>
              <input
                id="insp-target"
                value={interaction?.target ?? ""}
                onChange={(e) => {
                  if (!interaction) return;
                  onPatch({ interaction: { ...interaction, target: e.target.value.slice(0, 160) || undefined } });
                }}
                placeholder="Account"
                spellCheck={false}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="insp-action">Action</label>
            <input
              id="insp-action"
              value={interaction?.action ?? ""}
              onChange={(e) => {
                const v = e.target.value.slice(0, 120);
                onPatch({ interaction: v === "" && !interaction?.target ? undefined : { trigger: interaction?.trigger ?? "click", action: v || "save", target: interaction?.target } });
              }}
              placeholder="save"
              spellCheck={false}
              className={`${inputCls} font-mono text-[11px]`}
            />
          </div>
        </Section>

        {Array.isArray(props.options) || Array.isArray(props.buttons) || Array.isArray(props.columns) || Array.isArray(props.tabs) || typeof props.rows === "number" ? (
          <Section title="Content">
            {Array.isArray(props.options) && (
              <Lines label="Options" values={props.options.filter((x): x is string => typeof x === "string")} onChange={(v) => onPatch({ props: { ...props, options: v } })} />
            )}
            {Array.isArray(props.buttons) && (
              <Lines label="Buttons" values={props.buttons.filter((x): x is string => typeof x === "string")} onChange={(v) => onPatch({ props: { ...props, buttons: v } })} />
            )}
            {Array.isArray(props.columns) && (
              <Lines label="Columns" values={props.columns.filter((x): x is string => typeof x === "string")} onChange={(v) => onPatch({ props: { ...props, columns: v } })} />
            )}
            {Array.isArray(props.tabs) && (
              <Lines label="Tabs" values={props.tabs.filter((x): x is string => typeof x === "string")} onChange={(v) => onPatch({ props: { ...props, tabs: v } })} />
            )}
            {typeof props.rows === "number" && (
              <div>
                <label className={labelCls} htmlFor="insp-rows">Preview rows</label>
                <input
                  id="insp-rows"
                  type="number"
                  min={1}
                  max={10}
                  value={props.rows}
                  onChange={(e) => onPatch({ props: { ...props, rows: Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)) } })}
                  className={`${inputCls} font-mono text-[11px]`}
                />
              </div>
            )}
          </Section>
        ) : null}

        {(comp.oda?.implements?.length || comp.oda?.consumes?.length || comp.oda?.emits?.length) ? (
          <Section title="Asset contract">
            {(Object.entries({ implements: comp.oda?.implements ?? [], consumes: comp.oda?.consumes ?? [], emits: comp.oda?.emits ?? [] }) as [string, string[]][]).map(
              ([k, vs]) =>
                vs.length > 0 && (
                  <div key={k}>
                    <p className={labelCls}>{k}</p>
                    <div className="flex flex-wrap gap-1">
                      {vs.map((v) => (
                        <span key={v} className="rounded bg-[#F5F1E8] px-1.5 py-px font-mono text-[10px] text-[#777168]">{v}</span>
                      ))}
                    </div>
                  </div>
                ),
            )}
          </Section>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 border-t border-[#EFE9DC] px-3 py-2">
        <Button size="sm" variant="secondary" onClick={() => onMove(-1)} title="Move up">
          ↑
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onMove(1)} title="Move down">
          ↓
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onDelete} title="Delete component">
          Delete
        </Button>
      </div>
    </aside>
  );
}
