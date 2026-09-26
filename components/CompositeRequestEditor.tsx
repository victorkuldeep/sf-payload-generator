"use client";

import { useMemo, useState } from "react";
import type {
  CompositeSubRequest as SubRequest,
  SalesforceObject,
  SalesforceField,
} from "@/lib/salesforce/types";
import {
  getWritableFields,
  getActivePicklistValues,
  getFieldEditorType,
  isRequiredField,
} from "@/lib/salesforce/metadata";
import { getSampleValueForField } from "@/lib/payload/samples";
import { rankObjects } from "@/lib/search/rank";
import { PicklistValuesButton } from "./PicklistValuesButton";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Input from "./ui/Input";

interface CompositeRequestEditorProps {
  subRequest: SubRequest;
  index: number;
  allObjects: SalesforceObject[];
  /** Requests BEFORE this one - the only legal @{ref} targets. */
  priorSubRequests: SubRequest[];
  /** True when another request already uses this referenceId. */
  refIdTaken: boolean;
  onUpdate: (id: string, patch: Partial<SubRequest>) => void;
  onRemove: (id: string) => void;
  onDescribeObject: (id: string, objectName: string) => Promise<void>;
}

const METHODS = ["POST", "PATCH", "GET", "DELETE"] as const;

/**
 * Edits ONE sub-request - the tree owns navigation, this owns detail.
 * Reference fields offer every prior referenceId as an @{ref.id} target
 * (type-matched ones surface as one-click suggestions).
 */
