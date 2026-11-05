import { describe, expect, it } from "vitest";
import { decideOutcome, type OutcomeInput } from "../calls/outcome";

const base: OutcomeInput = {
  status: "ENDED",
  answered: true,
  declinedWhileRinging: false,
  voucherIssued: false,
  orderPlaced: false,
};

describe("decideOutcome (PRD §7.3, evaluated top to bottom)", () => {
  it("unanswered within the ring timeout → NO_ANSWER", () => {
    expect(decideOutcome({ ...base, status: "MISSED", answered: false })).toBe("NO_ANSWER");
  });

  it("declined while ringing → DECLINED", () => {
    expect(decideOutcome({ ...base, answered: false, declinedWhileRinging: true })).toBe(
      "DECLINED",
    );
  });

  it("an order placed for the cart → RECOVERED, overriding everything else", () => {
    expect(
      decideOutcome({ ...base, orderPlaced: true, intent: "DECLINED", voucherIssued: false }),
    ).toBe("RECOVERED");
  });

  it("intent WILL_PURCHASE → ACCEPTED_OFFER even without a voucher", () => {
    expect(decideOutcome({ ...base, intent: "WILL_PURCHASE" })).toBe("ACCEPTED_OFFER");
  });

  it("voucher issued with intent UNDECIDED → ACCEPTED_OFFER", () => {
    expect(decideOutcome({ ...base, voucherIssued: true, intent: "UNDECIDED" })).toBe(
      "ACCEPTED_OFFER",
    );
  });

  it("voucher issued but intent DECLINED → DECLINED", () => {
    expect(decideOutcome({ ...base, voucherIssued: true, intent: "DECLINED" })).toBe("DECLINED");
  });

  it("intent DECLINED without a voucher → DECLINED", () => {
    expect(decideOutcome({ ...base, intent: "DECLINED" })).toBe("DECLINED");
  });

  it("intent UNDECIDED without a voucher → UNDECIDED", () => {
    expect(decideOutcome({ ...base, intent: "UNDECIDED" })).toBe("UNDECIDED");
  });

  it("no analysis and no voucher → UNDECIDED", () => {
    expect(decideOutcome(base)).toBe("UNDECIDED");
  });
});
