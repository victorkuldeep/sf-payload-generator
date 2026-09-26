"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader, type NavMode } from "@/components/layout/AppHeader";
import { listCollectionItems } from "@/lib/collection/db";

interface SessionView {
  connected: boolean;
  instanceUrl: string;
  apiVersion: string;
}

const OFFLINE: SessionView = { connected: false, instanceUrl: "", apiVersion: "" };

/**
 * Shared AppHeader on the JSON route, bridged to the tab-scoped session.
 * JSON Studio works offline; connection display stays truthful, connect
 * and collection actions route home where those flows live.
 */
export function JsonHeader() {
  const router = useRouter();
  const [session, setSession] = useState<SessionView>(OFFLINE);
  const [collectionCount, setCollectionCount] = useState(0);

  useEffect(() => {
    const read = () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem("sf_session") ?? "null") as {
          instanceUrl?: string;
          token?: string;
          apiVersion?: string;
        } | null;
        if (saved?.token && saved?.instanceUrl) {
          setSession({
            connected: true,
            instanceUrl: saved.instanceUrl,
            apiVersion: saved.apiVersion ?? "",
          });
        } else {
          setSession(OFFLINE);
        }
      } catch {
        setSession(OFFLINE);
      }
      listCollectionItems()
        .then((items) => setCollectionCount(items.length))
        .catch(() => setCollectionCount(0));
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
    };
  }, []);

  const handleNavigate = useCallback(
    (mode: NavMode) => {
      router.push(mode === "home" ? "/" : `/?mode=${mode === "builder" ? "single" : mode}`);
    },
    [router]
  );

  const handleDisconnect = useCallback(() => {
    try {
      sessionStorage.removeItem("sf_session");
    } catch {
      /* storage unavailable */
    }
    setSession(OFFLINE);
  }, []);

  return (
    <AppHeader
      connected={session.connected}
      instanceUrl={session.instanceUrl}
      apiVersion={session.apiVersion}
      objectCount={0}
      connecting={false}
      onConnectClick={() => router.push("/")}
      onDisconnect={handleDisconnect}
      onSearchClick={() => router.push("/")}
      onNavigate={handleNavigate}
      hideSearch
      collectionCount={collectionCount}
      onCollectionClick={() => router.push("/")}
    />
  );
}
