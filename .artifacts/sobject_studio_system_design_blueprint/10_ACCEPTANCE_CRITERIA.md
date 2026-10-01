# 10 — Acceptance Criteria

## Canvas
- Inventory collapsible/searchable; templates/custom systems draggable.
- Nodes selectable/movable/duplicable/removable with undo.
- Directed connections editable and labeled.
- Persistence survives reload; inspector works; demo clearly labeled.
- Accessible alternative to canvas exists.

## API
- Operations grouped by system/interface; manual config and contract import.
- Schemas/examples visible; environment/auth refs explicit.
- Readiness accurate and provenance visible.

## Execution
- Design/Mock/Test unmistakable.
- Only approved destinations; preflight shows target/method/environment/side effects.
- Timeouts/size limits; secrets not persisted/exported.
- HTTP and assertion/schema outcomes distinct.
- Runs and step traces retained per policy.

## Hooks/workflows
- Input/output JSON schemas declared and validated.
- Code isolated, constrained, no ambient network/filesystem/secrets.
- Step-to-step JSON passing works.
- Invalid references/cycles/unsupported steps rejected pre-run.
- Runs pin workflow/hook/operation/scenario/environment versions.

## Observability
- Per-step and total timing accurately labeled.
- Node/edge state accessible.
- Redaction visible; failures identify step/category.
- Run comparison checks version compatibility.

## Integration
- Existing sObject Studio modules remain functional.
- Shared schema/API references use stable contracts.
- No conflicting duplicate metadata models.
