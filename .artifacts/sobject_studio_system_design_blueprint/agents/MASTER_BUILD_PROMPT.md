# MASTER BUILD PROMPT — SYSTEM DESIGN FOR sObject Studio

Act as principal product architect, senior React/TypeScript engineer, integration architect, and security-conscious execution-platform engineer.

Build System Design inside the existing sObject Studio. Preserve all existing modules and workflows. This is a major product area, not a replacement.

## Source of truth
Read every file in this artifact bundle, then inspect the actual repository. Reuse existing capabilities only after inspecting their real interfaces. Do not assume remembered descriptions match current code.

## Objective
Build a visual, executable multi-system workbench with:
- Secondary sub-navigation: Canvas, Flow Lab, API Catalog, Transformations, Scenarios, Runs & Observability, Settings.
- Collapsible systems inventory on left.
- Infinite canvas on right.
- Contextual inspector and optional bottom Run Console.
- Systems, interfaces, operations, connections, workflows, hooks, scenarios, runs, traces.
- API-aware connections and controlled test execution.
- JSON-in/JSON-out transformations that feed subsequent steps.
- Observable execution traces, timings, errors, payload evidence.

## First action
Inspect the complete artifact folder and repository. Report stack, structure, graph library, persistence, Salesforce/API boundaries, regression risks, open decisions, and first vertical slice. Then implement the next incomplete milestone; do not stop at planning if implementation is possible.

## Domain rules
SystemNode, Environment, Interface, Operation, Connection, Workflow, WorkflowStep, Hook, Scenario, ExecutionRun, StepExecution, PayloadSnapshot, TraceLink are distinct typed entities. Stable IDs and versions mandatory. Canvas is a view/editor over structured data. Edge is not executable until explicitly configured.

## Hooks
Hook receives JSON and returns JSON. Workflow engine owns sequencing/network/auth/retries/timeouts/tracing. MVP custom JS must be isolated, resource-limited, and have no network/filesystem/secrets/ambient host access. Never run user code in main app. If secure runtime is not validated, implement declarative mapping first and gate JS.

## Security
No secrets in project exports or logs. Use secret refs. Real calls require approved transport, allowlists, SSRF protection, explicit Test environment, redaction, request/response limits, timeout, side-effect warnings. No production execution in MVP. No unsafe retries for non-idempotent methods.

## Build sequence
Follow phases in 09_PHASES_AND_SHIPPING_PLAN.md. Begin with repo inspection and Phase 0/1 as appropriate. Do not make every tab a superficial mock. Preserve current app, add tests with features, document ADRs and assumptions.

## UX
Subnav under main tab; inventory left, canvas center/right, inspector contextual, Run Console optional bottom. Support loading/empty/error/permission/stale/save-failure states and keyboard access. Every control works or is clearly disabled.

## Completion report each task
List implemented behavior, exact files changed, tests/commands and actual results, limitations, security implications, and next task. Never claim untested success or fabricate live data.
