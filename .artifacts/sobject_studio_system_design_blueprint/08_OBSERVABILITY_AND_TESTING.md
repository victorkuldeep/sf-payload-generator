# 08 — Observability, Evidence & Testing

Capture run/correlation IDs, project/workflow/version, environment and execution location, timestamps/duration, step order/branch, safe target host, HTTP and assertion outcomes, retries/timeouts/errors, hook version, redaction and retention metadata.

Timing labels:
- Client-to-execution-service time (if applicable).
- Execution-service request duration.
- Per-step duration.
- Total workflow duration.
Never call synthetic test timings production latency or SLA metrics.

Canvas shows active/success/failure/blocked states accessibly. Edge selection opens trace and payload. Provide timeline/waterfall, run comparison, payload JSON/raw, schema validation, redaction indicators, diffs, and explicit truncation for large bodies.

Tests:
- Unit: graph validation, hook behavior, URL policy, redaction, version pinning.
- Component: drag/drop, selection, inspector, branches, payload and trace views.
- Integration: provider/transport, repository migrations, import/export, mock/real adapters.
- E2E: create project → add systems → configure ops → connect → scenario → mock flow → inspect trace → export/import → confirm no secrets.
CI never targets production.
