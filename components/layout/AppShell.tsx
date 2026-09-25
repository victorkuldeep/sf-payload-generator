"use client";

import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";

interface AppShellProps {
  children: ReactNode;
  connected: boolean;
  instanceUrl: string;
  apiVersion: string;
  objectCount: number;
  connecting: boolean;
  onConnectClick: () => void;
  onDisconnect: () => void;
  onSearchClick: () => void;
  onNavigate: (mode: "builder" | "composite" | "graphql" | "schema") => void;
  collectionCount: number;
  onCollectionClick: () => void;
}

export function AppShell({
  children,
  connected,
  instanceUrl,
  apiVersion,
  objectCount,
  connecting,
  onConnectClick,
  onDisconnect,
  onSearchClick,
  onNavigate,
  collectionCount,
  onCollectionClick,
}: AppShellProps) {
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader
        connected={connected}
        instanceUrl={instanceUrl}
        apiVersion={apiVersion}
        objectCount={objectCount}
        connecting={connecting}
        onConnectClick={onConnectClick}
        onDisconnect={onDisconnect}
        onSearchClick={onSearchClick}
        onNavigate={onNavigate}
        collectionCount={collectionCount}
        onCollectionClick={onCollectionClick}
      />
      <div className="flex-1 flex flex-col" id="main-content">
        {children}
      </div>
      <AppFooter />
    </div>
  );
}
