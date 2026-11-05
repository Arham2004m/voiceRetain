import { describe, expect, it } from "vitest";
import { VOUCHER_REGEX } from "@voiceretain/shared";
import { generateVoucherCode } from "../vouchers/code-generator";

describe("generateVoucherCode", () => {
  it("generates 1000 codes that match the format and avoid ambiguous characters", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateVoucherCode();
      expect(code).toMatch(VOUCHER_REGEX);
      expect(code.replace("VR-", "")).not.toMatch(/[0O1IL]/);
    }
  });

  it("uses the injected random source", () => {
    expect(generateVoucherCode(() => 0)).toBe("VR-AAAA-AAAA");
  });

  it("is not constant", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateVoucherCode()));
    expect(codes.size).toBeGreaterThan(40);
  });
});