export default function CompositeRequestEditor({
  subRequest,
  index,
  allObjects,
  priorSubRequests,
  refIdTaken,
  onUpdate,
  onRemove,
  onDescribeObject,
}: CompositeRequestEditorProps) {
  const [objectSearch, setObjectSearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");

  const filteredObjects = useMemo(() => {
    const q = objectSearch.trim().toLowerCase();
    if (!q) return [];
    return rankObjects(allObjects, objectSearch, 30).filter(
      (o) => o.label.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
    );
  }, [allObjects, objectSearch]);

  const operation = subRequest.method === "PATCH" ? "PATCH" : "POST";

  const writableFields = useMemo(
    () => (subRequest.describe ? getWritableFields(subRequest.describe.fields, operation) : []),
    [subRequest.describe, operation]
  );

  const visibleFields = useMemo(
    () => rankObjects(writableFields, fieldSearch, Number.POSITIVE_INFINITY),
    [writableFields, fieldSearch]
  );

  const handleObjectSelect = async (objectName: string) => {
    setObjectSearch("");
    await onDescribeObject(subRequest.id, objectName);
  };

  const toggleField = (fieldName: string) => {
    const next = new Set(subRequest.selectedFieldNames);
    const isAdding = !next.has(fieldName);
    if (isAdding) next.add(fieldName);
    else next.delete(fieldName);

    let fieldValues = subRequest.fieldValues;
    if (isAdding && subRequest.describe) {
      const field = subRequest.describe.fields.find((f) => f.name === fieldName);
      if (field && (fieldValues[fieldName] === undefined || fieldValues[fieldName] === "")) {
        fieldValues = { ...fieldValues, [fieldName]: getSampleValueForField(field) };
      }
    }
    onUpdate(subRequest.id, { selectedFieldNames: next, fieldValues });
  };

  const setFieldValue = (fieldName: string, value: unknown) => {
    onUpdate(subRequest.id, { fieldValues: { ...subRequest.fieldValues, [fieldName]: value } });
  };

  /** Prior requests whose object matches field.referenceTo (best first). */
  const rankedPriors = (field: SalesforceField) => {
    if (field.type !== "reference") return priorSubRequests.filter((sr) => sr.referenceId);
    const matched = priorSubRequests.filter(
      (sr) => sr.referenceId && sr.objectName && field.referenceTo.includes(sr.objectName)
    );
    const rest = priorSubRequests.filter(
      (sr) => sr.referenceId && !(sr.objectName && field.referenceTo.includes(sr.objectName))
    );
    return [...matched, ...rest];
  };

  const suggested = (field: SalesforceField) =>
    field.type === "reference"
      ? priorSubRequests.find(
          (sr) => sr.referenceId && sr.objectName && field.referenceTo.includes(sr.objectName)
        )
      : undefined;

  const selectedCount = subRequest.selectedFieldNames.size;

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden">
      {/* Editor header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line-soft)] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ivory-950 text-xs font-bold text-ivory-100">
            {index + 1}
          </span>
          <div className="flex rounded border border-[var(--color-line)] overflow-hidden" role="group" aria-label="Method">
            {METHODS.map((m) => (
              <button
                key={m}
                onClick={() => onUpdate(subRequest.id, { method: m })}
                aria-pressed={subRequest.method === m}
                className={`px-2.5 py-1 text-xs font-medium tracking-wide transition-colors cursor-pointer ${
                  subRequest.method === m
                    ? "bg-ivory-950 text-ivory-100"
                    : "bg-[var(--color-surface)] text-ivory-700 hover:text-ivory-950"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="text-sm font-semibold text-ivory-950">
            {subRequest.objectName ? (subRequest.describe?.label ?? subRequest.objectName) : "New request"}
          </span>
          {subRequest.objectName && (
            <Badge variant="default" className="font-mono">@{subRequest.referenceId || "…"}</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => onRemove(subRequest.id)}>
          Remove
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {/* Object picker */}
        <div>
          <label className="mb-1 block text-xs font-medium text-ivory-700">Salesforce Object</label>
          <Input
            placeholder="Search objects…"
            value={objectSearch}
            onChange={(e) => setObjectSearch(e.target.value)}
            aria-label="Search objects for this sub-request"
          />
          {objectSearch.trim() !== "" && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded border border-[var(--color-line)] bg-white shadow-sm">
              {filteredObjects.map((obj) => (
                <button
                  key={obj.name}
                  onClick={() => handleObjectSelect(obj.name)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-ivory-200 transition-colors cursor-pointer"
                >
                  <span className="font-medium text-ivory-950">{obj.label}</span>
                  <span className="ml-2 font-mono text-xs text-ivory-600">{obj.name}</span>
                </button>
              ))}
              {filteredObjects.length === 0 && (
                <p className="px-3 py-2 text-sm text-ivory-500">No matches</p>
              )}
            </div>
          )}
          {subRequest.objectName && objectSearch.trim() === "" && (
            <p className="mt-1 font-mono text-xs text-ivory-600">{subRequest.objectName}</p>
          )}
        </div>

        {/* Reference ID */}
        {subRequest.objectName && (
          <div>
            <Input
              label="Reference ID"
              value={subRequest.referenceId}
              onChange={(e) => onUpdate(subRequest.id, { referenceId: e.target.value })}
              hint="Used as @{referenceId.id} in later sub-requests - must be unique"
              spellCheck={false}
            />
            {refIdTaken && (
              <p className="mt-1 text-xs text-red-700" role="alert">
                Another request already uses this referenceId - duplicates break the batch.
              </p>
            )}
          </div>
        )}

        {/* Record ID for PATCH/DELETE */}
        {(subRequest.method === "PATCH" || subRequest.method === "DELETE") && (
          <Input
            label={`Record ID (required for ${subRequest.method})`}
            value={subRequest.recordId}
            onChange={(e) => onUpdate(subRequest.id, { recordId: e.target.value })}
            placeholder="18-character Salesforce ID"
            className="font-mono"
            spellCheck={false}
          />
        )}

        {/* Fields */}
        {subRequest.describe && subRequest.method !== "GET" && subRequest.method !== "DELETE" && (
          <div>
            <div className="mb-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ivory-700">
                  Fields <span className="text-ivory-500">({selectedCount}/{writableFields.length})</span>
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      const names = new Set(writableFields.map((f) => f.name));
                      const vals = { ...subRequest.fieldValues };
                      writableFields.forEach((f) => {
                        if (vals[f.name] === undefined || vals[f.name] === "") {
                          vals[f.name] = getSampleValueForField(f);
                        }
                      });
                      onUpdate(subRequest.id, { selectedFieldNames: names, fieldValues: vals });
                    }}
                    className="rounded px-2 py-0.5 text-xs text-ivory-600 hover:bg-ivory-300 transition-colors cursor-pointer"
                  >
                    All
                  </button>
                  <button
                    onClick={() => onUpdate(subRequest.id, { selectedFieldNames: new Set(), fieldValues: {} })}
                    className="rounded px-2 py-0.5 text-xs text-ivory-600 hover:bg-ivory-300 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <Input
                placeholder={`Search ${writableFields.length} fields…`}
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                aria-label="Search fields in this sub-request"
              />
            </div>

            <div className="max-h-[420px] overflow-y-auto rounded border border-[var(--color-line)] bg-white divide-y divide-ivory-300">
              {visibleFields.length === 0 && (
                <p className="px-3 py-3 text-sm text-ivory-500">
                  {fieldSearch.trim() ? `No fields match "${fieldSearch.trim()}".` : "No writable fields."}
                </p>
              )}
              {visibleFields.map((field) => {
                const isSelected = subRequest.selectedFieldNames.has(field.name);
                const isRequired = isRequiredField(field, operation);
                const match = suggested(field);
                const priors = rankedPriors(field);
                return (
                  <div key={field.name}>
                    <label className={`flex cursor-pointer items-start gap-3 px-3 py-2 transition-colors hover:bg-ivory-100 ${isSelected ? "bg-ivory-200" : ""}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleField(field.name)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ivory-400 bg-white text-ivory-950"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-sm font-medium text-ivory-950">{field.label}</span>
                          {isRequired && <Badge variant="error">Required</Badge>}
                          <Badge variant="default">{field.type}</Badge>
                          {match && (
                            <Badge variant="success">⚡ @{match.referenceId}.id</Badge>
                          )}
                          {(field.type === "picklist" || field.type === "multipicklist") &&
                            (field.picklistValues ?? []).length > 0 && (
                              <PicklistValuesButton
                                objectName={subRequest.objectName}
                                objectLabel={subRequest.describe?.label ?? subRequest.objectName}
                                fieldName={field.name}
                                fieldLabel={field.label}
                                fieldType={field.type}
                                values={field.picklistValues ?? []}
                              />
                            )}
                        </div>
                        <span className="font-mono text-xs text-ivory-500">{field.name}</span>
                      </div>
                    </label>

                    {isSelected && (
                      <div className="px-3 pb-2 bg-ivory-50">
                        <FieldValueEditor
                          field={field}
                          value={subRequest.fieldValues[field.name]}
                          referenceMatch={match}
                          priors={priors}
                          onChange={setFieldValue}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Field value editor with full @{ref} picker ──────────────────────────────

interface FieldValueEditorProps {
  field: SalesforceField;
  value: unknown;
  referenceMatch: SubRequest | undefined;
  priors: SubRequest[];
  onChange: (name: string, value: unknown) => void;
}

function FieldValueEditor({ field, value, referenceMatch, priors, onChange }: FieldValueEditorProps) {
  const editorType = getFieldEditorType(field);
  const activePicklist = getActivePicklistValues(field);
  const isUsingRef = typeof value === "string" && value.startsWith("@{");

  const cls =
    "w-full rounded border border-ivory-400 bg-white px-3 py-1.5 text-sm text-ivory-950 placeholder-ivory-500 focus:border-bronze-500 focus:outline-none focus:ring-1 focus:ring-bronze-500 font-mono";

  return (
    <div className="space-y-1.5">
      {field.type === "reference" && priors.length > 0 && !isUsingRef && (
        <div className="flex flex-wrap items-center gap-1.5">
          {referenceMatch && (
            <button
              onClick={() => onChange(field.name, `@{${referenceMatch.referenceId}.id}`)}
              className="inline-flex items-center gap-1 rounded border border-green-300 bg-green-50 px-2 py-0.5 text-xs text-green-800 hover:bg-green-100 transition-colors cursor-pointer"
            >
              ⚡ Use @{referenceMatch.referenceId}.id
            </button>
          )}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onChange(field.name, `@{${e.target.value}.id}`);
            }}
            className="rounded border border-[var(--color-line)] bg-white px-2 py-0.5 text-xs text-ivory-700 cursor-pointer"
            aria-label={`Insert reference into ${field.name}`}
          >
            <option value="">@{`{ref}`} from batch…</option>
            {priors.map((sr) => (
              <option key={sr.id} value={sr.referenceId}>
                @{sr.referenceId} · {sr.describe?.label ?? sr.objectName}
              </option>
            ))}
          </select>
        </div>
      )}

      {isUsingRef ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={String(value)}
            onChange={(e) => onChange(field.name, e.target.value)}
            className={cls}
          />
          <button
            onClick={() => onChange(field.name, "")}
            className="shrink-0 rounded border border-ivory-400 px-2 py-1.5 text-xs text-ivory-600 hover:bg-ivory-300 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      ) : editorType === "boolean" ? (
        <input
          type="checkbox"
          checked={value === true || value === "true"}
          onChange={(e) => onChange(field.name, e.target.checked)}
          className="h-4 w-4 rounded border-ivory-400"
        />
      ) : editorType === "number" ? (
        <input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(field.name, e.target.value)}
          className={cls}
          step={field.type === "int" ? "1" : "0.01"}
        />
      ) : editorType === "date" ? (
        <input type="date" value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(field.name, e.target.value)} className={cls} />
      ) : editorType === "datetime" ? (
        <input type="datetime-local" value={value === undefined || value === null ? "" : String(value).replace(/\+\d{4}$/, "").replace("Z", "")} onChange={(e) => onChange(field.name, e.target.value ? `${e.target.value}:00.000+0000` : "")} className={cls} />
      ) : editorType === "picklist" ? (
        <select value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(field.name, e.target.value)} className={cls}>
          <option value="">-- Select --</option>
          {activePicklist.map((pv) => <option key={pv.value} value={pv.value}>{pv.label}</option>)}
        </select>
      ) : editorType === "textarea" ? (
        <textarea value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(field.name, e.target.value)} rows={2} className={`${cls} resize-y`} />
      ) : (
        <input
          type="text"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(field.name, e.target.value)}
          className={cls}
          placeholder={editorType === "reference" ? "Salesforce ID (18-char)" : ""}
        />
      )}
    </div>
  );
}
