import { describe, expect, it } from "vitest";
import { skillForPath } from "./skills";

describe("skill routing", () => {
  it("matches longest route prefix with home fallback", () => {
    expect(skillForPath("/system").name).toBe("system");
    expect(skillForPath("/system/flows?x=1").name).toBe("system");
    expect(skillForPath("/json").name).toBe("json");
    expect(skillForPath("/wireframe").name).toBe("wireframe");
    expect(skillForPath("/systemdesign").name).toBe("studio");
    expect(skillForPath("/").name).toBe("studio");
    expect(skillForPath("/unknown/deep").name).toBe("studio");
  });
});
