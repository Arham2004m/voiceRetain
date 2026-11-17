import { describe, expect, it } from "vitest";
import type { VoucherDTO } from "@voiceretain/shared";
import { effectiveVoucherStatus, endReasonLabel, objectionLabel } from "../labels";

describe("labels", () => {
  it("names each objection in plain words", () => {
    expect(objectionLabel("SHIPPING_COST")).toBe("Shipping cost");
    expect(objectionLabel("CHANGED_MIND")).toBe("Changed their mind");
    expect(objectionLabel("NONE")).toBe("None raised");
    expect(objectionLabel(null)).toBe("Not analysed yet");
  });

  it("says how a call ended, and passes unknown reasons through", () => {
    expect(endReasonLabel("CUSTOMER_HANGUP")).toBe("The customer hung up");
    expect(endReasonLabel("LLM_FAILURE")).toBe("The AI had trouble answering");
    expect(endReasonLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(endReasonLabel(null)).toBe("Still going");
  });
});

describe("effectiveVoucherStatus", () => {
  const v = (status: VoucherDTO["status"], expiresAt: string) => ({ status, expiresAt });
  const now = new Date("2026-11-17T12:00:00.000Z");

  it("shows an active code whose time has run out as expired, even though nothing has marked it yet", () => {
    expect(effectiveVoucherStatus(v("ACTIVE", "2026-11-06T10:27:00.000Z"), now)).toBe("EXPIRED");
  });

  it("keeps an active code that is still valid", () => {
    expect(effectiveVoucherStatus(v("ACTIVE", "2026-11-18T10:00:00.000Z"), now)).toBe("ACTIVE");
  });

  it("never rewrites a code that was already redeemed or replaced", () => {
    expect(effectiveVoucherStatus(v("REDEEMED", "2026-11-06T10:27:00.000Z"), now)).toBe("REDEEMED");
    expect(effectiveVoucherStatus(v("SUPERSEDED", "2026-11-06T10:27:00.000Z"), now)).toBe(
      "SUPERSEDED",
    );
  });
});
