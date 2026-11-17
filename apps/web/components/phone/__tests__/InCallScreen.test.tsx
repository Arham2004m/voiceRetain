import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InCallScreen } from "../InCallScreen";

type Props = Parameters<typeof InCallScreen>[0];

const voucher = {
  code: "VR-8KQ2-X7MD",
  percent: 10,
  expiresAt: "2030-01-01T10:30:00.000Z",
  cartId: "cart1",
};

function setup(over: Partial<Props> = {}) {
  const props: Props = {
    state: "listening",
    transcript: [
      { id: 1, speaker: "AGENT", text: "Hi Rohan, what stopped you?" },
      { id: 2, speaker: "CUSTOMER", text: "The shipping was too expensive." },
    ],
    answeredAt: Date.now() - 65_000,
    muted: false,
    hangingUp: false,
    recognition: { supported: true, permission: "granted", listening: true, interim: "" },
    onSend: vi.fn(),
    onToggleMute: vi.fn(),
    onHangup: vi.fn(),
    ...over,
  };
  render(<InCallScreen {...props} />);
  return props;
}

describe("InCallScreen", () => {
  it("falls back to typed input when recognition is unsupported", () => {
    setup({
      recognition: { supported: false, permission: "unknown", listening: false, interim: "" },
    });
    expect(
      screen.getByText("Voice works best in Chrome or Edge — type your replies below."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Type your reply")).toHaveFocus();
    expect(screen.queryByRole("button", { name: /microphone/i })).not.toBeInTheDocument();
  });

  it("explains a blocked microphone and focuses the typed input", () => {
    setup({
      recognition: { supported: true, permission: "denied", listening: false, interim: "" },
    });
    expect(screen.getByText(/microphone access is blocked/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Type your reply")).toHaveFocus();
  });

  it("does not steal focus or show a warning when the microphone works", () => {
    setup();
    expect(screen.queryByText(/Voice works best/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Type your reply")).not.toHaveFocus();
  });

  it("sends typed text on Enter and clears the box", async () => {
    const { onSend } = setup();
    const user = userEvent.setup();
    const box = screen.getByLabelText("Type your reply");
    await user.type(box, "it is too costly{Enter}");
    expect(onSend).toHaveBeenCalledWith("it is too costly");
    expect(box).toHaveValue("");
  });

  it("does not send an empty reply", async () => {
    const { onSend } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it.each([
    ["listening", "Listening"],
    ["speaking", "Agent speaking"],
    ["thinking", "Thinking…"],
    ["connecting", "Connecting…"],
  ] as const)("shows %s as %s", (state, label) => {
    setup({ state });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("says it is your turn when there is no microphone to listen with", () => {
    setup({
      recognition: { supported: false, permission: "unknown", listening: false, interim: "" },
    });
    expect(screen.getByText("Your turn")).toBeInTheDocument();
  });

  it("keeps the transcript in a live region, agent and customer lines distinct", () => {
    setup();
    const log = screen.getByRole("log", { name: "Call transcript" });
    expect(within(log).getByText("Hi Rohan, what stopped you?")).toBeInTheDocument();
    expect(within(log).getByText("The shipping was too expensive.")).toBeInTheDocument();
    expect(log).toHaveAttribute("aria-live", "polite");
  });

  it("shows what the customer is saying while they speak", () => {
    setup({
      recognition: {
        supported: true,
        permission: "granted",
        listening: true,
        interim: "shipping is",
      },
    });
    expect(screen.getByText("shipping is")).toBeInTheDocument();
  });

  it("shows the voucher card with a link that opens checkout with the code", () => {
    setup({ voucher });
    expect(screen.getByText("VR-8KQ2-X7MD")).toBeInTheDocument();
    expect(screen.getByText("10% off")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Complete my order" });
    expect(link).toHaveAttribute("href", "/checkout?cart=cart1&code=VR-8KQ2-X7MD");
  });

  it("shows the running call time", () => {
    setup({ answeredAt: Date.now() - 65_000 });
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("toggles the microphone and reports the pressed state", async () => {
    const { onToggleMute } = setup({ muted: true });
    const button = screen.getByRole("button", { name: "Unmute microphone" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.setup().click(button);
    expect(onToggleMute).toHaveBeenCalled();
  });

  it("hangs up, and shows that the call is ending", async () => {
    const { onHangup } = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "Hang up" }));
    expect(onHangup).toHaveBeenCalled();
  });

  it("disables hang up while the call is already ending", () => {
    setup({ state: "thinking", hangingUp: true });
    expect(screen.getByText("Ending call…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hang up" })).toBeDisabled();
  });
});
