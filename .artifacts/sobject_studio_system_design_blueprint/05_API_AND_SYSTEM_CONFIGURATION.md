# 05 — Systems, APIs & Configuration

## Templates
Salesforce, ServiceNow, Middleware/Integration Platform, React/Web App, REST API, GraphQL API, Relational Database, Event Broker/Queue, External SaaS, Custom System.
Templates provide neutral starter metadata and icons, not verified connectivity or vendor endorsement.

## Operation configuration
Name/description, protocol/type, method/path, environment base URL reference, headers, query parameters, auth profile reference, request/response schemas and examples, timeout, retry policy, expected status, owner/tags/version/provenance.

## Environments
Named contexts such as Local, Dev, QA, UAT, Sandbox, Production. Store non-secret variables, base URL overrides, destination allowlist, runtime policy, and credential references. User explicitly selects environment before real execution. Production disabled by default in initial rollout.

## API catalog
Browse by system/interface; search operation/method/path/tag; import OpenAPI and preserve original; allow manual definitions; link operations to connections and workflow steps; distinguish configured from verified/tested.

## Execution transport
Use a transport abstraction. Real calls may require a controlled backend due to CORS, secret isolation, private network reachability, and policy enforcement. Show execution location/network context. Do not assume browser direct calls are appropriate.
