import { describe, expect, it } from "vitest";
import { buildArtifactIndex, searchArtifacts, type ArtifactSources } from "./artifacts";
import { newExperience, newScreen } from "@/lib/wireframe/model";

function blankMapping(id: string, name: string) {
  return {
    id, name, status: "draft" as const, sourceApi: undefined,
    mappings: [{ id: "r1", sourcePath: "a", objectName: "Lead", fieldName: "Email" }],
    source: undefined, sfSnapshot: undefined, recordPlans: [], relationships: [],
    decisions: [], versions: [], createdAt: "", updatedAt: "",
  } as unknown as import("@/lib/mapping/types").MappingProject;
}

function fixture(): ArtifactSources {
  const exp = newExperience("Portal");
  const s1 = newScreen("Lead form");
  exp.screens = [s1];
  exp.components = [
    { id: "c1", kind: "input", parentId: s1.id, label: "Email", binding: { source: "salesforce", object: "Lead", field: "Email" }, bindingState: "existing", props: {}, oda: { implements: [], consumes: [], emits: [] } },
  ];
  const root = {
    id: "ws1", name: "Accenture", mappingIds: ["m1"], updatedAt: "", createdAt: "",
    experience: {
      screens: [{ id: "x1", name: "Capture", wireframeRef: { experienceId: exp.id, screenId: s1.id }, payloadMappingId: "m1", journeyIds: [], componentIds: [], actionIds: [], bindingIds: [], status: "draft", tags: [], createdAt: "", updatedAt: "", canvas: { sourceWidth: 1, sourceHeight: 1, aspectRatio: 1 } }],
      components: [], annotations: [], actions: [], journeys: [], transitions: [], bindings: [], requirements: [], states: [],
      createdAt: "", updatedAt: "",
    },
  } as unknown as import("@/lib/studio/types").StudioProject;
  const child = blankMapping("m1", "Orders");
  return {
    wireframes: [exp],
    standaloneMappings: [blankMapping("solo", "Solo"), child],
    projects: [{ root, children: [child] }],
    contracts: [{ id: "c1", name: "Lead contract", targetObjectApiName: "Lead" }],
  };
}

describe("buildArtifactIndex", () => {
  it("indexes wireframes, mappings and contracts with backlinks", () => {
    const entries = buildArtifactIndex(fixture());
    const wire = entries.find((e) => e.kind === "wireframe-screen")!;
    expect(wire.usedIn).toEqual(["Accenture"]);
    expect(wire.detail).toContain("1 components");
    // Attached child listed once, under its project - not as standalone.
    const maps = entries.filter((e) => e.kind === "integration-mapping");
    expect(maps.map((m) => m.label).sort()).toEqual(["Accenture / Orders", "Solo"]);
    expect(maps.find((m) => m.label === "Accenture / Orders")!.usedIn).toEqual(["Accenture"]);
    expect(entries.some((e) => e.kind === "contract-profile")).toBe(true);
  });

  it("searches across label, detail and kind", () => {
    const entries = buildArtifactIndex(fixture());
    expect(searchArtifacts(entries, "lead", "all").length).toBeGreaterThanOrEqual(2);
    expect(searchArtifacts(entries, "", "contract-profile").length).toBe(1);
    expect(searchArtifacts(entries, "zzz", "all")).toEqual([]);
  });
});
