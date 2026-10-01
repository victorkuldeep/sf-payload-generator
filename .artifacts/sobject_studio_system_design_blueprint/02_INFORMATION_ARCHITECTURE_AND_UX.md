# 02 — Information Architecture & UX

## Placement
System Design is a major main tab in sObject Studio with its own sub-application. Do not restructure unrelated tabs.

## Layout
- Secondary sub-navigation directly under main tab.
- Left: collapsible Systems Inventory.
- Center/right: infinite canvas.
- Right: contextual inspector drawer.
- Optional bottom: Run Console / Trace Timeline.
- On tablet, inventory/inspector become drawers; complex canvas editing is desktop-first.

## Secondary navigation
Canvas | Flow Lab | API Catalog | Transformations | Scenarios | Runs & Observability | Settings

## Systems Inventory
Categories: Salesforce/CRM, Middleware, Service Management, Web/Mobile, Database, API Gateway, Event Broker/Queue, External SaaS, Custom.
Features: search, filters, drag-to-canvas, add button, configure defaults, duplicate, labels, descriptions, owners, environment tags, favorites.
Use bundled, license-reviewed icons or neutral glyphs. Do not imply vendor endorsement.

## Canvas
Infinite pan/zoom, fit, minimap, grid, alignment, select/multi-select, move, duplicate, delete/undo, directed connectors, labels, context menu, readiness and run states. Provide keyboard-accessible selection and an equivalent list view.

## Inspector
System: identity/type/environment/interfaces.
Interface: protocol/base URL reference/auth/operations.
Operation: method/path/schemas/headers/timeouts/retries/examples.
Connection: source/target/operation bindings/mapping/workflow.
Hook: input/output schemas/code/version/tests.
Run: timeline/payloads/status/timing/errors/redaction.

## Run Console
Status, step timeline, input/output, HTTP status, duration, validation/assertion outcomes, retries, errors, correlation IDs, export.

## Visual design
Premium technical workbench consistent with existing sObject Studio styling. Optimize legibility, accessible status, clear live/imported/draft provenance, and high-density inspectors. Avoid decorative UI that competes with architecture.
