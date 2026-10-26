# gravenx-mcp — headless GRAVENX for terminal agents

`mcp/server.ts` is a local **stdio MCP server** that lets Cursor, Claude Code,
Muse, Codex and OpenCode operate the studio's domain models through files:
sequences, wireframe experiences, system projects, ERD canvases, decisions,
requirements and console tasks. It reuses the exact `lib/` validators the
studio UI uses, so anything the agent writes the studio can open.

**Direction of travel:** MCP sits between the terminal agent and GRAVENX.
The agent authors `gravenx-workspace/*.json`; the architect opens them with
the studio **Import** buttons. No Ask-AI detour, no API keys in the loop.

## Setup

Replace `<REPO_ROOT>` with this repo's absolute path (keep it on one line).

**Cursor** — copy `mcp/clients/cursor-mcp.json` to `<REPO_ROOT>/.cursor/mcp.json`
(or merge the `gravenx` entry into the existing file), then restart Cursor.

**Claude Code** — copy `mcp/clients/claude-mcp.json` to
`<REPO_ROOT>/.mcp.json`, or register imperatively:

```sh
cd <REPO_ROOT>
claude mcp add --transport stdio gravenx \
  --env GRAVENX_WORKSPACE=<REPO_ROOT>/gravenx-workspace \
  -- npx tsx mcp/server.ts
```

**Muse** — same shape as Claude Code:

```sh
cd <REPO_ROOT>
muse mcp add --transport stdio gravenx \
  --env GRAVENX_WORKSPACE=<REPO_ROOT>/gravenx-workspace \
  -- npx tsx mcp/server.ts
```

**OpenCode** — merge `mcp/clients/opencode.json` into your `opencode.json`.

**Codex CLI** — add to `~/.codex/config.toml`:

```toml
[mcp_servers.gravenx]
command = "npx"
args = ["tsx", "mcp/server.ts"]
cwd = "<REPO_ROOT>"
env = { GRAVENX_WORKSPACE = "<REPO_ROOT>/gravenx-workspace" }
```

Run the server directly any time with `npm run mcp`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `GRAVENX_WORKSPACE` | `<cwd>/gravenx-workspace` | Where record files live (gitignored) |
| `GRAVENX_BASE_URL` | `http://localhost:3000` | Studio origin, used only by `erd_share_canvas` |

## Tool catalog

| Tool | What it does |
|---|---|
| `sequence_parse` | Validate interaction DSL, no file written |
| `sequence_create` | DSL → studio package file (sync/async, loop, condition, parallel, retry, note) |
| `sequence_mermaid` | Stored sequence → Mermaid `sequenceDiagram` text |
| `sequence_validate` / `sequence_list` | Studio-grade schema check / inventory |
| `wireframe_create` | Empty experience package file |
| `wireframe_add_screen` | Add a screen card |
| `wireframe_add_component` | Add palette component, optional Salesforce binding (`sffield`, `sflookup`, `sfpicklist`, …) |
| `wireframe_get` / `wireframe_validate` / `wireframe_spec` / `wireframe_list` | Read, check, emit the AI build spec, inventory |
| `system_create_sample` | Starter topology: `demo`, `tmf`, `groq`, `fanout`, `revenue`, `cdc`, `retry` |
| `system_validate` / `system_summarize` / `system_list` | Import-grade check / inventory / list |
| `erd_create_canvas` | Objects + root → auto-gridded structure file |
| `erd_validate` / `erd_list` | Backend-grade check / inventory |
| `erd_share_canvas` | POST the structure to your running studio, get a 30-min link (opt-in network) |
| `decision_create` / `decision_list` | ADR records, auto-numbered, studio-importable |
| `requirement_create` / `requirement_list` | REQ records, auto-numbered, studio-importable |
| `console_create_task` / `console_list_tasks` | Console queue entries (task/note/question/decision) |
| `workspace_files` | Every file + envelope type |

## Demo script (MD showcase)

1. `npm run mcp` in one terminal (or connect your agent first).
2. Ask the agent: *"Create a sequence for order-to-fulfillment: Salesforce
   creates the order in Middleware, Middleware fans out to ServiceNow and
   updates Salesforce, with a retry around the billing call."*
3. The agent writes `gravenx-workspace/sequence-<slug>.json`.
4. Sequence Studio → **Import** → the file renders as a live diagram.
5. Ask for Mermaid (`sequence_mermaid`) and paste it into the review doc.

Same loop works for wireframes (`wireframe_*` → Wireframe Studio Import),
topologies (`system_create_sample` → System Import), canvases
(`erd_share_canvas` → link), and governance (`decision_create` → Import).

## Security posture (V1, by design)

- Files only. The server reads/writes the workspace dir and nothing else.
- No Salesforce tokens, no org calls, no secrets in files — ever. Prompts
  that look like tokens are not executed anywhere; there is no executor.
- `erd_share_canvas` is the single network call: an explicit POST of an
  org-independent structure to an origin **you** configure. Everything else
  is offline.
- Overwrites are refused unless the caller passes `overwrite: true`, and
  ambiguous refs resolve to an error naming every match, never a guess.

## Troubleshooting

- *"tsx: command not found"* — run from the repo root so `npx` finds the
  local dev dependency, or `npm i -D tsx` if it was pruned.
- *"Share backend unreachable"* — start the studio (`npm run dev`) or set
  `GRAVENX_BASE_URL` to the deployed origin (shares need a live backend).
- *Client shows no tools* — restart the client after adding the config;
  most clients only read MCP servers at launch.
