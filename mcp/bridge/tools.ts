import { z } from "zod";
import type { BridgeHub } from "./hub.js";
import type { McpTool } from "../tools/types.js";

/**
 * Live ERD tools: forward to the paired studio tab through the bridge hub
 * instead of writing files. Reads return immediately; writes pause for the
 * architect's in-tab approval (the tool waits, then relays allow/deny).
 * No tab connected -> every tool fails with pairing instructions.
 */

function live(
  hub: BridgeHub,
  name: string,
  description: string,
  shape: McpTool["shape"],
  command: string,
  pickArgs: (args: Record<string, unknown>) => Record<string, unknown> = (a) => a,
  timeoutMs = 120000,
): McpTool {
  return {
    name,
    description,
    shape,
    run: async (_dir, args) => {
      try {
        const res = await hub.call(command, pickArgs(args), timeoutMs);
        if (!res.ok) {
          return {
            ok: false,
            summary: res.denied ? "Denied by the architect in the studio tab." : "Studio tab reported failure.",
            error: typeof res.error === "string" ? res.error : "Bridge call failed.",
            data: res.data,
          };
        }
        return { ok: true, summary: "Studio tab executed the command.", data: res.data };
      } catch (e) {
        return {
          ok: false,
          summary: "Bridge call failed.",
          error: e instanceof Error ? e.message : "Bridge call failed.",
        };
      }
    },
  };
}

export function liveTools(hub: BridgeHub): McpTool[] {
  const str = (label: string, max = 255) => z.string().min(1).max(max).describe(label);
  return [
    live(hub, "bridge_status", "Bridge state: listening port, pairing code, whether a studio tab is connected.", {}, "bridge.ping", () => ({}), 15000),
    live(hub, "erd_live_snapshot", "Read the live canvas: nodes on canvas, focus object, view mode, active filters.", {}, "erd.snapshot", () => ({}), 30000),
    live(
      hub, "erd_live_discover", "Ask the live org (via the tab session) for parents/children of an object - relationships only, nothing placed yet.",
      { apiName: str("Object api name"), direction: z.enum(["parents", "children", "both"]).default("both") },
      "erd.discover",
    ),
    live(
      hub, "erd_live_place", "Describe and drop objects onto the live canvas (asks approval in the tab).",
      { apiNames: z.array(z.string().min(1).max(255)).min(1).max(25) },
      "erd.place",
    ),
    live(
      hub, "erd_live_focus", "Center the live canvas on an object already placed.",
      { apiName: str("Object api name") },
      "erd.focus", undefined, 30000,
    ),
    live(
      hub, "erd_live_mode", "Switch the live canvas between ERD and graph views.",
      { mode: z.enum(["erd", "graph"]) },
      "erd.mode", undefined, 30000,
    ),
    live(
      hub, "erd_live_filter", "Change live canvas filters (e.g. hideSystem true/false).",
      { hideSystem: z.boolean().optional() },
      "erd.filter", undefined, 30000,
    ),
    live(
      hub, "erd_live_author_field", "Create a field on the live canvas via Author mode - travels the exact approval + PROD guardrail flow; needs architect approval in the tab.",
      {
        childApi: str("Parent object api name"),
        apiName: str("New field api name"),
        label: z.string().max(120).optional(),
        type: z.string().max(60).optional(),
      },
      "erd.author_field",
    ),
    live(
      hub, "erd_live_author_object", "Create an object from the live canvas via Author mode - same approval + PROD flow as the UI.",
      { apiName: str("New object api name"), label: z.string().max(120).optional() },
      "erd.author_object",
    ),
  ];
}
