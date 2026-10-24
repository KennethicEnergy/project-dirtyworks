import { describe, expect, it } from "vitest";
import { PROJECT_NAME } from "../src/index";

describe("@dirtyworks/shared", () => {
  it("exposes the project name used in UI copy and logs", () => {
    expect(PROJECT_NAME).toBe("project-dirtyworks");
  });
});
