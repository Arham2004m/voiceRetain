import { describe, expect, it } from "vitest";
import { isValidIndianMobile, normalizePhone, maskPhone } from "../index";

describe("phone utils", () => {
  it("normalizes +91 with separators", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
  });
  it("strips a leading 0", () => expect(normalizePhone("09876543210")).toBe("9876543210"));
  it("rejects short numbers", () => expect(normalizePhone("12345")).toBeNull());
  it("validates mobile prefix", () => {
    expect(isValidIndianMobile("9876543210")).toBe(true);
    expect(isValidIndianMobile("5876543210")).toBe(false);
    expect(isValidIndianMobile("987654321")).toBe(false);
  });
  it("masks phones", () => expect(maskPhone("9876543210")).toBe("98******10"));
});
