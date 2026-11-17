import { describe, expect, it } from "vitest";
import {
  VOUCHER_REGEX,
  VOUCHER_ALPHABET,
  toSpokenCode,
  DISCOUNT_TIERS,
  HARD_MAX_DISCOUNT,
} from "../index";

describe("voucher format", () => {
  it("matches valid codes", () => expect(VOUCHER_REGEX.test("VR-8KQ2-X7MD")).toBe(true));
  it("rejects ambiguous characters", () => {
    expect(VOUCHER_REGEX.test("VR-0KQ2-X7MD")).toBe(false);
    expect(VOUCHER_REGEX.test("VR-8KQ2-X7ML")).toBe(false);
  });
  it("alphabet excludes 0 O 1 I L", () => {
    for (const c of "0O1IL") expect(VOUCHER_ALPHABET).not.toContain(c);
  });
  it("spells codes for TTS", () =>
    expect(toSpokenCode("VR-8KQ2-X7MD")).toBe("V R, 8 K Q 2, X 7 M D"));
  it("tiers and cap", () => {
    expect([...DISCOUNT_TIERS]).toEqual([5, 10, 15]);
    expect(HARD_MAX_DISCOUNT).toBe(15);
  });
});
