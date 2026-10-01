# 04 — Execution Engine & JavaScript Hooks

## Hook concept
A hook receives declared JSON input and returns declared JSON output. The workflow engine owns sequencing, network calls, credentials, retries, timeouts, and trace recording.

MVP logical signature:
```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type HookContext = { runId: string; stepId: string; executionMode: "test" };
type HookFunction = (input: JsonValue, context: HookContext) => JsonValue;
```

Example:
```js
function transformOrder(input) {
  return {
    externalOrderNumber: input.orderNumber,
    requestedFor: input.contact?.email ?? null,
    items: (input.items ?? []).map(item => ({
      sku: item.productCode,
      quantity: Number(item.quantity)
    }))
  };
}
```

## Hook constraints
- JSON in/JSON out; validate input/output against declared schemas.
- Prefer pure synchronous functions initially.
- No network, filesystem, process, environment, secret, dynamic import, browser globals, or host app access.
- Enforce time, memory, recursion, and output-size limits.
- Never execute untrusted code in main UI context.
- Vetted isolated runtime required; if unavailable, ship declarative mapping first and gate JS.
- Version hooks; provide test cases, preview, syntax/runtime/schema errors.

## Workflow steps
httpCall, transform, validate, condition, setVariable, mock, return; event actions only when explicitly supported.
Validate entry point, references, branch destinations, contracts, and cycles before run. Reject cycles in MVP unless bounded loops are designed.

## Execution
1. Pin workflow, hook, operation, scenario, environment versions.
2. Check environment policy and destination allowlist.
3. Validate input; create run/correlation ID.
4. Execute steps; record timing, status, redacted inputs/outputs, errors.
5. For HTTP, resolve endpoint from approved environment and operation; resolve secret reference only at runtime.
6. For transform, invoke isolated hook.
7. Validate outputs and route next step.
8. Stop on completion, cancellation, timeout, or policy block.
9. Persist run summary and trace; render on canvas/console.

## HTTP and failure rules
Configure method/path, headers via secret refs, body mapping, timeout, bounded retry, expected statuses, response mapping. Never retry non-idempotent calls by default. Replay creates a new run. Distinguish validation, auth, network, timeout, HTTP, hook, schema, policy, and cancellation outcomes.
