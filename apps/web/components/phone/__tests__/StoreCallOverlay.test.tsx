import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreCallOverlay } from "../StoreCallOverlay";
import { writePhone } from "@/lib/phone/registry";

const call = {
  state: "idle",
  incoming: undefined as unknown,
  transcript: [],
  voucher: undefined,
  ended: undefined,
  muted: false,
  hangingUp: false,
  soundBlocked: false,
  missedNotice: undefined as string | undefined,
  error: undefined,
  connected: true,
  answeredAt: null,
  speaking: false,
  recognition: { supported: true, permission: "granted", listening: true, interim: "" },
  answer: vi.fn(),
  decline: vi.fn(),
  hangup: vi.fn(),
  sendText: vi.fn(),
  toggleMute: vi.fn(),
  dismissEnded: vi.fn(),
  enableSound: vi.fn(),
  clearError: vi.fn(),
};
const usePhoneCall = vi.fn((phone: string | null) => {
  void phone;
  return call;
});
vi.mock("@/lib/phone/usePhoneCall", () => ({
  usePhoneCall: (phone: string | null) => usePhoneCall(phone),
}));

beforeEach(() => {
  window.localStorage.clear();
  writePhone(null);
  usePhoneCall.mockClear();
  Object.assign(call, { state: "idle", incoming: undefined, missedNotice: undefined });
});

describe("StoreCallOverlay", () => {
  it("listens on the number given at checkout, with no registration step", () => {
    writePhone("9876543210");
    render(<StoreCallOverlay />);
    expect(usePhoneCall).toHaveBeenLastCalledWith("9876543210");
  });

  it("stays out of the way while nothing is happening", () => {
    writePhone("9876543210");
    const { container } = render(<StoreCallOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it("rings on whatever store page the shopper is on, and can be answered", async () => {
    writePhone("9876543210");
    Object.assign(call, {
      state: "ringing",
      incoming: { callId: "c1", customerName: "Rohan", cartTotalPaise: 149900 },
    });
    render(<StoreCallOverlay />);
    await userEvent.click(screen.getByRole("button", { name: /answer/i }));
    expect(call.answer).toHaveBeenCalled();
  });

  it("shows a missed call as a small note the shopper can read", () => {
    writePhone("9876543210");
    Object.assign(call, { state: "idle", missedNotice: "Missed call from ShopNest" });
    render(<StoreCallOverlay />);
    expect(screen.getByRole("status")).toHaveTextContent("Missed call from ShopNest");
  });

  it("puts the call in the tab title while it rings", () => {
    writePhone("9876543210");
    document.title = "ShopNest";
    Object.assign(call, {
      state: "ringing",
      incoming: { callId: "c1", customerName: "Rohan", cartTotalPaise: 149900 },
    });
    const { unmount } = render(<StoreCallOverlay />);
    expect(document.title).toMatch(/calling/i);
    unmount();
    expect(document.title).toBe("ShopNest");
  });
});
