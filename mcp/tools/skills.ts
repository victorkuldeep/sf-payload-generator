import { z } from "zod";
import type { McpTool } from "./types";

/**
 * Skill packs: opinionated GRAVENX playbooks per surface. Agents read the
 * pack BEFORE calling that surface's tools so plans follow studio
 * conventions (naming, validation order, what the Import buttons accept).
 * Start with skill_list, then skill_read for the surfaces in play.
 */

const SKILLS: Record<string, { when: string; body: string }> = {
  mapping: {
    when: "Screen/payload source -> Salesforce target field mapping.",
    body: [
      "# Mapping skill",
      ``,
      "1. `mapping_create` first (sourceSystem + sourceApi set the lineage header).",
      "2. `mapping_add_plan` per target object: one plan per sObject + intent (create/update/upsert).",
      "   Use sourcePath `$.lines[]` for collections, empty for the root record; matchKey for upserts.",
      "3. `mapping_add_rule` per field: attach `plan` by name. Kinds: direct (same value),",
      "   hardcoded (constant via value), excluded (explicitly out of scope), enum (value map).",
      "4. Enum rules become needs-decision automatically - resolve them with the architect, don't guess maps.",
      "5. `mapping_validate` after every batch of rules. `mapping_spec` is the dev/JIRA handoff.",
      "6. Import the file via Mapping Studio Import; structural validation here mirrors that import.",
      "Pitfalls: plan names must match exactly; unknown plans fail closed. Live field-name truth",
      "comes from the paired tab (`erd_live_discover`), not from memory - verify custom __c names there.",
    ].join("\n"),
  },
  builder: {
    when: "Single REST payloads and multi-request Composite batches.",
    body: [
      "# Builder skill",
      ``,
      "1. `payload_build` for one call: method + object + fields -> runnable URL + JSON body.",
      "   PATCH/DELETE/GET require recordId. Save with `save: true` to replay later.",
      "2. `composite_create` for batches (max 25 subrequests, allOrNone default true).",
      "3. `composite_add_request` in dependency order. Link with {apiName, from: referenceId, property}",
      "   to emit `@{ref.id}` references - the referenced request MUST exist first.",
      "4. `composite_validate` checks structure (dup refs, PATCH-without-id, method rules).",
      "   Org required-field checks need the live tab - flag them, don't invent values.",
      "5. `composite_payload` emits the exact Composite JSON + execution order. Paste into the REST runner.",
      "Pitfalls: referenceIds are batch-scoped and must match [A-Za-z][A-Za-z0-9_]*; unknown `from` fails the whole add.",
    ].join("\n"),
  },
  contracts: {
    when: "Consumer <-> Salesforce API contracts.",
    body: [
      "# Contracts skill",
      ``,
      "1. `contract_create` needs name + targetObject + consumer (who calls this - required).",
      "2. `contract_add_field` per field: apiName + operations (POST/PATCH) + ownership + transform.",
      "   external defaults to the api name; set it when the consumer renames the field.",
      "3. integrationRequired=true marks business-required beyond Salesforce metadata.",
      "4. `contract_validate` runs the studio import validator. `contract_spec` is the review handoff.",
      "Pitfalls: operationIds must be identifiers (auto-generated); DELETE is not a contract operation here.",
    ].join("\n"),
  },
  notes: {
    when: "Design notes, workshop capture, meeting records.",
    body: [
      "# Notes skill",
      ``,
      "1. `note_create` with Markdown body; `note_append` adds timestamped sections (separator automatic).",
      "2. Bodies paste straight into the studio Notes tab - keep headings + bullets, no HTML.",
      "3. One note per topic; link related decisions by mentioning their ADR numbers in text.",
      "Pitfalls: 20KB per write - split long workshops across appends.",
    ].join("\n"),
  },
  "system-import": {
    when: "Postman Collection -> system topology.",
    body: [
      "# System import skill",
      ``,
      "1. `system_import_postman` takes the collection JSON (or a workspace file). One system per",
      "   top-level folder, one operation per request, draft edges in collection order.",
      "2. Types are guessed from host (salesforce/servicenow/middleware/queue/rest) - correct them on canvas.",
      "3. Draft edges are ORDER GUESSES, never asserted flows. Confirm, rewire, or delete each one.",
      "4. Auth headers and cookies are DROPPED on import and counted - never ask for them, never re-add secrets.",
      "5. Cap: 200 requests / 500KB - split big collections by folder first.",
      "6. Open the file via System Design Import; `system_summarize` inventories it headlessly.",
    ].join("\n"),
  },
  governance: {
    when: "Decisions, requirements, traceability, JIRA drafts.",
    body: [
      "# Governance skill",
      ``,
      "1. `decision_create` auto-numbers (ADR-001...). Move along the legal trail only:",
      "   proposed -> in-review -> accepted; accepted -> deprecated/superseded. Illegal jumps fail.",
      "2. `decision_link` binds a decision to what it governs (system/wireframe/sequence/draw/schema).",
      "3. `requirement_create` auto-numbers (REQ-001...); trail is open -> covered -> verified.",
      "4. `requirement_link` with surface=decision builds requirement->decision traceability.",
      "5. `decision_summarize` is the review digest: counts, open items, accepted governance.",
      "6. `jira_draft` turns open decisions + requirements (+ a mapping's open items) into an",
      "   acceptance-criteria story, saved as a note. Paste into JIRA - never invent coverage.",
      "Pitfalls: history is append-only; updates re-validate through the studio importer.",
    ].join("\n"),
  },
  "erd-live": {
    when: "Driving the open ERD tab through the bridge (paired tab required).",
    body: [
      "# ERD live skill",
      ``,
      "1. Pair first: the hub prints a code + pair link; the tab dials it (Setup > Terminal Bridge).",
      "2. Reads are free: `erd_live_snapshot` (canvas truth), `erd_live_objects` (browse org schema),",
      "   `erd_live_discover` (parents/children via the tab session - an org call, needs approval unless auto mode).",
      "3. Writes (`place/hide/remove/tags/focus/mode/filter/author_*`) pause for architect approval",
      "   unless auto mode is on. Pairing IS the authorization - say so, don't re-ask per command.",
      "4. Refs are fuzzy: exact api name wins, then label, then single substring; ambiguity errors list",
      "   candidates - ask the architect to pick, never place both.",
      "5. Custom objects MUST come from schema browse/discover - never invent __c names.",
      "6. `arch.activity` reads the tab's mutation audit trail for reviews and JIRA drafts.",
      "Pitfalls: removing the canvas root is refused; removing a tag assignment is not deleting the tag",
      "(`tags delete` removes it everywhere). Root cause of 'ack but nothing changed' is always stale ctx - snapshot first.",
    ].join("\n"),
  },
  "system-live": {
    when: "Driving the open System Design tab through the bridge (paired tab required).",
    body: [
      "# System live skill",
      ``,
      "1. `system_live_new` starts a blank project from scratch when nothing is open - then snapshot/place/connect.",
      "2. `system_live_snapshot` is canvas truth: systems with types/positions, connections with status.",
      "3. `system_live_place` by type (salesforce, middleware, queue, ...) - max 10 per call, names optional.",
      "4. `system_live_connect` draws DRAFT edges by system name. Drafts are proposals - the architect",
      "   confirms topology on canvas. Never present a draft edge as an asserted integration.",
      "5. `system_live_remove` drops systems and their dangling connections.",
      "6. Pair with `system_import_postman`: import the collection, snapshot it, then rewire the drafts",
      "   into the real topology with the architect.",
      "7. `system_live_rebalance` tidies the canvas into a readable flow when the architect drags things around.",
      "Pitfalls: names resolve exactly-then-substring; ambiguity errors list candidates. Start blank with `system_live_new` when nothing is open.",
    ].join("\n"),
  },
  activity: {
    when: "Reading the org-mutation audit trail and turning it into JIRA work.",
    body: [
      "# Activity skill",
      ``,
      "1. `activity_live_list` reads Arch Activity from the paired tab: who deployed/edited what,",
      "   when, and whether it worked. Filter by actor (architect/agent-bridge) or category (metadata/data).",
      "2. Summarize risk: failed deploys, agent-bridge actions the architect hasn't reviewed, PROD-hour changes.",
      "3. Draft follow-ups with `jira_draft` (file side) citing the activity entries as evidence.",
      "4. Canvas curation (place/hide/remove/tags) is intentionally absent - snapshots cover it, not the trail.",
      "Pitfalls: the trail lives in the tab's IndexedDB - no paired tab means no activity. Export MD from",
      "Setup > Arch Activity for offline reviews.",
    ].join("\n"),
  },
};

