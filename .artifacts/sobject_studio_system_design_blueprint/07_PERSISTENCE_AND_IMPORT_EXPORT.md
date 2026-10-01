# 07 — Persistence, Versioning & Portability

Separate project design, environment configuration, secret references, execution records, payload evidence, and deliverables.

Repositories:
SystemDesignProjectRepository, EnvironmentRepository, OperationRepository, WorkflowRepository, HookRepository, ScenarioRepository, RunRepository, PayloadEvidenceRepository.

Use repository interfaces and validate persistence in the existing app runtime. Include migrations, recovery, reload/restart tests, quota handling, and import/export.

Version workflows, hooks, operations, scenarios, and project schema. Runs pin exact versions.

Portable export includes manifest/schema version, systems/interfaces/operations/connections/workflows/hooks (policy permitting), scenarios, safe variables, trace links, and optional redacted summaries.

Exclude tokens, passwords, API keys, cookies, resolved secret values, unredacted payloads unless explicitly authorized, and sensitive connection details not approved for export.

Import validates schema, IDs, references, file sizes, and compatibility; preview errors before commit.
