import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CallSummaryDTO, DashboardMetrics } from "@voiceretain/shared";
import { CallsTable } from "../CallsTable";
import { MetricsTally, RecoveryHeadline } from "../MetricsTally";
import { RevenueChart } from "../RevenueChart";
import { SentimentBreakdown } from "../SentimentBreakdown";

const metrics = (over: Partial<DashboardMetrics> = {}): DashboardMetrics => ({
  abandonedCarts: 2,
  callsPlaced: 3,
  answerRate: 2 / 3,
  recoveredCarts: 1,
  recoveryRate: 0.5,
  revenueRecoveredPaise: 144810,
  avgLatencyMs: 1840,
  sentiment: { POSITIVE: 2, NEUTRAL: 1, NEGATIVE: 1 },
  last7Days: [],
  ...over,
});

describe("RecoveryHeadline", () => {
  it("says how much came back and from how many carts", () => {
    render(<RecoveryHeadline metrics={metrics()} />);
    expect(screen.getByRole("heading")).toHaveTextContent(
      "₹1,448.10 recovered from 1 of 2 abandoned carts.",
    );
  });

  it("is honest when nothing has been recovered yet", () => {
    render(<RecoveryHeadline metrics={metrics({ recoveredCarts: 0, revenueRecoveredPaise: 0 })} />);
    expect(screen.getByRole("heading")).toHaveTextContent(
      "Nothing recovered yet. 2 carts abandoned so far.",
    );
  });

  it("handles a quiet day", () => {
    render(
      <RecoveryHeadline
        metrics={metrics({ abandonedCarts: 0, recoveredCarts: 0, revenueRecoveredPaise: 0 })}
      />,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("No abandoned carts yet.");
  });

  it("uses the singular for one cart", () => {
    render(<RecoveryHeadline metrics={metrics({ abandonedCarts: 1 })} />);
    expect(screen.getByRole("heading")).toHaveTextContent("1 of 1 abandoned cart.");
  });
});

describe("MetricsTally", () => {
  it("lists every figure with a plain label", () => {
    render(<MetricsTally metrics={metrics()} />);
    const value = (label: string) =>
      screen.getByText(label).closest("div")!.querySelector("dd")!.textContent;
    expect(value("Carts abandoned")).toBe("2");
    expect(value("Calls placed")).toBe("3");
    expect(value("Answer rate")).toBe("67%");
    expect(value("Carts recovered")).toBe("1");
    expect(value("Recovery rate")).toBe("50%");
    expect(value("Revenue recovered")).toBe("₹1,448.10");
    expect(value("Agent reply time")).toBe("1.8 s");
  });

  it("shows a dash for reply time before the agent has spoken", () => {
    render(<MetricsTally metrics={metrics({ avgLatencyMs: null })} />);
    expect(
      screen.getByText("Agent reply time").closest("div")!.querySelector("dd"),
    ).toHaveTextContent("—");
  });
});

describe("SentimentBreakdown", () => {
  it("sizes each segment by its share and labels it with the count", () => {
    render(<SentimentBreakdown sentiment={{ POSITIVE: 2, NEUTRAL: 1, NEGATIVE: 1 }} />);
    const segment = (s: string) => document.querySelector(`[data-sentiment="${s}"]`) as HTMLElement;
    expect(segment("POSITIVE").style.width).toBe("50%");
    expect(segment("NEUTRAL").style.width).toBe("25%");
    expect(segment("NEGATIVE").style.width).toBe("25%");
    expect(screen.getByText("Positive")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("says so when no call has been analysed", () => {
    render(<SentimentBreakdown sentiment={{ POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 }} />);
    expect(screen.getByText("No analysed calls yet.")).toBeInTheDocument();
  });
});

describe("RevenueChart", () => {
  const days = [
    { date: "2026-11-11", revenueRecoveredPaise: 0 },
    { date: "2026-11-12", revenueRecoveredPaise: 50000 },
    { date: "2026-11-13", revenueRecoveredPaise: 0 },
    { date: "2026-11-14", revenueRecoveredPaise: 0 },
    { date: "2026-11-15", revenueRecoveredPaise: 0 },
    { date: "2026-11-16", revenueRecoveredPaise: 0 },
    { date: "2026-11-17", revenueRecoveredPaise: 144810 },
  ];

  it("offers the same figures as a table for screen readers", () => {
    render(<RevenueChart days={days} />);
    const table = screen.getByRole("table", { name: "Revenue recovered, last 7 days" });
    expect(table).toBeInTheDocument();
    expect(screen.getByText("₹1,448.10")).toBeInTheDocument();
    expect(screen.getByText("₹500")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
  });

  it("says when nothing was recovered in the week", () => {
    render(<RevenueChart days={days.map((d) => ({ ...d, revenueRecoveredPaise: 0 }))} />);
    expect(screen.getByText("Nothing recovered in the last 7 days.")).toBeInTheDocument();
  });
});

describe("CallsTable", () => {
  const call = (over: Partial<CallSummaryDTO> = {}): CallSummaryDTO => ({
    id: "c1",
    cartId: "cart1",
    customerName: "Rohan Mehta",
    customerPhone: "9876543210",
    cartTotalPaise: 149900,
    status: "ENDED",
    outcome: "RECOVERED",
    sentiment: "POSITIVE",
    objection: "SHIPPING_COST",
    summary: null,
    durationSec: 102,
    startedAt: "2026-11-17T10:00:00.000Z",
    ...over,
  });

  it("shows each call's customer, cart, outcome, sentiment and length", () => {
    render(<CallsTable calls={[call()]} />);
    const row = screen.getByText("Rohan Mehta").closest("tr")!;
    expect(row).toHaveTextContent("98765 43210");
    expect(row).toHaveTextContent("₹1,499");
    expect(row).toHaveTextContent("Ended");
    expect(row).toHaveTextContent("Recovered");
    expect(row).toHaveTextContent("Positive");
    expect(row).toHaveTextContent("1:42");
  });

  it("links each customer to the call", () => {
    render(<CallsTable calls={[call()]} />);
    expect(screen.getByRole("link", { name: /Rohan Mehta/ })).toHaveAttribute(
      "href",
      "/dashboard/calls/c1",
    );
  });

  it("shows dashes where a call has no sentiment or length yet", () => {
    render(
      <CallsTable
        calls={[
          call({ sentiment: null, durationSec: null, status: "RINGING", outcome: "PENDING" }),
        ]}
      />,
    );
    const row = screen.getByText("Rohan Mehta").closest("tr")!;
    expect(row).toHaveTextContent("Ringing");
    expect(row.querySelectorAll("td")[4]).toHaveTextContent("—");
  });

  it("explains an empty list", () => {
    render(<CallsTable calls={[]} />);
    expect(screen.getByText("No calls yet.")).toBeInTheDocument();
  });
});
