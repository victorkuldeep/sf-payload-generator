"use client";

import { newProject, newSystemFromTemplate, SYSTEM_TEMPLATES, type SystemProject } from "./model";

/**
 * Demo topology: Lead lands in Salesforce, flows through middleware into
 * ServiceNow, surfaced by a React app. Explains the product in one glance:
 * place, connect, inspect - then replace with your own systems.
 */
export function buildDemoProject(): SystemProject {
  const project = newProject("Demo: Lead triage flow");
  const by = (type: string) => SYSTEM_TEMPLATES.find((t) => t.systemType === type)!;
  const sf = { ...newSystemFromTemplate(by("salesforce"), { x: 80, y: 200 }, 1), name: "Salesforce CRM", id: "sys_demo_sf" };
  const mw = { ...newSystemFromTemplate(by("middleware"), { x: 460, y: 200 }, 1), name: "Integration Broker", id: "sys_demo_mw" };
  const sn = { ...newSystemFromTemplate(by("servicenow"), { x: 840, y: 80 }, 1), name: "ServiceNow ITSM", id: "sys_demo_sn" };
  const app = { ...newSystemFromTemplate(by("webapp"), { x: 840, y: 330 }, 1), name: "Triage Console", id: "sys_demo_app" };
  const echo = { ...newSystemFromTemplate(by("rest"), { x: 1220, y: 200 }, 1), name: "Echo Service", id: "sys_demo_echo", baseUrl: "https://postman-echo.com" };
  project.systems = [sf, mw, sn, app, echo];
  project.connections = [
    { id: "conn_demo_1", sourceId: sf.id, targetId: mw.id, label: "Lead created event", status: "draft" as const, sourceOperationId: "op_demo_lead" },
    { id: "conn_demo_2", sourceId: mw.id, targetId: sn.id, label: "Create incident", status: "draft" as const },
    { id: "conn_demo_3", sourceId: mw.id, targetId: app.id, label: "Push triage view", status: "draft" as const },
    { id: "conn_demo_4", sourceId: mw.id, targetId: echo.id, label: "Forward event", status: "draft" as const, sourceOperationId: "op_demo_forward", targetOperationId: "op_demo_echo" },
  ];
  // One bound end on purpose: the demo opens showing a partial edge next to
  // draft ones, so readiness states are visible immediately.
  project.interfaces = [
    { id: "iface_demo_sf", systemId: sf.id, name: "REST API", protocol: "REST", basePath: "/services/data/v66.0" },
    { id: "iface_demo_mw", systemId: mw.id, name: "Inbound events", protocol: "Events", basePath: "/events/lead" },
    { id: "iface_demo_echo", systemId: echo.id, name: "Echo API", protocol: "REST", basePath: "" },
  ];
  project.operations = [
    { id: "op_demo_lead", interfaceId: "iface_demo_sf", name: "Lead Created", method: "EVENT", path: "/events/lead", version: "v1" },
    { id: "op_demo_incident", interfaceId: "iface_demo_mw", name: "Create incident", method: "POST", path: "/incidents", version: "v1" },
    { id: "op_demo_forward", interfaceId: "iface_demo_mw", name: "Forward event", method: "POST", path: "/forward", version: "v1", sampleBody: '{"x":"hello"}' },
    { id: "op_demo_echo", interfaceId: "iface_demo_echo", name: "Echo POST", method: "POST", path: "/post", version: "v1" },
  ];
  project.environments = [{ id: "env_demo", name: "Sandbox", baseUrl: "" }];
  project.activeEnvironmentId = "env_demo";
  return project;
}

/**
 * Sample topology: static User Input seed flows 1:1 into GROQ chat
 * completions. Proves the concept end to end - the edge template grabs the
 * seed prompt ({{seed.prompt}}) and builds the chat body, auth arrives via
 * the session vault ($env.GROQ_API_KEY in the run token field). No real keys
 * live in this file - the vault holds them for the tab only.
 */
export function buildGroqSampleProject(): SystemProject {
  const project = newProject("Sample: User input → GROQ chat");
  const by = (type: string) => SYSTEM_TEMPLATES.find((t) => t.systemType === type)!;
  const ui = { ...newSystemFromTemplate(by("custom"), { x: 80, y: 200 }, 1), name: "User Input", id: "sys_groq_ui" };
  const groq = {
    ...newSystemFromTemplate(by("rest"), { x: 520, y: 200 }, 1),
    name: "GROQ", id: "sys_groq_api", baseUrl: "https://api.groq.com",
  };
  project.systems = [ui, groq];
  project.interfaces = [
    { id: "iface_groq_ui", systemId: ui.id, name: "Prompt channel", protocol: "Events", basePath: "/prompt" },
    { id: "iface_groq_api", systemId: groq.id, name: "Chat API", protocol: "REST", basePath: "/openai/v1" },
  ];
  project.operations = [
    {
      id: "op_groq_prompt", interfaceId: "iface_groq_ui", name: "Prompt submitted",
      method: "EVENT", path: "/prompt/submitted", version: "v1",
      sampleBody: '{ "prompt": "Explain Revenue Cloud order-to-cash architecture in 5 bullet points." }',
    },
    {
      id: "op_groq_chat", interfaceId: "iface_groq_api", name: "Chat completions",
      method: "POST", path: "/openai/v1/chat/completions", version: "v1",
      // A vault REFERENCE, not a secret - safe to store and export. Add the
      // real key once under Credentials and every runner resolves it.
      headers: [{ key: "Authorization", value: "Bearer $env.GROQ_API_KEY" }],
    },
  ];
  project.connections = [
    {
      id: "conn_groq_1",
      sourceId: ui.id,
      targetId: groq.id,
      label: "Ask GROQ",
      status: "draft" as const,
      sourceOperationId: "op_groq_prompt",
      targetOperationId: "op_groq_chat",
      mapping: {
        mode: "template" as const,
        template: '{\n  "model": "openai/gpt-oss-20b",\n  "messages": [\n    {\n      "role": "user",\n      "content": {{seed.prompt}}\n    }\n  ],\n  "stream": false\n}',
      },
    },
  ];
  project.environments = [{ id: "env_groq", name: "Production", baseUrl: "https://api.groq.com" }];
  project.activeEnvironmentId = "env_groq";
  project.notes = [
    "## GROQ chat sample (1:1)",
    "",
    "Static prompt in, chat completion out. Run it:",
    "",
    "1. Project bar → Credentials → add `GROQ_API_KEY` = your key (tab session only).",
    "2. Select the edge → Run chain from here.",
    "3. Seed is prefilled from the User Input operation - just run.",
    "",
    "Auth rides on the Chat completions operation as a stored",
    "`Authorization: Bearer $env.GROQ_API_KEY` header (a reference, not a",
    "secret). The edge template grabs `{{seed.prompt}}` and builds the GROQ",
    "body - the same grab-and-map shape scales to Salesforce-vs-ZSP comparisons.",
  ].join("\n");
  return project;
}
