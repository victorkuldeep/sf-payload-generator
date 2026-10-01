# 03 — Core Concepts & Domain Model

## Entities
**SystemNode:** id, projectId, name, systemType, vendor?, description?, environmentRefs[], tags[], position, size, iconKey, metadataRefs[].
**Environment:** id, name, baseUrlOverrides, variableRefs, credentialRefs, policyId, isProduction.
**Interface:** id, systemId, name, protocol, baseUrlRef?, contractRefs[], authProfileRef?, capabilities.
**Operation:** id, interfaceId, name, operationType, method?, path?, inputSchemaRef?, outputSchemaRef?, timeoutMs, retryPolicyRef?, examples[], version.
**Connection:** id, projectId, sourceSystemId, sourceOperationRef?, targetSystemId, targetOperationRef?, label, protocol, mappingRef?, workflowRef?, status, version.
**Workflow:** id, name, version, trigger, entryStepId, steps[], errorPolicy, timeoutMs, status.
**WorkflowStep:** id, type, name, inputMapping, config, nextStepRefs[], errorNextStepRef?, timeoutMs?.
**Hook:** id, name, runtime, code, inputSchemaRef, outputSchemaRef, version, testCases[], permissions.
**Scenario:** id, name, environmentRef, inputPayload, mockOverrides, assertions[], safetyMode, version.
**ExecutionRun:** id, workflowRef/version, scenarioRef, environmentRef, timestamps, status, correlationId, summary.
**StepExecution:** id, runId, stepId, timestamps, durationMs, status, input/output snapshot refs, httpStatus, errorCode, redactionSummary, attempt.
**PayloadSnapshot:** id, runId, stepExecutionId, kind, contentRef, contentType, sizeBytes, redactionState, retentionPolicyRef.
**TraceLink:** typed link between design artifacts and runtime evidence.

## Relationships
Project contains systems, environments, interfaces, operations, connections, workflows, scenarios, hooks, and runs. Systems own interfaces; interfaces own operations. Connections bind system endpoints and may reference mappings/workflows. Workflows contain steps; steps call operations or invoke hooks. Runs contain step executions, which reference payload evidence. Trace links connect design artifacts to runs.

## Typed trace links
implements, reads, writes, calls, mapsTo, dependsOn, satisfies, derivedFrom, supersedes, reviewedBy.

## Rules
Stable IDs independent of labels/positions. Version workflow, hook, operation, scenario, and project schema. Each run pins exact versions. A visual edge is not executable until explicitly configured. Schema and API snapshots are versioned and immutable.
