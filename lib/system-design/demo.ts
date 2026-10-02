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
