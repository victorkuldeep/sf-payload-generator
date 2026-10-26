#!/usr/bin/env tsx
/**
 * gravenx-mcp: headless GRAVENX over MCP (stdio).
 *
 * Terminal agents (Cursor, Claude Code, Muse, Codex, OpenCode) connect to
 * this server and operate the studio's domain models through files:
 * sequences, wireframe experiences, system projects, ERD canvases,
 * decisions, requirements and console tasks. The studio Import buttons open
 * every file this server writes - the file workspace is the contract.
 *
 * Nothing here touches the network except erd_share_canvas (explicit,
 * opt-in, posts a structure to YOUR running studio). No tokens, no org
 * calls, no secrets in files - ever.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveWorkspace } from "./workspace";
import { sequenceTools } from "./tools/sequence";
import { wireframeTools } from "./tools/wireframe";
import { systemTools } from "./tools/system";
import { erdTools } from "./tools/erd";
import { governanceTools } from "./tools/governance";
import type { McpTool } from "./tools/types";

const VERSION = "1.0.0";

const ALL_TOOLS: McpTool[] = [
  ...sequenceTools,
  ...wireframeTools,
  ...systemTools,
  ...erdTools,
  ...governanceTools,
];

async function main(): Promise<void> {
  const dir = resolveWorkspace();
  const server = new McpServer({ name: "gravenx", version: VERSION });

  for (const tool of ALL_TOOLS) {
    server.tool(tool.name, tool.description, tool.shape, async (args) => {
      try {
        const result = await tool.run(dir, args as Record<string, unknown>);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          isError: result.ok ? false : true,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Tool failed.";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: false, summary: "Tool failed.", error: message }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(`[gravenx-mcp] fatal: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
