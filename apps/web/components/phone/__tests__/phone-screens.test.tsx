import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EndedScreen } from "../EndedScreen";
import { IdleScreen } from "../IdleScreen";
import { RegisterPhone } from "../RegisterPhone";
import { RingingScreen } from "../RingingScreen";

const incoming = {
  callId: "c1",
  customerName: "Rohan",
  cartId: "cart1",
  subtotalPaise: 149900,
  itemCount: 1,
};
const voucher = {
  code: "VR-8KQ2-X7MD",
  percent: 15,
  expiresAt: "2030-01-01T10:30:00.000Z",
  cartId: "cart1",
};

describe("RingingScreen", () => {
  it("shows the caller and the order, with answer and decline", async () => {
    const onAnswer = vi.fn();
    const onDecline = vi.fn();
    render(
      <RingingScreen
        incoming={incoming}
        soundBlocked={false}
        onAnswer={onAnswer}
        onDecline={onDecline}
        onEnableSound={vi.fn()}
      />,
    );
    expect(screen.getByText("ShopNest")).toBeInTheDocument();
    expect(screen.getByText("Rohan's order ₹1,499")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Answer" }));
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(onAnswer).toHaveBeenCalled();
    expect(onDecline).toHaveBeenCalled();
    expect(screen.queryByText("Tap to enable sound")).not.toBeInTheDocument();
  });

  it("offers a tap-to-enable-sound hint when the browser blocks the ringtone", async () => {
    const onEnableSound = vi.fn();
    render(
      <RingingScreen
        incoming={incoming}
        soundBlocked
        onAnswer={vi.fn()}
        onDecline={vi.fn()}
        onEnableSound={onEnableSound}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Tap to enable sound" }));
    expect(onEnableSound).toHaveBeenCalled();
  });
});

describe("IdleScreen", () => {
  it("shows the number being listened on, the connection and a missed call", () => {
    render(<IdleScreen phone="9876543210" connected missedNotice="Missed call from ShopNest" />);
    expect(screen.getByText(/98765 43210/)).toBeInTheDocument();
    expect(screen.getByText("Missed call from ShopNest")).toBeInTheDocument();
  });

  it("says when it is reconnecting", () => {
    render(<IdleScreen phone="9876543210" connected={false} />);
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
  });

  it("keeps the last offer reachable after the call", () => {
    render(<IdleScreen phone="9876543210" connected voucher={voucher} />);
    expect(screen.getByText("VR-8KQ2-X7MD")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Complete my order" })).toHaveAttribute(
      "href",
      "/checkout?cart=cart1&code=VR-8KQ2-X7MD",
    );
  });

  it("shows an error message when there is one", () => {
    render(<IdleScreen phone="9876543210" connected error="Call is no longer ringing" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Call is no longer ringing");
  });
});

describe("EndedScreen", () => {
  it("shows the call length and the voucher, and returns on request", async () => {
    const onDone = vi.fn();
    render(<EndedScreen durationSec={102} voucher={voucher} onDone={onDone} />);
    expect(screen.getByText("Call ended")).toBeInTheDocument();
    expect(screen.getByText("Call lasted 1:42")).toBeInTheDocument();
    expect(screen.getByText("15% off")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("omits the voucher card when none was offered", () => {
    render(<EndedScreen durationSec={5} onDone={vi.fn()} />);
    expect(screen.queryByRole("link", { name: "Complete my order" })).not.toBeInTheDocument();
  });
});

describe("RegisterPhone", () => {
  it("rejects a number that is not a valid Indian mobile", async () => {
    const onRegister = vi.fn();
    render(<RegisterPhone onRegister={onRegister} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Mobile number"), "12345");
    await user.click(screen.getByRole("button", { name: "Register this phone" }));
    expect(screen.getByText(/10-digit mobile number/i)).toBeInTheDocument();
    expect(onRegister).not.toHaveBeenCalled();
  });

  it("registers a clean number", async () => {
    const onRegister = vi.fn();
    render(<RegisterPhone onRegister={onRegister} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Mobile number"), "+91 98765 43210");
    await user.click(screen.getByRole("button", { name: "Register this phone" }));
    expect(onRegister).toHaveBeenCalledWith("9876543210");
  });
});
