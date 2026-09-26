"use client";

import type { ReactNode } from "react";
import { AppHeader, type NavMode } from "./AppHeader";
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
  onNavigate: (mode: NavMode) => void;
  activeMode: NavMode;
  collectionCount: number;
  onCollectionClick: () => void;
  /** Builder progress trail — docked above the footer, null on home/schema. */
  trail?: ReactNode;
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
  activeMode,
  collectionCount,
  onCollectionClick,
  trail,
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
        activeMode={activeMode}
        collectionCount={collectionCount}
        onCollectionClick={onCollectionClick}
      />
      <div className="flex-1 flex flex-col" id="main-content">
        {children}
      </div>
      <AppFooter trail={trail} />
    </div>
  );
}
