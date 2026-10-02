"use client";

import { describe, it, expect } from "vitest";
import { buildGroqSampleProject } from "./demo";
import { validateProject } from "./model";
import { compileMapping } from "./mapping";

describe("groq chat sample", () => {
  it("validates and its edge template builds a chat body from the seed", () => {
    const project = buildGroqSampleProject();
    const { project: valid, issues } = validateProject(project);
    expect(issues).toEqual([]);
    expect(valid).not.toBeNull();
    const edge = valid!.connections[0];
    expect(edge.sourceOperationId).toBeTruthy();
    expect(edge.targetOperationId).toBeTruthy();
    expect(edge.mapping?.mode).toBe("template");
    const compiled = compileMapping(
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
});
