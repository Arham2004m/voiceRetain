import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CallSummaryDTO, TranscriptTurnDTO } from "@voiceretain/shared";
import { LiveCallPanel } from "../LiveCallPanel";

const call = (over: Partial<CallSummaryDTO> = {}): CallSummaryDTO => ({
  id: "c1",
  cartId: "cart1",
  customerName: "Rohan",
  customerPhone: "9876543210",
  cartTotalPaise: 149900,
  status: "IN_PROGRESS",
  outcome: "PENDING",
  sentiment: null,
  objection: null,
  summary: null,
  durationSec: null,
  startedAt: "2026-11-17T10:00:00.000Z",
  ...over,
});

const turn = (
  id: string,
  speaker: TranscriptTurnDTO["speaker"],
  text: string,
): TranscriptTurnDTO => ({
  id,
  callId: "c1",
  speaker,
  text,
  latencyMs: null,
  createdAt: "2026-11-17T10:00:01.000Z",
});

describe("LiveCallPanel", () => {
  it("says there is no live call, and what to expect", () => {
    render(<LiveCallPanel />);
    expect(screen.getByText("No live call")).toBeInTheDocument();
    expect(screen.getByText(/appear here the moment they ring/i)).toBeInTheDocument();
  });

  it("shows who is on the call and what their cart is worth", () => {
    render(<LiveCallPanel liveCall={{ call: call(), turns: [] }} />);
    expect(screen.getByText("Rohan")).toBeInTheDocument();
    expect(screen.getByText("₹1,499")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("shows the transcript as it grows, in a live region", () => {
    const turns = [turn("1", "AGENT", "Hi Rohan"), turn("2", "CUSTOMER", "Shipping is high")];
    const { rerender } = render(<LiveCallPanel liveCall={{ call: call(), turns }} />);
    const log = screen.getByRole("log", { name: "Live transcript" });
    expect(within(log).getByText("Hi Rohan")).toBeInTheDocument();
    expect(within(log).getByText("Shipping is high")).toBeInTheDocument();

    rerender(
      <LiveCallPanel
        liveCall={{ call: call(), turns: [...turns, turn("3", "AGENT", "I can offer 10 percent")] }}
      />,
    );
    expect(within(log).getByText("I can offer 10 percent")).toBeInTheDocument();
  });

  it("waits for the first words on a ringing call", () => {
    render(<LiveCallPanel liveCall={{ call: call({ status: "RINGING" }), turns: [] }} />);
    expect(screen.getByText("Ringing")).toBeInTheDocument();
    expect(screen.getByText(/waiting for the call to be answered/i)).toBeInTheDocument();
  });

  it("keeps a finished call visible, labelled as the last call with its outcome", () => {
    render(
      <LiveCallPanel
        liveCall={{
          call: call({ status: "ENDED", outcome: "ACCEPTED_OFFER" }),
          turns: [turn("1", "AGENT", "Bye")],
        }}
      />,
    );
    expect(screen.getByText("Last call")).toBeInTheDocument();
    expect(screen.getByText("Accepted offer")).toBeInTheDocument();
    expect(screen.getByText("Bye")).toBeInTheDocument();
  });

  it("links to the full call", () => {
    render(<LiveCallPanel liveCall={{ call: call(), turns: [] }} />);
    expect(screen.getByRole("link", { name: /open call/i })).toHaveAttribute(
      "href",
      "/dashboard/calls/c1",
    );
  });
});