export function listSkills(): { name: string; when: string }[] {
  return Object.entries(SKILLS).map(([name, s]) => ({ name, when: s.when }));
}

export function readSkill(name: string): string {
  const key = name.trim().toLowerCase();
  const hit = SKILLS[key];
  if (!hit) {
    throw new Error(`Unknown skill "${name}". Available: ${Object.keys(SKILLS).join(", ")}.`);
  }
  return hit.body;
}

export const skillTools: McpTool[] = [
  {
    name: "skill_list",
    description: "List GRAVENX skill packs (mapping, builder, contracts, notes, system-import, governance, erd-live, system-live, activity). Read the relevant pack before planning work on that surface.",
    shape: {},
    run: async () => ({ ok: true, summary: `${Object.keys(SKILLS).length} skill packs.`, data: { skills: listSkills() } }),
  },
  {
    name: "skill_read",
    description: "Read one skill pack: conventions, tool order, pitfalls for that surface.",
    shape: { name: z.string().min(1).max(40) },
    run: async (_dir, args) => {
      try {
        const body = readSkill(args.name as string);
        return { ok: true, summary: `Skill "${(args.name as string).trim().toLowerCase()}".`, data: { markdown: body } };
      } catch (e) {
        return { ok: false, summary: "Unknown skill.", error: e instanceof Error ? e.message : "Unknown skill." };
      }
    },
  },
];
