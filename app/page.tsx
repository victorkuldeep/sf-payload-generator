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
import { isSessionExpiredMessage } from "@/lib/salesforce/client";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { Stepper } from "@/components/Stepper";
import { EmptyState } from "@/components/EmptyState";
import { WelcomeModal } from "@/components/WelcomeModal";
import { HowItWorksModal } from "@/components/HowItWorksModal";
import { SessionExpiredModal } from "@/components/SessionExpiredModal";
import { BootLoader } from "@/components/BootLoader";
import { CollectionDrawer } from "@/components/CollectionDrawer";
import { CollectionPicker } from "@/components/CollectionPicker";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
import ObjectPanel from "@/components/ObjectPanel";
import FieldPanel from "@/components/FieldPanel";
import PayloadPanel from "@/components/PayloadPanel";
import ExportPanel from "@/components/ExportPanel";
import RequestPanel from "@/components/RequestPanel";
import CompositePanel from "@/components/CompositePanel";
import GraphQLPanel from "@/components/GraphQLPanel";
import SoqlPanel from "@/components/SoqlPanel";
import RestExplorerPanel from "@/components/RestExplorerPanel";
import dynamic from "next/dynamic";

// Schema canvas loads on demand: keeps the main bundle lean and the
// static-generation worker light (xyflow + dagre stay out of SSR).
const SchemaPanel = dynamic(() => import("@/components/SchemaPanel"), {
  ssr: false,
  loading: () => (
    <div className="arch-card px-6 py-12 text-center text-sm text-ivory-600">
      Loading schema canvas…
    </div>
  ),
});

type BuilderMode = "home" | "single" | "composite" | "soql" | "graphql" | "schema" | "rest";

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
  mode: "home",
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

const SOQL_STEPS = [
  { label: "Connect", hint: "Org + token" },
  { label: "Query", hint: "SOQL + plan" },
  { label: "Export", hint: "CSV + JSON" },
];

const REST_STEPS = [
  { label: "Connect", hint: "Org + token" },
  { label: "Explore", hint: "Any method" },
  { label: "Export", hint: "Collect" },
];

