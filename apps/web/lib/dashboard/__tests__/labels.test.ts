import { describe, expect, it } from "vitest";
import { endReasonLabel, objectionLabel } from "../labels";

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
