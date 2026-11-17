import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CallsTable } from "../CallsTable";
import { TableSkeleton } from "../TableSkeleton";
import { VoucherTable } from "../VoucherTable";
import { InCallScreen } from "@/components/phone/InCallScreen";

describe("TableSkeleton", () => {
  it("stands in for a table while it loads, and says so to screen readers", () => {
    render(<TableSkeleton rows={4} label="Loading calls" />);
    const status = screen.getByRole("status", { name: "Loading calls" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status.querySelectorAll("[data-skeleton-row]")).toHaveLength(4);
  });

  it("defaults to five rows", () => {
    render(<TableSkeleton label="Loading" />);
    expect(document.querySelectorAll("[data-skeleton-row]")).toHaveLength(5);
  });
});

describe("empty states", () => {
  it("tell the merchant what to do next, not just that nothing is there", () => {
    render(
      <CallsTable
        calls={[]}
        emptyHint="Start a checkout and leave the store, or ring the phone from the Demo page."
      />,
    );
    expect(screen.getByText("No calls yet.")).toBeInTheDocument();
    expect(screen.getByText(/ring the phone from the Demo page/i)).toBeInTheDocument();
  });

  it("do the same for vouchers", () => {
    render(
      <VoucherTable vouchers={[]} emptyHint="Codes appear when the agent offers a discount." />,
    );
    expect(screen.getByText("No discount codes yet.")).toBeInTheDocument();
    expect(screen.getByText(/when the agent offers a discount/i)).toBeInTheDocument();
  });
});

describe("InCallScreen connection light", () => {
  const props = {
    state: "listening" as const,
    transcript: [],
    answeredAt: Date.now(),
    muted: false,
    hangingUp: false,
    recognition: { supported: true, permission: "granted" as const, listening: true, interim: "" },
    onSend: () => undefined,
    onToggleMute: () => undefined,
    onHangup: () => undefined,
  };

  it("says nothing while the connection is fine", () => {
    render(<InCallScreen {...props} />);
    expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument();
  });

  it("shows voice bars that follow who is talking", () => {
    const { rerender, container } = render(<InCallScreen {...props} state="speaking" />);
    expect(container.querySelector("[data-voice-bars]")).toHaveAttribute(
      "data-voice-bars",
      "agent",
    );
    rerender(<InCallScreen {...props} state="listening" />);
    expect(container.querySelector("[data-voice-bars]")).toHaveAttribute("data-voice-bars", "you");
    rerender(<InCallScreen {...props} state="thinking" />);
    expect(container.querySelector("[data-voice-bars]")).toHaveAttribute("data-voice-bars", "idle");
  });

  it("explains a speech-recognition failure instead of staying silent", () => {
    render(
      <InCallScreen
        {...props}
        recognition={{ ...props.recognition, error: "network" }}
      />,
    );
    expect(screen.getByText(/speech service/i)).toBeInTheDocument();
  });

  it("warns when the connection drops, so a silent agent is explained", () => {
    render(<InCallScreen {...props} connected={false} />);
    expect(screen.getByRole("status")).toHaveTextContent(/reconnecting/i);
  });
});
