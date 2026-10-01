# Phase 5 — Hooks & Workflow Orchestration

Outcome: transform JSON and pass it to a subsequent workflow step/API call.
Example: input order → validate → transform hook → ServiceNow call → response mapping → return.
Include versioned workflow graph, typed steps, hook editor/input-output schema, test cases, JSON passing, step trace, stop-on-error.
Require vetted isolated runtime; otherwise ship declarative mapping first and gate JS.
Acceptance: deterministic same-version transform; schema failure stops flow; per-step trace/redaction; versions pinned.
