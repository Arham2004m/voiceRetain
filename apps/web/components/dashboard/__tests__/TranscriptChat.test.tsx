import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TranscriptTurnDTO } from "@voiceretain/shared";
import { TranscriptChat } from "../TranscriptChat";

const turn = (
  id: string,
  speaker: TranscriptTurnDTO["speaker"],
  text: string,
  latencyMs: number | null = null,
): TranscriptTurnDTO => ({
  id,
  callId: "c1",
  speaker,
  text,
  latencyMs,
  createdAt: "2026-11-17T10:00:00.000Z",
});

const turns = [
  turn("1", "AGENT", "Hi Rohan", 400),
  turn("2", "CUSTOMER", "The shipping was too expensive"),
  turn("3", "AGENT", "I can offer 10 percent", 1840),
  turn("4", "SYSTEM", "Call connected"),
];

const itemFor = (text: string) => screen.getByText(text).closest("li")!;

describe("TranscriptChat", () => {
  it("puts the agent on the left, the customer on the right and system events in the middle", () => {
    render(<TranscriptChat turns={turns} />);
    expect(itemFor("Hi Rohan")).toHaveAttribute("data-speaker", "AGENT");
    expect(itemFor("Hi Rohan").className).toMatch(/self-start/);
    expect(itemFor("The shipping was too expensive")).toHaveAttribute("data-speaker", "CUSTOMER");
    expect(itemFor("The shipping was too expensive").className).toMatch(/self-end/);
    expect(itemFor("Call connected")).toHaveAttribute("data-speaker", "SYSTEM");
    expect(itemFor("Call connected").className).toMatch(/self-center/);
  });

  it("shows how long the agent took under each of its turns", () => {
    render(<TranscriptChat turns={turns} showLatency />);
    expect(screen.getByText("0.4 s")).toBeInTheDocument();
    expect(screen.getByText("1.8 s")).toBeInTheDocument();
  });

  it("shows no latency for the customer or system, or when switched off", () => {
    const { rerender } = render(<TranscriptChat turns={turns} showLatency />);
    expect(screen.getAllByText(/ s$/)).toHaveLength(2);
    rerender(<TranscriptChat turns={turns} />);
    expect(screen.queryByText("0.4 s")).not.toBeInTheDocument();
  });

  it("says so when there is no conversation yet", () => {
    render(<TranscriptChat turns={[]} />);
    expect(screen.getByText("No conversation yet.")).toBeInTheDocument();
  });
});
