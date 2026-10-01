# 09 — Phases & End-to-End Shipping Plan

## Phase 0 — Discovery/foundation
Inspect existing repo and artifacts; validate graph library, runtime, persistence, build, API boundary; define domain and ADRs; create sub-app shell.
Ship gate: no regressions in existing tabs; shell works; decisions documented.

## Phase 1 — Visual System Canvas
Subnav, collapsible inventory, predefined/custom nodes, infinite canvas, directed edges, inspector, undo/redo, save/reload/export, demo template.
Gate: create/connect/edit/save/reload/export topology; accessible alternative; no real calls.

## Phase 2 — API-aware topology
Interfaces, operations, manual config, OpenAPI import, environments, schemas/examples, bind operations to edges, readiness indicators.
Gate: exact operation references; missing config visible; no secrets exported.

## Phase 3 — Single API Test Runner
Test mode, safe environment, approved transport, request preview/preflight, response inspector, timeout/destination policy/redaction, run history.
Gate: sandbox call verified; failures accurate; execution context visible.

## Phase 4 — Two-system executable connection
Input → source operation/connection → target API, declarative mapping, validation, edge trace, latency/history.
Gate: repeatable run with pinned versions; mapping failure distinct from HTTP failure; safe retry defaults.

## Phase 5 — Workflow engine and hooks
Typed steps, hook editor and schemas, secure isolated runtime (or declarative mapping fallback), tests/versioning, JSON passing, step trace, stop-on-error.
Gate: input JSON → transform → API call → response mapping → output; runtime limits verified.

## Phase 6 — Branching/resilience
Conditions, branches, error paths, bounded retries/timeouts, idempotency, replay as new run, run comparison/waterfall.
Gate: deterministic branches; unsafe actions require explicit policy; failures localized.

## Phase 7 — Intelligence/deliverables
Gap analysis, contract consistency, AI suggestions with review, sequence diagrams, integration specs, run reports, templates.
Gate: suggestions labeled and validated; provenance and unresolved items in outputs; approved AI policy.

## Phase 8 — Enterprise readiness
Shared workspaces, access controls, approvals, secret management, retention, audit, environment governance, execution service operations.
Gate: security review, access isolation, audit tests, support/incident process.

## Release process
Feature spec → domain/API contract → threat/side-effect review → UX/accessibility → implementation → tests → sandbox E2E → import/export compatibility → performance/payload checks → docs/known issues → owner review → release notes/rollback → deploy → post-release smoke test.
