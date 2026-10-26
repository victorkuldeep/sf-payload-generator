import { describe, expect, it } from "vitest";
import { listSkills, readSkill } from "./skills";

describe("skill packs", () => {
  it("lists every pack with guidance", () => {
    const skills = listSkills();
    expect(skills.map((s) => s.name).sort()).toEqual(
      ["activity", "builder", "contracts", "erd-live", "governance", "mapping", "notes", "system-import", "system-live"].sort()
    );
    for (const s of skills) expect(s.when.length).toBeGreaterThan(10);
  });

  it("reads packs case-insensitively and rejects unknown names", () => {
    expect(readSkill("Mapping")).toContain("mapping_add_rule");
    expect(readSkill("erd-live")).toContain("arch.activity");
    expect(() => readSkill("teleport")).toThrow(/Available/);
  });
});
