import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallSummaryDTO, SearchResults, VoucherDTO } from "@voiceretain/shared";
import { api } from "@/lib/api";
import { GlobalSearch } from "../GlobalSearch";

vi.mock("@/lib/api", () => ({ api: { search: vi.fn() } }));
const search = vi.mocked(api.search);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const call = (id: string): CallSummaryDTO => ({
  id,
  cartId: "cart1",
  customerName: "Rohan Mehta",
  customerPhone: "9876543210",
  cartTotalPaise: 149900,
  status: "ENDED",
  outcome: "ACCEPTED_OFFER",
  sentiment: "POSITIVE",
  objection: "SHIPPING_COST",
  summary: "Customer raised shipping cost.",
  durationSec: 44,
  startedAt: "2026-11-17T10:00:00.000Z",
});

const voucher = (over: Partial<VoucherDTO> = {}): VoucherDTO => ({
  id: "v1",
  code: "VR-8KQ2-X7MD",
  percent: 10,
  status: "ACTIVE",
  cartId: "cart1",
  callId: "c9",
  expiresAt: "2026-11-18T10:00:00.000Z",
  redeemedAt: null,
  createdAt: "2026-11-17T10:00:00.000Z",
  ...over,
});

const results: SearchResults = {
  customers: [{ id: "u1", name: "Rohan Mehta", phone: "9876543210" }],
  calls: [call("c9")],
  vouchers: [voucher()],
};

// Real timers: Testing Library's async helpers wait on real timers, which Vitest's fake timers
// freeze. The 300 ms pause is short enough to just wait out.
function setup() {
  const user = userEvent.setup();
  render(<GlobalSearch />);
  return {
    user,
    box: screen.getByRole("combobox", { name: "Search customers, calls and vouchers" }),
  };
}

beforeEach(() => {
  search.mockReset().mockResolvedValue(results);
});

describe("GlobalSearch", () => {
  it("waits for a pause in typing, then searches once", async () => {
    const { user, box } = setup();
    await user.type(box, "rohan");
    expect(search).not.toHaveBeenCalled();
    await sleep(150);
    expect(search).not.toHaveBeenCalled();
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search).toHaveBeenCalledWith("rohan");
    await sleep(400);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("does not search for a single character", async () => {
    const { user, box } = setup();
    await user.type(box, "r");
    await sleep(450);
    expect(search).not.toHaveBeenCalled();
  });

  it("shows results grouped by customers, calls and vouchers, each linking to its page", async () => {
    const { user, box } = setup();
    await user.type(box, "rohan");

    const customers = await screen.findByRole("group", { name: "Customers" });
    expect(within(customers).getByRole("link", { name: /Rohan Mehta/ })).toHaveAttribute(
      "href",
      "/dashboard/calls?customerId=u1",
    );
    const calls = screen.getByRole("group", { name: "Calls" });
    expect(within(calls).getByRole("link")).toHaveAttribute("href", "/dashboard/calls/c9");
    const vouchers = screen.getByRole("group", { name: "Vouchers" });
    expect(within(vouchers).getByRole("link", { name: /VR-8KQ2-X7MD/ })).toHaveAttribute(
      "href",
      "/dashboard/calls/c9",
    );
  });

  it("falls back to the vouchers page for a voucher with no call", async () => {
    search.mockResolvedValue({ customers: [], calls: [], vouchers: [voucher({ callId: null })] });
    const { user, box } = setup();
    await user.type(box, "vr-8k");
    const vouchers = await screen.findByRole("group", { name: "Vouchers" });
    expect(within(vouchers).getByRole("link")).toHaveAttribute("href", "/dashboard/vouchers");
  });

  it("says No results for each empty group", async () => {
    search.mockResolvedValue({ customers: [], calls: [], vouchers: [] });
    const { user, box } = setup();
    await user.type(box, "zzzz");
    await screen.findByRole("group", { name: "Customers" });
    expect(screen.getAllByText("No results")).toHaveLength(3);
  });

  it("shows only the newest answer when an older search finishes late", async () => {
    let finishFirst!: (r: SearchResults) => void;
    search.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
    search.mockResolvedValueOnce({
      customers: [{ id: "u2", name: "Asha Rao", phone: "9123456789" }],
      calls: [],
      vouchers: [],
    });
    const { user, box } = setup();
    await user.type(box, "ro");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await user.type(box, "h");
    await screen.findByText(/Asha Rao/);

    finishFirst(results); // the first search answers last
    await sleep(50);
    expect(screen.queryByText(/Rohan Mehta/)).not.toBeInTheDocument();
    expect(screen.getByText(/Asha Rao/)).toBeInTheDocument();
  });

  it("explains a failed search", async () => {
    search.mockRejectedValue(new Error("boom"));
    const { user, box } = setup();
    await user.type(box, "rohan");
    expect(await screen.findByText("Search is unavailable right now.")).toBeInTheDocument();
  });

  it("closes and clears on Escape", async () => {
    const { user, box } = setup();
    await user.type(box, "rohan");
    await screen.findByRole("group", { name: "Customers" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Customers" })).not.toBeInTheDocument();
    expect(box).toHaveValue("");
  });
});
