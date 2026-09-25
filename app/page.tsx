"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  SalesforceObject,
  SalesforceField,
  SalesforceDescribeResult,
  GeneratedPayload,
  OperationType,
} from "@/lib/salesforce/types";
import { generatePayload, generateEndpoint } from "@/lib/payload/generator";
import { generateSampleValues, getSampleValueForField } from "@/lib/payload/samples";
import { getWritableFields } from "@/lib/salesforce/metadata";
import { AppShell } from "@/components/layout/AppShell";
import { Stepper } from "@/components/Stepper";
import { EmptyState } from "@/components/EmptyState";
import { WelcomeModal } from "@/components/WelcomeModal";
import { HowItWorksModal } from "@/components/HowItWorksModal";
import { CollectionDrawer } from "@/components/CollectionDrawer";
import { CollectionPicker } from "@/components/CollectionPicker";
import Image from "next/image";
import type { Collection, CollectionItem, NewCollectionItem } from "@/lib/collection/types";
import { newItemId } from "@/lib/collection/types";
import {
  listCollectionItems,
  saveCollectionItem,
  deleteCollectionItem,
  listCollections,
  saveCollection,
  deleteCollection as deleteCollectionFromDb,
} from "@/lib/collection/db";
import { ConnectModal } from "@/components/ConnectModal";
import { ObjectSearchOverlay } from "@/components/ObjectSearchOverlay";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/StatusBadge";
import ObjectPanel from "@/components/ObjectPanel";
import FieldPanel from "@/components/FieldPanel";
import PayloadPanel from "@/components/PayloadPanel";
import ExportPanel from "@/components/ExportPanel";
import RequestPanel from "@/components/RequestPanel";
import CompositePanel from "@/components/CompositePanel";
import GraphQLPanel from "@/components/GraphQLPanel";
import SchemaPanel from "@/components/SchemaPanel";

type BuilderMode = "single" | "composite" | "graphql" | "schema";

interface AppState {
  connected: boolean;
  instanceUrl: string;
  token: string;
  apiVersion: string;
  mode: BuilderMode;
  objectCount: number;
  objects: SalesforceObject[];
  selectedObject: SalesforceObject | null;
  describe: SalesforceDescribeResult | null;
  selectedFieldNames: Set<string>;
  fieldValues: Record<string, unknown>;
  operation: OperationType;
  recordId: string;
  generatedPayload: GeneratedPayload | null;
}

const initialState: AppState = {
  connected: false,
  instanceUrl: "",
  token: "",
  apiVersion: "v66.0",
  mode: "single",
  objectCount: 0,
  objects: [],
  selectedObject: null,
  describe: null,
  selectedFieldNames: new Set(),
  fieldValues: {},
  operation: "POST",
  recordId: "",
  generatedPayload: null,
};

interface LoadingState {
  connect: boolean;
  objects: boolean;
  describe: boolean;
}

interface ErrorState {
  connect: string | null;
  objects: string | null;
  describe: string | null;
}

const SINGLE_STEPS = [
  { label: "Connect", hint: "Org + token" },
  { label: "Select", hint: "Object + fields" },
  { label: "Configure", hint: "Values + op" },
  { label: "Export", hint: "Payload + test" },
];

const COMPOSITE_STEPS = [
  { label: "Connect", hint: "Org + token" },
  { label: "Compose", hint: "Subrequests" },
  { label: "Send", hint: "One call" },
];

const GRAPHQL_STEPS = [
  { label: "Connect", hint: "Org + token" },
  { label: "Query", hint: "Object + fields" },
  { label: "Run", hint: "Read-only" },
];

const SCHEMA_STEPS = [
  { label: "Connect", hint: "Org + token" },
  { label: "Map", hint: "Objects + links" },
  { label: "Export", hint: "PNG + present" },
];

const DEFAULT_API_VERSION =
  process.env.NEXT_PUBLIC_DEFAULT_SF_API_VERSION ?? "v66.0";

