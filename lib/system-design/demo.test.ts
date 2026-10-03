"use client";

import { describe, it, expect } from "vitest";
import { buildGroqSampleProject, buildTmfSampleProject } from "./demo";
import { validateProject } from "./model";
import { compileMapping } from "./mapping";
import { resolveChain } from "./chain";

describe("groq chat sample", () => {
  it("validates and its edge template builds a chat body from the seed", () => {
    const project = buildGroqSampleProject();
    const { project: valid, issues } = validateProject(project);
    expect(issues).toEqual([]);
    expect(valid).not.toBeNull();
    const edge = valid!.connections[0];
    expect(edge.sourceOperationId).toBeTruthy();
    expect(edge.targetOperationId).toBeTruthy();
    expect(edge.mapping?.mode).toBe("template");    const compiled = compileMapping(
      "template",
      edge.mapping!.template,
      '{ "prompt": "Say hi in five words." }',
      { seed: '{ "prompt": "Say hi in five words." }' }
    );
    expect(compiled.ok).toBe(true);
    expect(JSON.parse(compiled.body)).toEqual({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "Say hi in five words." }],
      stream: false,
    });
  });

  it("keeps auth as a vault ref for token prefill and prefills the seed", () => {
    const project = buildGroqSampleProject();
    const chat = project.operations.find((o) => o.id === "op_groq_chat");
    expect(chat?.headers).toEqual([{ key: "Authorization", value: "Bearer $env.GROQ_API_KEY" }]);
    const prompt = project.operations.find((o) => o.id === "op_groq_prompt");
    expect(prompt?.sampleBody).toContain("order-to-cash");
    const { issues } = validateProject(JSON.parse(JSON.stringify(project)));
    expect(issues).toEqual([]);
  });
});

describe("tmf order-flow sample", () => {
  it("validates, fans into two lanes, and wraps the order as a TMF688 event", () => {
    const project = buildTmfSampleProject();
    const { project: valid, issues } = validateProject(JSON.parse(JSON.stringify(project)));
    expect(issues).toEqual([]);
    expect(valid).not.toBeNull();
    const lanes = resolveChain(valid!, "conn_tmf_1");
    expect(lanes.length).toBe(1);
    expect(lanes[0].edges.map((e) => e.id)).toEqual(["conn_tmf_1", "conn_tmf_3"]);
    const lanes2 = resolveChain(valid!, "conn_tmf_2");
    expect(lanes2.length).toBe(1);
    const wrap = valid!.connections.find((c) => c.id === "conn_tmf_2");
    const compiled = compileMapping(
      "template",
      wrap!.mapping!.template,
      '{"id":"00000238","status":"Created"}',
      {}
    );
    expect(compiled.ok).toBe(true);
    expect(JSON.parse(compiled.body)).toEqual({
      event: { productOrder: { id: "00000238", status: "Created" } },
    });
    const replay = valid!.connections.find((c) => c.id === "conn_tmf_3");
    expect(replay!.mapping!.template).toBe("{{request}}");
  });

  it("keeps hub auth as a vault ref", () => {
    const project = buildTmfSampleProject();
    const fwd = project.operations.find((o) => o.id === "op_tmf_fwd");
    expect(fwd?.method).toBe("POST");
    expect(fwd?.headers).toEqual([{ key: "Authorization", value: "Bearer $env.HUB_TOKEN" }]);
    const get = project.operations.find((o) => o.id === "op_tmf_get");
    expect(get?.method).toBe("GET");
  });
});
