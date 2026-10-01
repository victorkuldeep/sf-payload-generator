# 06 — Security & Runtime Guardrails

Treat endpoints, headers, payloads, imported contracts, and user code as untrusted.

Mandatory:
- No secrets in project JSON, local exports, screenshots, logs, or snippets.
- Secret references resolved only at runtime through approved mechanism.
- Destination allowlist and DNS/IP validation at execution boundary.
- Block localhost, link-local, metadata-service, and private/internal ranges unless explicitly approved through a controlled connector.
- Protect against SSRF, redirects to blocked destinations, DNS rebinding, and proxy surprises.
- Request/response size limits and timeouts.
- Redact auth headers, cookies, tokens, passwords, PII, configured sensitive paths.
- Default to no payload body retention until policy is configured.
- Project/environment/credential/run access control and audit.
- Validate imports and safely render content.
- No arbitrary JS in main app context.

Modes:
**Design:** no calls.
**Mock:** deterministic mock only.
**Test:** real calls only to approved test destinations/environments.
**Production:** out of MVP; future governance review, grants, confirmation, audit.

Preflight shows environment, host, method, possible side effects, retry behavior, retention/redaction. Transport status and schema/assertion status are separate.