function readSavedCreds() {
  try {
    const saved = sessionStorage.getItem("sf_session");
    if (saved) {
      const parsed = JSON.parse(saved) as {
        instanceUrl?: string;
        token?: string;
        apiVersion?: string;
      };
      return {
        instanceUrl: parsed.instanceUrl ?? "",
        token: parsed.token ?? "",
        apiVersion: parsed.apiVersion ?? DEFAULT_API_VERSION,
      };
    }
  } catch {
    /* ignore */
  }
  return { instanceUrl: "", token: "", apiVersion: DEFAULT_API_VERSION };
}

/**
 * Smooth-scroll to a section and pulse a bronze ring around it,
 * so nav clicks give visible feedback even when the target is already in view.
 */
function scrollToSection(id: string, updateHash: boolean): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.remove("flash-target");
  void el.offsetWidth; // restart the animation on repeat clicks
  el.classList.add("flash-target");
  window.setTimeout(() => el.classList.remove("flash-target"), 1900);
  if (updateHash) history.replaceState(null, "", `#${id}`);
  return true;
}

export default function Home() {
  const [state, setState] = useState<AppState>(initialState);
  const [loading, setLoading] = useState<LoadingState>({
    connect: false,
    objects: false,
    describe: false,
  });
  const [errors, setErrors] = useState<ErrorState>({
    connect: null,
    objects: null,
    describe: null,
  });

  // Architect-shell UI state
  const [showWelcome, setShowWelcome] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [pickerItem, setPickerItem] = useState<NewCollectionItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [savedCreds, setSavedCreds] = useState(readSavedCreds);

  // Token stored in ref — never in rendered state or localStorage
  const tokenRef = useRef<string>("");

  // On mount: restore session, seed modal prefill, decide on welcome,
  // and reload the persisted request collection (IndexedDB)
  useEffect(() => {
    setSavedCreds(readSavedCreds());
    const saved = sessionStorage.getItem("sf_session");
    if (!saved) {
      if (!sessionStorage.getItem("sf_welcomed")) setShowWelcome(true);
      return;
    }
    try {
      const { instanceUrl, token, apiVersion } = JSON.parse(saved) as {
        instanceUrl: string;
        token: string;
        apiVersion: string;
      };
      if (instanceUrl && token && apiVersion) {
        handleConnect(instanceUrl, token, apiVersion);
      } else if (!sessionStorage.getItem("sf_welcomed")) {
        setShowWelcome(true);
      }
    } catch {
      sessionStorage.removeItem("sf_session");
      if (!sessionStorage.getItem("sf_welcomed")) setShowWelcome(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persisted collections + staged items live in IndexedDB — reload them
  // (fail-soft to memory). Legacy items without a collectionId are backfilled
  // into the default collection.
  useEffect(() => {
    (async () => {
      try {
        let cols = await listCollections();
        if (cols.length === 0) {
          const now = Date.now();
          const def: Collection = {
            id: newItemId(),
            name: "My Collection",
            createdAt: now,
            updatedAt: now,
          };
          await saveCollection(def);
          cols = [def];
        }
        const items = await listCollectionItems();
        const orphans = items.filter((i) => !i.collectionId);
        if (orphans.length > 0) {
          await Promise.all(
            orphans.map((o) => saveCollectionItem({ ...o, collectionId: cols[0].id }))
          );
          items.forEach((i) => {
            if (!i.collectionId) i.collectionId = cols[0].id;
          });
        }
        setCollections(cols);
        setActiveCollectionId(cols[0].id);
        setCollection(items);
      } catch {
        setCollections([]);
        setCollection([]);
      }
    })();
  }, []);

  // Unmount cleanup for the toast timer
  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // Deep links: #how-it-works opens the walkthrough modal, anything else scrolls after paint
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    setShowWelcome(false);
    sessionStorage.setItem("sf_welcomed", "1");
    if (hash === "how-it-works") {
      setShowHowItWorks(true);
      return;
    }
    const t = window.setTimeout(() => {
      scrollToSection(hash, false);
    }, 150);
    return () => window.clearTimeout(t);
  }, []);

  // Connection success → dismiss welcome + connect modal
  useEffect(() => {
    if (state.connected) {
      setShowConnect(false);
      setShowWelcome(false);
      sessionStorage.setItem("sf_welcomed", "1");
    }
  }, [state.connected]);

  // Global ⌘K / Ctrl+K → object quick-find when connected
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (state.connected && state.objects.length > 0) {
          e.preventDefault();
          setShowSearch(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.connected, state.objects.length]);

  const setLoadingKey = (key: keyof LoadingState, value: boolean) =>
    setLoading((prev) => ({ ...prev, [key]: value }));
  const setErrorKey = (key: keyof ErrorState, value: string | null) =>
    setErrors((prev) => ({ ...prev, [key]: value }));

  const handleConnect = useCallback(
    async (instanceUrl: string, token: string, apiVersion: string) => {
      setLoadingKey("connect", true);
      setErrorKey("connect", null);

      try {
        const response = await fetch("/api/salesforce/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instanceUrl, token, apiVersion }),
        });

        const data = (await response.json()) as { success?: boolean; objectCount?: number; error?: string };

        if (!response.ok || !data.success) {
          setErrorKey("connect", data.error ?? "Connection failed");
          return;
        }

        // Store token in ref, NOT in rendered state
        tokenRef.current = token;

        // Persist session for refresh survival (sessionStorage: tab-scoped, clears on tab close)
        sessionStorage.setItem("sf_session", JSON.stringify({ instanceUrl, token, apiVersion }));
        setSavedCreds({ instanceUrl, token, apiVersion });

        setState((prev) => ({
          ...prev,
          connected: true,
          instanceUrl,
          apiVersion,
          objectCount: data.objectCount ?? 0,
          token: "", // never put token in state
        }));

        // Load objects immediately
        await loadObjects(instanceUrl, token, apiVersion);
      } catch (err) {
        setErrorKey("connect", err instanceof Error ? err.message : "Connection failed");
      } finally {
        setLoadingKey("connect", false);
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const loadObjects = async (instanceUrl: string, token: string, apiVersion: string) => {
    setLoadingKey("objects", true);
    setErrorKey("objects", null);

    try {
      const response = await fetch("/api/salesforce/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceUrl, token, apiVersion }),
      });

      const data = (await response.json()) as { objects?: SalesforceObject[]; error?: string };

      if (!response.ok) {
        setErrorKey("objects", data.error ?? "Failed to load objects");
        return;
      }

      setState((prev) => ({ ...prev, objects: data.objects ?? [] }));
    } catch (err) {
      setErrorKey("objects", err instanceof Error ? err.message : "Failed to load objects");
    } finally {
      setLoadingKey("objects", false);
    }
  };

  const handleObjectSelect = useCallback(
    async (obj: SalesforceObject) => {
      setState((prev) => ({
        ...prev,
        selectedObject: obj,
        describe: null,
        selectedFieldNames: new Set(),
        fieldValues: {},
        generatedPayload: null,
      }));
      setErrorKey("describe", null);
      setLoadingKey("describe", true);

      try {
        const response = await fetch("/api/salesforce/describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instanceUrl: state.instanceUrl,
            token: tokenRef.current,
            apiVersion: state.apiVersion,
            objectName: obj.name,
          }),
        });

        const data = (await response.json()) as SalesforceDescribeResult & { error?: string };

        if (!response.ok) {
          setErrorKey("describe", (data as unknown as { error: string }).error ?? "Failed to load fields");
          return;
        }

        setState((prev) => ({ ...prev, describe: data }));
      } catch (err) {
        setErrorKey("describe", err instanceof Error ? err.message : "Failed to load fields");
      } finally {
        setLoadingKey("describe", false);
      }
    },
    [state.instanceUrl, state.apiVersion]
  );

  const handleToggleField = useCallback((fieldName: string) => {
    setState((prev) => {
      const next = new Set(prev.selectedFieldNames);
      const isAdding = !next.has(fieldName);
      if (isAdding) {
        next.add(fieldName);
      } else {
        next.delete(fieldName);
      }
      // Auto-seed a sample value when field is first selected (only if no value already set)
      let fieldValues = prev.fieldValues;
      if (isAdding && prev.describe) {
        const field = prev.describe.fields.find((f) => f.name === fieldName);
        if (field && (fieldValues[fieldName] === undefined || fieldValues[fieldName] === "")) {
          fieldValues = { ...fieldValues, [fieldName]: getSampleValueForField(field) };
        }
      }
      return { ...prev, selectedFieldNames: next, fieldValues, generatedPayload: null };
    });
  }, []);

  const handleSelectAll = useCallback((fields: SalesforceField[]) => {
    setState((prev) => {
      const next = new Set(prev.selectedFieldNames);
      const newValues = { ...prev.fieldValues };
      fields.forEach((f) => {
        next.add(f.name);
        if (newValues[f.name] === undefined || newValues[f.name] === "") {
          newValues[f.name] = getSampleValueForField(f);
        }
      });
      return { ...prev, selectedFieldNames: next, fieldValues: newValues, generatedPayload: null };
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedFieldNames: new Set(),
      fieldValues: {},
      generatedPayload: null,
    }));
  }, []);

  const handleFieldValueChange = useCallback((fieldName: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      fieldValues: { ...prev.fieldValues, [fieldName]: value },
      generatedPayload: null,
    }));
  }, []);

  const handleOperationChange = useCallback((op: OperationType) => {
    setState((prev) => ({ ...prev, operation: op, generatedPayload: null }));
  }, []);

  const handleRecordIdChange = useCallback((id: string) => {
    setState((prev) => ({ ...prev, recordId: id }));
  }, []);

  const handleGenerateSamples = useCallback(() => {
    if (!state.describe) return;
    const writableFields = getWritableFields(
      state.describe.fields.filter((f) => state.selectedFieldNames.has(f.name)),
      state.operation
    );
    const samples = generateSampleValues(writableFields);
    setState((prev) => ({
      ...prev,
      fieldValues: { ...prev.fieldValues, ...samples },
      generatedPayload: null,
    }));
  }, [state.describe, state.selectedFieldNames, state.operation]);

  const handleGeneratePayload = useCallback(() => {
    if (!state.describe || !state.selectedObject) return;

    const selectedFields = state.describe.fields.filter((f) =>
      state.selectedFieldNames.has(f.name)
    );

    const payload = generatePayload(selectedFields, state.fieldValues, state.operation);
    const endpoint = generateEndpoint(
      state.instanceUrl,
      state.apiVersion,
      state.selectedObject.name,
      state.operation,
      state.recordId || undefined
    );

    setState((prev) => ({
      ...prev,
      generatedPayload: {
        operation: prev.operation,
        objectName: prev.selectedObject!.name,
        endpoint,
        payload,
        recordId: prev.recordId || undefined,
      },
    }));
  }, [
    state.describe,
    state.selectedObject,
    state.selectedFieldNames,
    state.fieldValues,
    state.operation,
    state.instanceUrl,
    state.apiVersion,
    state.recordId,
  ]);

  const handleDisconnect = useCallback(() => {
    tokenRef.current = "";
    sessionStorage.removeItem("sf_session");
    setShowSearch(false);
    setShowConnect(false);
    setState(initialState);
    setErrors({ connect: null, objects: null, describe: null });
  }, []);

  const openConnect = useCallback(() => {
    setSavedCreds(readSavedCreds());
    setShowWelcome(false);
    setShowConnect(true);
  }, []);

  const flashToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const addToCollection = useCallback(
    async (collectionId: string, item: NewCollectionItem) => {
      const target = collections.find((c) => c.id === collectionId) ?? collections[0];
      if (!target) return;
      const full: CollectionItem = {
        ...item,
        id: newItemId(),
        collectionId: target.id,
        createdAt: Date.now(),
      };
      setCollection((prev) => [full, ...prev]);
      setCollections((prev) =>
        prev.map((c) => (c.id === target.id ? { ...c, updatedAt: Date.now() } : c))
      );
      saveCollectionItem(full).catch(() => {
        /* IndexedDB unavailable — item still staged in memory */
      });
      saveCollection({ ...target, updatedAt: Date.now() }).catch(() => {});
      const count = collection.filter((i) => i.collectionId === target.id).length + 1;
      flashToast(`Added to “${target.name}” (${count} staged)`);
    },
    [collections, collection, flashToast]
  );

  // "+ Collection" in any builder → ask which collection it goes to
  const requestAddToCollection = useCallback((item: NewCollectionItem) => {
    setPickerItem(item);
  }, []);

  const createCollectionAndAdd = useCallback(
    async (name: string) => {
      if (!pickerItem) return;
      const now = Date.now();
      const col: Collection = { id: newItemId(), name, createdAt: now, updatedAt: now };
      setCollections((prev) => [...prev, col]);
      setActiveCollectionId(col.id);
      saveCollection(col).catch(() => {});
      setPickerItem(null);
      await addToCollection(col.id, pickerItem);
    },
    [pickerItem, addToCollection]
  );

  const confirmAddToCollection = useCallback(
    async (collectionId: string) => {
      if (!pickerItem) return;
      setPickerItem(null);
      await addToCollection(collectionId, pickerItem);
    },
    [pickerItem, addToCollection]
  );

  const createCollection = useCallback(
    async (name: string) => {
      const now = Date.now();
      const col: Collection = { id: newItemId(), name, createdAt: now, updatedAt: now };
      setCollections((prev) => [...prev, col]);
      setActiveCollectionId(col.id);
      saveCollection(col).catch(() => {});
      flashToast(`Collection “${name}” created`);
    },
    [flashToast]
  );

  const renameCollection = useCallback((id: string, name: string) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name, updatedAt: Date.now() } : c))
    );
    saveCollection({
      ...(collections.find((c) => c.id === id) as Collection),
      name,
      updatedAt: Date.now(),
    }).catch(() => {});
  }, [collections]);

  const deleteCollectionHandler = useCallback(
    (id: string) => {
      const remaining = collections.filter((c) => c.id !== id);
      const doomed = collection.filter((i) => i.collectionId === id);
      setCollections(remaining.length > 0 ? remaining : []);
      setCollection((prev) => prev.filter((i) => i.collectionId !== id));
      if (activeCollectionId === id) {
        setActiveCollectionId(remaining[0]?.id ?? null);
      }
      deleteCollectionFromDb(id).catch(() => {});
      Promise.all(doomed.map((i) => deleteCollectionItem(i.id))).catch(() => {});
      // Never leave zero collections — recreate the default
      if (remaining.length === 0) {
        const now = Date.now();
        const def: Collection = { id: newItemId(), name: "My Collection", createdAt: now, updatedAt: now };
        setCollections([def]);
        setActiveCollectionId(def.id);
        saveCollection(def).catch(() => {});
      }
    },
    [collections, collection, activeCollectionId]
  );

  const removeFromCollection = useCallback((id: string) => {
    setCollection((prev) => prev.filter((i) => i.id !== id));
    deleteCollectionItem(id).catch(() => {});
  }, []);

  const clearActiveCollection = useCallback(() => {
    if (!activeCollectionId) return;
    const doomed = collection.filter((i) => i.collectionId === activeCollectionId);
    setCollection((prev) => prev.filter((i) => i.collectionId !== activeCollectionId));
    Promise.all(doomed.map((i) => deleteCollectionItem(i.id))).catch(() => {});
  }, [collection, activeCollectionId]);

  // Header nav: offline → prompt connect; online → switch mode + scroll to section
  const handleNavigate = useCallback(
    (mode: "builder" | "composite" | "graphql" | "schema") => {
      if (!state.connected) {
        openConnect();
        return;
      }
      if (mode !== "builder") {
        setState((p) => ({ ...p, mode }));
      } else {
        setState((p) => ({ ...p, mode: "single" }));
      }
      window.setTimeout(() => {
        const id =
          mode === "composite" ? "composite"
          : mode === "graphql" ? "graphql"
          : mode === "schema" ? "schema"
          : "builder";
        scrollToSection(id, false);
      }, 80);
    },
    [state.connected, openConnect]
  );

  const selectedFields = state.describe?.fields.filter((f) =>
    state.selectedFieldNames.has(f.name)
  ) ?? [];

  const singleStep = !state.connected
    ? 0
    : !state.selectedObject || selectedFields.length === 0
      ? 1
      : !state.generatedPayload
        ? 2
        : 3;

  const host = (() => {
    try {
      return new URL(state.instanceUrl).host;
    } catch {
      return state.instanceUrl;
    }
  })();

  return (
    <AppShell
      connected={state.connected}
      instanceUrl={state.instanceUrl}
      apiVersion={state.apiVersion}
      objectCount={state.objectCount}
      connecting={loading.connect}
      onConnectClick={openConnect}
      onDisconnect={handleDisconnect}
      onSearchClick={() => setShowSearch(true)}
      onNavigate={handleNavigate}
      collectionCount={collection.length}
      onCollectionClick={() => setShowCollection(true)}
    >
      <main className="mx-auto w-full px-5 py-6 space-y-5">
        {!state.connected ? (
          <>
            {/* ── Disconnected hero ── */}
            <section aria-label="Welcome" className="arch-card overflow-hidden">
              <div className="grid items-center gap-8 px-6 sm:px-10 pt-8 sm:pt-10 pb-6 lg:grid-cols-2">
                <div>
                <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--color-accent-dark)]">
                  Metadata-driven REST payload builder
                </p>
                <h1 className="hero-title mt-2 text-4xl sm:text-5xl xl:text-6xl text-ivory-950">
                  From live metadata to <em>ready-to-send payloads.</em>
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-ivory-700">
                  Connect to any Salesforce org, describe any standard or custom
                  sObject, and generate accurate POST / PATCH payloads plus
                  Composite API batches — exported as JSON, cURL, JavaScript
                  fetch or Apex. No manual field copy-paste.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <Button size="lg" onClick={openConnect} loading={loading.connect}>
                    Connect to Salesforce
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => setShowHowItWorks(true)}
                  >
                    How it works
                  </Button>
                </div>
                {errors.connect && (
                  <div className="mt-4 max-w-xl rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                    {errors.connect}{" "}
                    <button type="button" onClick={openConnect} className="underline font-medium cursor-pointer">
                      Try again
                    </button>
                  </div>
                )}
                </div>
                <div className="relative">
                  <Image
                    src="/sf-payload-toolkit.webp"
                    alt="Salesforce sObject Payload Studio — payload builder preview"
                    width={1536}
                    height={1024}
                    priority
                    className="w-full max-w-[440px] ml-auto h-auto mix-blend-multiply drop-shadow-lg"
                  />
                </div>
              </div>
              <div className="bronze-rule mx-6 sm:mx-10" aria-hidden="true" />
              <div id="how-it-works" className="grid sm:grid-cols-3 gap-3 px-6 sm:px-10 py-6 scroll-mt-20">
                {[
                  { t: "Table API payloads", d: "POST & PATCH bodies with type-correct values, required-field awareness and record-ID handling." },
                  { t: "Composite batches", d: "Multi-sObject graphs with reference IDs in a single Composite API call." },
                  { t: "Export anywhere", d: "JSON, cURL with $SF_ACCESS_TOKEN placeholder, JS fetch, or Apex HttpRequest." },
                ].map((f) => (
                  <div key={f.t} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)] p-4">
                    <p className="text-xs font-semibold text-ivory-950">{f.t}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ivory-600">{f.d}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            {/* ── Stepper ── */}
            <Stepper
              steps={
                state.mode === "composite"
                  ? COMPOSITE_STEPS
                  : state.mode === "graphql"
                    ? GRAPHQL_STEPS
                    : state.mode === "schema"
                      ? SCHEMA_STEPS
                      : SINGLE_STEPS
              }
              current={state.mode === "single" ? singleStep : 1}
            />

            {/* ── Org context strip ── */}
            <div className="arch-card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
              <StatusBadge status={loading.connect ? "loading" : "connected"} />
              <span className="text-xs font-medium text-ivory-950 truncate max-w-[260px]" title={state.instanceUrl}>
                {host}
              </span>
              <span className="text-xs text-ivory-600 font-mono">{state.apiVersion}</span>
              {state.objectCount > 0 && (
                <span className="text-xs text-ivory-600">
                  {state.objectCount.toLocaleString()} objects
                </span>
              )}
              <span className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => setShowSearch(true)}>
                Find objects ⌘K
              </Button>
              <Button variant="ghost" size="sm" onClick={openConnect}>
                Switch org
              </Button>
            </div>

            {/* ── Mode toggle ── */}
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg border border-[var(--color-line)] overflow-hidden w-fit bg-[var(--color-surface)]" role="tablist" aria-label="Builder mode">
                {(
                  [
                    { id: "single", label: "Single Object" },
                    { id: "composite", label: "Composite API" },
                    { id: "graphql", label: "GraphQL" },
                    { id: "schema", label: "Schema Map" },
                  ] as { id: BuilderMode; label: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    role="tab"
                    aria-selected={state.mode === m.id}
                    className={`px-4 py-2 text-xs font-medium tracking-wide transition-colors cursor-pointer ${
                      state.mode === m.id ? "bg-ivory-950 text-ivory-100" : "text-ivory-700 hover:text-ivory-950"
                    }`}
                    onClick={() => setState((p) => ({ ...p, mode: m.id }))}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <span className="hidden sm:inline text-[11px] text-ivory-600">
                {state.mode === "composite"
                  ? "Batch multiple sObjects with reference IDs in one call"
                  : state.mode === "graphql"
                    ? "Read-only queries against live metadata — no mutations"
                    : state.mode === "schema"
                      ? "Explore the data model as an ERD — discover, present, export"
                      : "POST or PATCH a single record with live field metadata"}
              </span>
            </div>

            {/* ── Composite mode ── */}
            {state.mode === "composite" && (
              <section id="composite" aria-label="Composite API Builder" className="scroll-mt-20">
                <CompositePanel
                  objects={state.objects}
                  instanceUrl={state.instanceUrl}
                  apiVersion={state.apiVersion}
                  getToken={() => tokenRef.current}
                  onAddToCollection={requestAddToCollection}
                />
              </section>
            )}

            {/* ── GraphQL mode ── */}
            {state.mode === "graphql" && (
              <section id="graphql" aria-label="GraphQL Query Builder" className="scroll-mt-20">
                <GraphQLPanel
                  objects={state.objects}
                  instanceUrl={state.instanceUrl}
                  apiVersion={state.apiVersion}
                  getToken={() => tokenRef.current}
                  onAddToCollection={requestAddToCollection}
                />
              </section>
            )}

            {/* ── Schema deep-dive mode ── */}
            {state.mode === "schema" && (
              <section id="schema" aria-label="Schema Deep Dive" className="scroll-mt-20">
                <SchemaPanel
                  objects={state.objects}
                  instanceUrl={state.instanceUrl}
                  apiVersion={state.apiVersion}
                  getToken={() => tokenRef.current}
                />
              </section>
            )}

            {/* ── Single object mode ── */}
            {state.mode === "single" && (
              <section id="builder" aria-label="Object and Field Selection" className="scroll-mt-20">
                <div className="grid gap-5 lg:grid-cols-2">
                  <ObjectPanel
                    objects={state.objects}
                    selectedObject={state.selectedObject}
                    loading={loading.objects}
                    error={errors.objects}
                    onSelect={handleObjectSelect}
                  />

                  {state.selectedObject ? (
                    <FieldPanel
                      fields={state.describe?.fields ?? []}
                      selectedFieldNames={state.selectedFieldNames}
                      operation={state.operation}
                      loading={loading.describe}
                      error={errors.describe}
                      onToggleField={handleToggleField}
                      onSelectAll={handleSelectAll}
                      onClearAll={handleClearAll}
                    />
                  ) : (
                    <EmptyState
                      icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect x="3" y="4" width="18" height="16" rx="2" />
                          <path d="M3 9h18M8 4v5" />
                        </svg>
                      }
                      title="Select an object to describe its fields"
                      description="Pick any standard or custom sObject — or press ⌘K to jump straight to it. Field types, picklists and writability load live from your org."
                      action={
                        <Button variant="secondary" size="sm" onClick={() => setShowSearch(true)}>
                          Find objects ⌘K
                        </Button>
                      }
                    />
                  )}
                </div>
              </section>
            )}

            {/* Step 3: Payload values */}
            {state.connected && state.mode === "single" && selectedFields.length > 0 && (
              <section aria-label="Payload Configuration">
                <PayloadPanel
                  selectedFields={selectedFields}
                  fieldValues={state.fieldValues}
                  operation={state.operation}
                  recordId={state.recordId}
                  onFieldValueChange={handleFieldValueChange}
                  onOperationChange={handleOperationChange}
                  onRecordIdChange={handleRecordIdChange}
                  onGeneratePayload={handleGeneratePayload}
                  onGenerateSamples={handleGenerateSamples}
                />
              </section>
            )}

            {/* Step 4: Export */}
            {state.generatedPayload && state.mode === "single" && (
              <section aria-label="Export">
                <ExportPanel generatedPayload={state.generatedPayload} onAddToCollection={requestAddToCollection} />
              </section>
            )}

            {/* Step 5: Test request */}
            {state.generatedPayload && state.mode === "single" && (
              <section aria-label="Test Request">
                <RequestPanel
                  generatedPayload={state.generatedPayload}
                  instanceUrl={state.instanceUrl}
                  apiVersion={state.apiVersion}
                  getToken={() => tokenRef.current}
                />
              </section>
            )}
          </>
        )}
      </main>

      {/* ── Overlays ── */}
      <CollectionPicker
        item={pickerItem}
        collections={collections}
        items={collection}
        onConfirm={confirmAddToCollection}
        onCreateAndConfirm={createCollectionAndAdd}
        onClose={() => setPickerItem(null)}
      />
      <CollectionDrawer
        open={showCollection}
        collections={collections}
        activeCollectionId={activeCollectionId}
        items={collection}
        onClose={() => setShowCollection(false)}
        onSwitch={setActiveCollectionId}
        onCreate={createCollection}
        onRename={renameCollection}
        onDelete={deleteCollectionHandler}
        onRemove={removeFromCollection}
        onClearActive={clearActiveCollection}
      />
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 rounded-full bg-ivory-950 text-ivory-100 pl-3 pr-4 py-2 text-xs font-medium shadow-xl"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-[11px]" aria-hidden="true">✓</span>
          {toast}
          <button
            type="button"
            onClick={() => {
              setToast(null);
              setShowCollection(true);
            }}
            className="underline underline-offset-2 hover:text-bronze-200 cursor-pointer"
          >
            Review
          </button>
        </div>
      )}
      <HowItWorksModal
        open={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
        onConnect={openConnect}
      />
      <WelcomeModal
        open={showWelcome && !state.connected}
        onConnect={openConnect}
        onExplore={() => {
          setShowWelcome(false);
          sessionStorage.setItem("sf_welcomed", "1");
        }}
      />
      <ConnectModal
        open={showConnect}
        loading={loading.connect}
        error={errors.connect}
        initialInstanceUrl={savedCreds.instanceUrl}
        initialToken={savedCreds.token}
        initialApiVersion={savedCreds.apiVersion}
        onClose={() => { if (!loading.connect) setShowConnect(false); }}
        onConnect={handleConnect}
      />
      {showSearch && state.objects.length > 0 && (
        <ObjectSearchOverlay
          objects={state.objects}
          onSelect={handleObjectSelect}
          onClose={() => setShowSearch(false)}
        />
      )}
    </AppShell>
  );
}
