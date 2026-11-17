import { describe, expect, it } from "vitest";
import * as shared from "../index";

describe("shared package", () => {
  it("exports a module object", () => {
    expect(typeof shared).toBe("object");
  });
});
