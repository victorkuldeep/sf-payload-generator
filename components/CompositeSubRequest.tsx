"use client";

import { useMemo, useState } from "react";
import { CompositeSubRequest as SubRequest, SalesforceObject, SalesforceField } from "@/lib/salesforce/types";
import { getWritableFields, getActivePicklistValues, getFieldEditorType, isRequiredField } from "@/lib/salesforce/metadata";
import { getSampleValueForField } from "@/lib/payload/samples";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Input from "./ui/Input";

interface Props {
  index: number;
  subRequest: SubRequest;
  allObjects: SalesforceObject[];
  /** Sub-requests that come BEFORE this one - used for smart reference detection */
  priorSubRequests: SubRequest[];
  onUpdate: (id: string, patch: Partial<SubRequest>) => void;
  onRemove: (id: string) => void;
  onDescribeObject: (id: string, objectName: string) => Promise<void>;
}

const METHODS = ["POST", "PATCH", "GET", "DELETE"] as const;

export default function CompositeSubRequestCard({
  index,
  subRequest,
  allObjects,
  priorSubRequests,
  onUpdate,
  onRemove,
  onDescribeObject,
}: Props) {
  const [objectSearch, setObjectSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const filteredObjects = useMemo(() => {
    const q = objectSearch.toLowerCase();
    if (!q) return allObjects;
    return allObjects.filter(
      (o) => o.label.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
    );
  }, [allObjects, objectSearch]);

  const operation = subRequest.method === "PATCH" ? "PATCH" : "POST";

  const writableFields = useMemo(
    () => (subRequest.describe ? getWritableFields(subRequest.describe.fields, operation) : []),
    [subRequest.describe, operation]
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

    // Auto-seed sample value when field is first checked
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

  /** Returns a prior sub-request whose objectName matches one of field.referenceTo */
  const findReferenceMatch = (field: SalesforceField) =>
    field.type === "reference"
      ? priorSubRequests.find(
          (sr) => sr.objectName && field.referenceTo.includes(sr.objectName)
        )
      : undefined;

  return (
    <div className="rounded-lg border border-ivory-400 bg-ivory-100">
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ivory-400">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ivory-950 text-xs font-bold text-ivory-100">
            {index + 1}
          </span>
          <div className="flex items-center gap-2">
            {/* Method selector */}
            <div className="flex rounded border border-ivory-400 overflow-hidden">
              {METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => onUpdate(subRequest.id, { method: m })}
                  className={`px-2.5 py-1 text-xs font-medium tracking-wide transition-colors ${
                    subRequest.method === m
                      ? "bg-ivory-950 text-ivory-100"
                      : "bg-ivory-200 text-ivory-700 hover:text-ivory-950"
                  }`}
                  aria-pressed={subRequest.method === m}
                >
                  {m}
                </button>
              ))}
            </div>
            <span className="text-sm font-medium text-ivory-950">
              {subRequest.objectName || <span className="text-ivory-500 font-normal">Select object…</span>}
            </span>
            {subRequest.objectName && (
              <Badge variant="default" className="font-mono">{subRequest.referenceId}</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded px-2 py-1 text-xs text-ivory-600 hover:bg-ivory-300 transition-colors"
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
          <Button variant="ghost" size="sm" onClick={() => onRemove(subRequest.id)}>
            Remove
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Object picker */}
          <div>
            <label className="block text-xs font-medium text-ivory-700 mb-1">Salesforce Object</label>
            <Input
              placeholder="Search objects…"
              value={objectSearch}
              onChange={(e) => setObjectSearch(e.target.value)}
            />
            {objectSearch && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded border border-ivory-400 bg-white shadow-sm">
                {filteredObjects.slice(0, 30).map((obj) => (
                  <button
                    key={obj.name}
                    onClick={() => handleObjectSelect(obj.name)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-ivory-200 transition-colors"
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
            {subRequest.objectName && !objectSearch && (
              <p className="mt-1 text-xs text-ivory-600 font-mono">{subRequest.objectName}</p>
            )}
          </div>

          {/* Reference ID (editable) */}
          {subRequest.objectName && (
            <div>
              <Input
                label="Reference ID"
                value={subRequest.referenceId}
                onChange={(e) => onUpdate(subRequest.id, { referenceId: e.target.value })}
                hint="Used as @{referenceId.id} in later sub-requests"
                spellCheck={false}
              />
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

          {/* Field selector + editors */}
          {subRequest.describe && subRequest.method !== "GET" && subRequest.method !== "DELETE" && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-ivory-700">
                  Fields <span className="text-ivory-500">({writableFields.length} writable)</span>
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
                    className="rounded px-2 py-0.5 text-xs text-ivory-600 hover:bg-ivory-300 transition-colors"
                  >
                    All
                  </button>
                  <button
                    onClick={() => onUpdate(subRequest.id, { selectedFieldNames: new Set(), fieldValues: {} })}
                    className="rounded px-2 py-0.5 text-xs text-ivory-600 hover:bg-ivory-300 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto rounded border border-ivory-400 bg-white divide-y divide-ivory-300">
                {writableFields.map((field) => {
                  const isSelected = subRequest.selectedFieldNames.has(field.name);
                  const isRequired = isRequiredField(field, operation);
                  const referenceMatch = findReferenceMatch(field);

                  return (
                    <div key={field.name}>
                      {/* Field checkbox row */}
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
                            {/* Smart reference badge */}
                            {referenceMatch && (
                              <Badge variant="success">
                                ⚡ @&#123;{referenceMatch.referenceId}.id&#125;
                              </Badge>
                            )}
                          </div>
                          <span className="font-mono text-xs text-ivory-500">{field.name}</span>
                        </div>
                      </label>

                      {/* Value editor when selected */}
                      {isSelected && (
                        <div className="px-3 pb-2 bg-ivory-50">
                          <FieldValueEditor
                            field={field}
                            value={subRequest.fieldValues[field.name]}
                            referenceMatch={referenceMatch}
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
      )}
    </div>
  );
}

// ── Inline field value editor ─────────────────────────────────────────────────

interface FieldValueEditorProps {
  field: SalesforceField;
  value: unknown;
  referenceMatch: SubRequest | undefined;
  onChange: (name: string, value: unknown) => void;
}

function FieldValueEditor({ field, value, referenceMatch, onChange }: FieldValueEditorProps) {
  const editorType = getFieldEditorType(field);
  const activePicklist = getActivePicklistValues(field);
  const isUsingRef = typeof value === "string" && value.startsWith("@{");

  const cls =
    "w-full rounded border border-ivory-400 bg-white px-3 py-1.5 text-sm text-ivory-950 placeholder-ivory-500 focus:border-bronze-500 focus:outline-none focus:ring-1 focus:ring-bronze-500 font-mono";

  return (
    <div className="space-y-1">
      {/* Smart reference quick-fill button */}
      {referenceMatch && !isUsingRef && (
        <button
          onClick={() => onChange(field.name, `@{${referenceMatch.referenceId}.id}`)}
          className="inline-flex items-center gap-1 rounded border border-green-300 bg-green-50 px-2 py-0.5 text-xs text-green-800 hover:bg-green-100 transition-colors"
        >
          ⚡ Use @&#123;{referenceMatch.referenceId}.id&#125;
        </button>
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
            className="shrink-0 rounded border border-ivory-400 px-2 py-1.5 text-xs text-ivory-600 hover:bg-ivory-300 transition-colors"
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
