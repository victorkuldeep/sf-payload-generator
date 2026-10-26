"use client";

/**
 * Agent bridge protocol v1 - the contract between a terminal agent (via the
 * local gravenx-mcp bridge) and an open GRAVENX tab.
 *
 * Transport: WebSocket, tab dials ws://127.0.0.1:PORT (localhost only).
 * Auth: one pairing exchange, then every message carries the session id.
 * Approval: mutating commands pause tab-side for the architect's explicit
 * ConfirmDialog - unless bridge auto mode is on (pairing authorizes the
 * session; every write stays audited). The agent only ever sees a delayed
 * result or a denial.
 *
 * KEEP IN SYNC with bridge/protocol.ts in the gravenx-mcp repo.
 * Bump BRIDGE_PROTOCOL_V on any wire change; mismatches fail loudly.
 */

export const BRIDGE_PROTOCOL_V = 1;

/** Commands the tab understands. Reads are free; writes need approval. */
export const BRIDGE_READS = ["bridge.ping", "erd.snapshot", "erd.objects"] as const;
export const BRIDGE_WRITES = [
  "erd.discover",
  "erd.place",
  "erd.focus",
  "erd.hide",
  "erd.remove",
  "erd.tags",
  "erd.mode",
  "erd.filter",
  "erd.author_field",
  "erd.author_object",
] as const;

export type BridgeCommandKind =
  | (typeof BRIDGE_READS)[number]
  | (typeof BRIDGE_WRITES)[number];

export interface BridgeCall {
  v: number;
  id: string;
  type: "call";
  session: string;
  command: string;
  args: Record<string, unknown>;
}

export interface BridgeResult {
  v: number;
  id: string;
  type: "result";
  ok: boolean;
  data?: unknown;
  error?: string;
  denied?: boolean;
}

export interface BridgeHello {
  v: number;
  type: "hello";
  code: string;
  tab: string;
}

export interface BridgeWelcome {
  v: number;
  type: "welcome";
  session: string;
}

export function isWriteCommand(command: string): boolean {
  return (BRIDGE_WRITES as readonly string[]).includes(command);
}

/** Human line for the approval modal + audit trail. */
export function describeCommand(command: string, args: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : "?");
  switch (command) {
    case "erd.discover":
      return `Discover ${str(args.direction) ?? "related"} objects for ${str(args.apiName)}`;
    case "erd.place":
      return `Place on canvas: ${str(args.apiNames)}`;
    case "erd.focus":
      return `Focus canvas on ${str(args.apiName)}`;
    case "erd.hide":
      return `${args.hide === false ? "Show" : "Hide"} on canvas: ${str(args.apiNames)}`;
    case "erd.remove":
      return `Remove from canvas: ${str(args.apiNames)}`;
    case "erd.tags":
      return `Tag action ${str(args.action) || "list"}${args.tag ? `: ${str(args.tag)}` : ""}`;
    case "erd.mode":
      return `Switch canvas to ${str(args.mode)} view`;
    case "erd.filter":
      return "Change canvas filters";
    case "erd.author_field":
      return `Author field ${str(args.childApi)}.${str(args.apiName)} (${str(args.type)})`;
    case "erd.author_object":
      return `Author object ${str(args.apiName)}`;
    case "erd.snapshot":
      return "Read canvas snapshot";
    case "erd.objects":
      return "Search org objects (schema browse)";
    case "bridge.ping":
      return "Ping bridge";
    default:
      return `Unknown command ${command}`;
  }
}
