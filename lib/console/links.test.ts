import { describe, expect, it } from "vitest";
import { consoleLinkHref } from "./model";

describe("console link hrefs", () => {
  it("jumps every linked surface to its studio tab", () => {
    expect(consoleLinkHref({ surface: "system" })).toBe("/system");
    expect(consoleLinkHref({ surface: "wireframe" })).toBe("/wireframe");
    expect(consoleLinkHref({ surface: "sequence" })).toBe("/sequence");
    expect(consoleLinkHref({ surface: "draw" })).toBe("/draw");
    expect(consoleLinkHref({ surface: "schema" })).toBe("/");
    expect(consoleLinkHref({ surface: "decision" })).toBe("/decisions");
  });
});