const GRAPHQL_STEPS = [
  { label: "Connect", hint: "Org + token" },
  { label: "Query", hint: "Object + fields" },
  { label: "Run", hint: "Read-only" },
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

/**
 * The home hero - identical offline and online (post-login it just swaps
 * the primary CTA to Switch org). Headline, artwork, trio cards.
 */
const HERO_SLIDES: {
  eyebrow: string;
  titleA: string;
  titleEm: string;
  copy: string;
  cta: string;
  mode: Exclude<BuilderMode, "home"> | "json";
}[] = [
  {
    eyebrow: "Metadata-driven REST payload builder",
    titleA: "From live metadata to",
    titleEm: "ready-to-send payloads.",
    copy: "Connect to any Salesforce org, describe any standard or custom sObject, and generate accurate POST / PATCH payloads plus Composite API batches - exported as JSON, cURL, JavaScript fetch or Apex. No manual field copy-paste.",
    cta: "Single Object",
    mode: "single",
  },
  {
    eyebrow: "Composite Studio",
    titleA: "Requests, graph,",
    titleEm: "payload.",
    copy: "Compose multi-sObject batches with unique reference IDs - Requests, Graph and Payload screens on one canonical model.",
    cta: "Composite",
    mode: "composite",
  },
  {
    eyebrow: "SOQL query engine",
    titleA: "Ask anything,",
    titleEm: "explain everything.",
    copy: "Run SOQL with query plans, history, saved queries and CSV exports - Dev Console power without leaving the studio.",
    cta: "SOQL",
    mode: "soql",
  },
  {
    eyebrow: "GraphQL query builder",
    titleA: "One round trip,",
    titleEm: "whole graph.",
    copy: "Traverse lookup trees with value precision - live metadata, read-only, no mutations.",
    cta: "GraphQL",
    mode: "graphql",
  },
  {
    eyebrow: "Schema deep dive",
    titleA: "See the model,",
    titleEm: "not just the fields.",
    copy: "Explore any org as an ERD canvas - discover relationships, present with the laser, export hi-res PNG.",
    cta: "Schema Map",
    mode: "schema",
  },
  {
    eyebrow: "Raw REST explorer",
    titleA: "Any method,",
    titleEm: "any endpoint.",
    copy: "Send org-scoped or public calls with cURL paste, history and one-click collection staging.",
    cta: "REST",
    mode: "rest",
  },
  {
    eyebrow: "JSON Studio",
    titleA: "Diff payloads,",
    titleEm: "node by node.",
    copy: "Edit JSON in a tree and compare versions side by side - virtualized for the biggest context payloads.",
    cta: "JSON",
    mode: "json",
  },
];

function HomeHero({
  connected,
  loadingConnect,
  connectError,
  onConnect,
  onHowItWorks,
  onJumpMode,
}: {
  connected: boolean;
  loadingConnect: boolean;
  connectError: string | null;
  onConnect: () => void;
  onHowItWorks: () => void;
  onJumpMode: (m: Exclude<BuilderMode, "home"> | "json") => void;
}) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const t = window.setInterval(() => setIdx((i) => (i + 1) % HERO_SLIDES.length), 15000);
    return () => window.clearInterval(t);
  }, [paused]);

  const slide = HERO_SLIDES[idx];

  return (
    <section
      aria-label="Welcome"
      aria-roledescription="carousel"
      className="arch-card hero-mesh overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="grid items-center gap-8 px-6 sm:px-10 pt-8 sm:pt-10 pb-6 lg:grid-cols-2">
        <div key={idx} className="hero-slide">
          <p className="hero-kicker">
            <span className="hero-kicker__dot" aria-hidden="true" />
            Architect toolkit · API-first Salesforce
          </p>
          <p className="mt-3 font-mono text-[11px] font-semibold uppercase tracking-[2.4px] text-[var(--color-accent-dark)]">
            {slide.eyebrow}
          </p>
          <h1 className="hero-title mt-2 text-4xl sm:text-5xl xl:text-6xl text-ivory-950">
            {slide.titleA} <em>{slide.titleEm}</em>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ivory-700">
            {slide.copy}
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Button size="lg" onClick={onConnect} loading={loadingConnect}>
              {connected ? "Switch org" : "Connect to Salesforce"}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => onJumpMode(slide.mode)}
            >
              Open {slide.cta} →
            </Button>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Hero slides">
              <button
                type="button"
                onClick={() => setIdx((idx + HERO_SLIDES.length - 1) % HERO_SLIDES.length)}
                aria-label="Previous slide"
                className="rounded p-1 text-ivory-500 hover:text-ivory-950 transition-colors cursor-pointer"
              >
                ‹
              </button>
              {HERO_SLIDES.map((s, i) => (
                <button
                  key={s.cta}
                  type="button"
                  role="tab"
                  aria-selected={i === idx}
                  aria-label={`Slide ${i + 1}: ${s.cta}`}
                  onClick={() => setIdx(i)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    i === idx ? "w-6 bg-bronze-600" : "w-1.5 bg-ivory-400 hover:bg-ivory-600"
                  }`}
                />
              ))}
              <button
                type="button"
                onClick={() => setIdx((idx + 1) % HERO_SLIDES.length)}
                aria-label="Next slide"
                className="rounded p-1 text-ivory-500 hover:text-ivory-950 transition-colors cursor-pointer"
              >
                ›
              </button>
            </div>
            <button
              type="button"
              onClick={onHowItWorks}
              className="text-xs text-ivory-600 hover:text-ivory-950 underline underline-offset-2 cursor-pointer"
            >
              How it works
            </button>
          </div>
          {connectError && (
            <div className="mt-4 max-w-xl rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {connectError}{" "}
              <button type="button" onClick={onConnect} className="underline font-medium cursor-pointer">
                Try again
              </button>
            </div>
          )}
        </div>
        <div className="relative">
          <Image
            src="/sf-payload-toolkit.webp"
            alt="Salesforce sObject Payload Studio - payload builder preview"
            width={1536}
            height={1024}
            priority
            className="w-full max-w-[360px] ml-auto h-auto mix-blend-multiply drop-shadow-lg"
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
  );
}

export default function Home() {
  const router = useRouter();
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
  const [sessionExpired, setSessionExpired] = useState(false);

  const handleSessionExpired = useCallback(() => {
    setSessionExpired(true);
  }, []);

  // Graceful boot: cover connect + initial object load so the UI never
  // pops in half-built. Fades out once the object list lands (or fails).
  const bootActive =
    loading.connect || (state.connected && loading.objects && state.objects.length === 0);
  const [bootShown, setBootShown] = useState(false);
  const [bootFade, setBootFade] = useState(false);
  useEffect(() => {
    let t: number | undefined;
    if (bootActive) {
      setBootShown(true);
      setBootFade(false);
    } else if (bootShown) {
      setBootFade(true);
      t = window.setTimeout(() => setBootShown(false), 300);
    }
    return () => window.clearTimeout(t);
  }, [bootActive, bootShown]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [savedCreds, setSavedCreds] = useState(readSavedCreds);

  // Token stored in ref - never in rendered state or localStorage
  const tokenRef = useRef<string>("");

  // Jump-link intent from the hero carousel when offline: connect first, land after.
  const pendingModeRef = useRef<Exclude<BuilderMode, "home"> | null>(null);

  const openConnect = useCallback(() => {
    setSavedCreds(readSavedCreds());
    setShowWelcome(false);
    setShowConnect(true);
  }, []);

  // Header nav: offline → prompt connect; online → switch mode + scroll to section
  const goMode = useCallback((mode: BuilderMode) => {
    setState((p) => ({ ...p, mode }));
    if (mode === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.setTimeout(() => {
      const id =
        mode === "composite" ? "composite"
        : mode === "soql" ? "soql"
        : mode === "graphql" ? "graphql"
        : mode === "schema" ? "schema"
        : mode === "rest" ? "rest"
        : "builder";
      scrollToSection(id, false);
    }, 80);
  }, []);

  const handleNavigate = useCallback(
    (mode: "home" | "builder" | "composite" | "soql" | "graphql" | "schema" | "rest") => {
      // Home is always available - it just shows the start screen.
      if (mode === "home") {
        goMode("home");
        return;
      }
      if (!state.connected) {
        openConnect();
        return;
      }
      goMode(mode === "builder" ? "single" : mode);
    },
    [state.connected, openConnect, goMode]
  );

  // Hero carousel jump links: offline visitors connect first, then land
  // on the chosen builder automatically. JSON Studio is standalone.
  const jumpToMode = useCallback(
    (mode: Exclude<BuilderMode, "home"> | "json") => {
      if (mode === "json") {
        router.push("/json");
        return;
      }
      if (!state.connected) {
        pendingModeRef.current = mode;
        openConnect();
        return;
      }
      goMode(mode);
    },
    [state.connected, openConnect, goMode, router]
  );

  // On mount: restore session, seed modal prefill, decide on welcome,
  // and reload the persisted request collection (IndexedDB).
  // A dead restored session pops the Connect dialog instead of failing silently.
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
        sessionStorage.setItem("sf_welcomed", "1");
        void handleConnect(instanceUrl, token, apiVersion).then((ok) => {
          if (!ok) {
            setSavedCreds(readSavedCreds());
            setShowConnect(true);
          }
        });
      } else if (!sessionStorage.getItem("sf_welcomed")) {
        setShowWelcome(true);
      }
    } catch {
      sessionStorage.removeItem("sf_session");
      if (!sessionStorage.getItem("sf_welcomed")) setShowWelcome(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persisted collections + staged items live in IndexedDB - reload them
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

  // Connection success → dismiss welcome + connect + expired modals,
  // then honor any pending hero jump-link
  useEffect(() => {
    if (state.connected) {
      setShowConnect(false);
      setShowWelcome(false);
      setSessionExpired(false);
      sessionStorage.setItem("sf_welcomed", "1");
      if (pendingModeRef.current) {
        const m = pendingModeRef.current;
        pendingModeRef.current = null;
        goMode(m);
      }
    }
  }, [state.connected, goMode]);

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
    async (instanceUrl: string, token: string, apiVersion: string): Promise<boolean> => {
      setLoadingKey("connect", true);
      setErrorKey("connect", null);

      try {
        const response = await apiFetch("/api/salesforce/connect", { instanceUrl, token, apiVersion });

        const data = (await response.json()) as { success?: boolean; objectCount?: number; error?: string };

        if (!response.ok || !data.success) {
          setErrorKey("connect", data.error ?? "Connection failed");
          return false;
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
        return true;
      } catch (err) {
        setErrorKey("connect", err instanceof Error ? err.message : "Connection failed");
        return false;
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
      const response = await apiFetch("/api/salesforce/objects", { instanceUrl, token, apiVersion });

      const data = (await response.json()) as { objects?: SalesforceObject[]; error?: string };

      if (!response.ok) {
        const message = data.error ?? "Failed to load objects";
        setErrorKey("objects", message);
        if (isSessionExpiredMessage(message)) handleSessionExpired();
        return;
      }

      setState((prev) => ({ ...prev, objects: data.objects ?? [] }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load objects";
      setErrorKey("objects", message);
      if (isSessionExpiredMessage(message)) handleSessionExpired();
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
        const response = await apiFetch("/api/salesforce/describe", {
          instanceUrl: state.instanceUrl,
          token: tokenRef.current,
          apiVersion: state.apiVersion,
          objectName: obj.name,
        });

        const data = (await response.json()) as SalesforceDescribeResult & { error?: string };

        if (!response.ok) {
          const message = (data as unknown as { error: string }).error ?? "Failed to load fields";
          setErrorKey("describe", message);
          if (isSessionExpiredMessage(message)) handleSessionExpired();
          return;
        }

        setState((prev) => ({ ...prev, describe: data }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load fields";
        setErrorKey("describe", message);
        if (isSessionExpiredMessage(message)) handleSessionExpired();
      } finally {
        setLoadingKey("describe", false);
      }
    },
    [state.instanceUrl, state.apiVersion, handleSessionExpired]
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
    setSessionExpired(false);
    setState(initialState);
    setErrors({ connect: null, objects: null, describe: null });
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
        /* IndexedDB unavailable - item still staged in memory */
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
      // Never leave zero collections - recreate the default
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
      activeMode={state.mode === "single" ? "builder" : state.mode}
      collectionCount={collection.length}
      onCollectionClick={() => setShowCollection(true)}
      trail={
        state.connected && state.mode !== "home" && state.mode !== "schema" ? (
          <Stepper
                steps={
                  state.mode === "composite"
                    ? COMPOSITE_STEPS
                    : state.mode === "soql"
                      ? SOQL_STEPS
                      : state.mode === "graphql"
                        ? GRAPHQL_STEPS
                        : state.mode === "rest"
                          ? REST_STEPS
                          : SINGLE_STEPS
                }
            current={state.mode === "single" ? singleStep : 1}
          />
        ) : null
      }
    >
      <main className="mx-auto w-full px-5 py-6 space-y-5">
        {!state.connected ? (
          <HomeHero
            connected={false}
            loadingConnect={loading.connect}
            connectError={errors.connect}
            onConnect={openConnect}
            onHowItWorks={() => setShowHowItWorks(true)}
            onJumpMode={jumpToMode}
          />
        ) : (
          <>
            {/* ── Connected home: the same home hero ── */}
            {state.mode === "home" && (
              <HomeHero
                connected
                loadingConnect={loading.connect}
                connectError={errors.connect}
                onConnect={openConnect}
                onHowItWorks={() => setShowHowItWorks(true)}
                onJumpMode={jumpToMode}
              />
            )}

            {/* ── Builder modes stay mounted (hidden when inactive) so work
                survives tab switches - describe caches, drafts, canvases kept ── */}
            {/* ── Composite mode ── */}
            <div hidden={state.mode !== "composite"}>
              <section id="composite" aria-label="Composite API Builder" className="scroll-mt-20">
                <CompositePanel
                  objects={state.objects}
                  instanceUrl={state.instanceUrl}
                  apiVersion={state.apiVersion}
                  getToken={() => tokenRef.current}
                  onAddToCollection={requestAddToCollection}
                  onSessionExpired={handleSessionExpired}
                />
              </section>
            </div>

            {/* ── GraphQL mode ── */}
            <div hidden={state.mode !== "graphql"}>
              <section id="graphql" aria-label="GraphQL Query Builder" className="scroll-mt-20">
                <GraphQLPanel
                  objects={state.objects}
                  instanceUrl={state.instanceUrl}
                  apiVersion={state.apiVersion}
                  getToken={() => tokenRef.current}
                  onAddToCollection={requestAddToCollection}
                  onSessionExpired={handleSessionExpired}
                />
              </section>
            </div>

            {/* ── SOQL mode ── */}
            <div hidden={state.mode !== "soql"}>
              <section id="soql" aria-label="SOQL Query Builder" className="scroll-mt-20">
                <SoqlPanel
                  objects={state.objects}
                  instanceUrl={state.instanceUrl}
                  apiVersion={state.apiVersion}
                  getToken={() => tokenRef.current}
                  onSessionExpired={handleSessionExpired}
                />
              </section>
            </div>

            {/* ── Schema deep-dive mode ── */}
            <div hidden={state.mode !== "schema"}>
              <section id="schema" aria-label="Schema Deep Dive" className="scroll-mt-20">
                <SchemaPanel
                  objects={state.objects}
                  instanceUrl={state.instanceUrl}
                  apiVersion={state.apiVersion}
                  getToken={() => tokenRef.current}
                  onSessionExpired={handleSessionExpired}
                />
              </section>
            </div>

            {/* ── REST explorer mode ── */}
            <div hidden={state.mode !== "rest"}>
              <section id="rest" aria-label="REST API Explorer" className="scroll-mt-20">
                <RestExplorerPanel
                  instanceUrl={state.instanceUrl}
                  apiVersion={state.apiVersion}
                  getToken={() => tokenRef.current}
                  onAddToCollection={requestAddToCollection}
                  onSessionExpired={handleSessionExpired}
                />
              </section>
            </div>

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
                      objectName={state.selectedObject.name}
                      objectLabel={state.selectedObject.label}
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
                      description="Pick any standard or custom sObject - or press ⌘K to jump straight to it. Field types, picklists and writability load live from your org."
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
                  onSessionExpired={handleSessionExpired}
                />
              </section>
            )}
          </>
        )}
      </main>

      {/* ── Overlays ── */}
      <SessionExpiredModal
        open={sessionExpired && state.connected}
        instanceUrl={state.instanceUrl}
        onReconnect={() => {
          setSessionExpired(false);
          openConnect();
        }}
        onDisconnect={handleDisconnect}
      />
      {bootShown && (
        <BootLoader
          stage={state.connected ? "objects" : "connect"}
          fading={bootFade}
        />
      )}
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
