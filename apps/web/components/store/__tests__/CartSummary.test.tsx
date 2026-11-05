import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CartSummary } from "../CartSummary";

describe("CartSummary", () => {
  it("adds shipping below the free-delivery threshold", () => {
    render(<CartSummary subtotalPaise={149900} />);
    expect(screen.getByText("₹1,499")).toBeInTheDocument();
    expect(screen.getByText("₹99")).toBeInTheDocument();
    expect(screen.getByText("₹1,598")).toBeInTheDocument();
  });

  it("shows Free shipping from ₹2,000 up", () => {
    render(<CartSummary subtotalPaise={250000} />);
    expect(screen.getByText("Free")).toBeInTheDocument();
    // With free shipping the subtotal and the total are the same figure.
    expect(screen.getAllByText("₹2,500")).toHaveLength(2);
    expect(screen.queryByText("₹99")).not.toBeInTheDocument();
  });

  it("treats exactly ₹2,000 as free shipping", () => {
    render(<CartSummary subtotalPaise={200000} />);
    expect(screen.getByText("Free")).toBeInTheDocument();
  });

  it("shows a voucher as its own line and takes it off the total", () => {
    render(<CartSummary subtotalPaise={149900} percent={10} code="VR-8KQ2-X7MD" />);
    expect(screen.getByText(/10% off/)).toBeInTheDocument();
    expect(screen.getByText("VR-8KQ2-X7MD", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("−₹149.90")).toBeInTheDocument();
    expect(screen.getByText("₹1,448.10")).toBeInTheDocument();
  });

  it("names the total for assistive tech", () => {
    render(<CartSummary subtotalPaise={149900} />);
    const total = screen.getByRole("group", { name: /total/i });
    expect(within(total).getByText("₹1,598")).toBeInTheDocument();
  });

  it("tells shoppers how far they are from free delivery", () => {
    render(<CartSummary subtotalPaise={149900} />);
    expect(screen.getByText(/add ₹501 more for free delivery/i)).toBeInTheDocument();
  });
});
