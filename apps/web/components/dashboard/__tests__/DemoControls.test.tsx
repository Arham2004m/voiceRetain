import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, api } from "@/lib/api";
import { DemoControls, formatSeconds } from "../DemoControls";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: {
      getDemoConfig: vi.fn(),
      setDemoDelay: vi.fn(),
      triggerLatest: vi.fn(),
      resetDemo: vi.fn(),
      syncCatalogue: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getDemoConfig.mockResolvedValue({ abandonDelayMs: 30_000, mockLlm: true });
});

const ready = async () => {
  render(<DemoControls />);
  await screen.findByLabelText("Abandon delay in seconds");
  return userEvent.setup();
};

describe("formatSeconds", () => {
  it.each([
    [10, "10 s"],
    [60, "1 min"],
    [90, "1 min 30 s"],
    [120, "2 min"],
    [600, "10 min"],
  ])("writes %i seconds as %s", (seconds, text) => {
    expect(formatSeconds(seconds)).toBe(text);
  });
});

describe("DemoControls", () => {
  it("shows the current delay and whether the AI is the mock", async () => {
    await ready();
    expect(screen.getByLabelText("Abandon delay in seconds")).toHaveValue("30");
    expect(screen.getByText("Mock AI is on")).toBeInTheDocument();
  });

  it("says when the real Gemini model is in use", async () => {
    mocked.getDemoConfig.mockResolvedValue({ abandonDelayMs: 30_000, mockLlm: false });
    await ready();
    expect(screen.getByText("Gemini is on")).toBeInTheDocument();
  });

  it("sets the slider from the 10 s, 30 s and 2 min presets", async () => {
    const user = await ready();
    const slider = screen.getByLabelText("Abandon delay in seconds");
    await user.click(screen.getByRole("button", { name: "10 s" }));
    expect(slider).toHaveValue("10");
    await user.click(screen.getByRole("button", { name: "2 min" }));
    expect(slider).toHaveValue("120");
    await user.click(screen.getByRole("button", { name: "30 s" }));
    expect(slider).toHaveValue("30");
  });

  it("saves the chosen delay and confirms it", async () => {
    mocked.setDemoDelay.mockResolvedValue({ abandonDelayMs: 10_000, mockLlm: true });
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "10 s" }));
    await user.click(screen.getByRole("button", { name: "Save delay" }));
    expect(mocked.setDemoDelay).toHaveBeenCalledWith(10_000);
    expect(await screen.findByText("Calls now ring 10 s after checkout.")).toBeInTheDocument();
  });

  it("rings the phone now", async () => {
    mocked.triggerLatest.mockResolvedValue({ cartId: "cart1" });
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Ring the phone now" }));
    expect(await screen.findByText("Ringing now.")).toBeInTheDocument();
  });

  it("explains what to do when no cart is waiting for a call", async () => {
    mocked.triggerLatest.mockRejectedValue(new ApiClientError(404, "NOT_FOUND", "No cart"));
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Ring the phone now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /start a checkout and tick the call box/i,
    );
  });

  it("refreshes the products and reports how many loaded", async () => {
    mocked.syncCatalogue.mockResolvedValue({
      source: "dummyjson",
      synced: 184,
      skipped: 0,
      retired: 6,
    });
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Refresh products" }));
    expect(await screen.findByText("184 products loaded from dummyjson.")).toBeInTheDocument();
  });

  it("says plainly when the catalogue could not be reached", async () => {
    mocked.syncCatalogue.mockResolvedValue({ source: "kept", synced: 184, error: "ENOTFOUND" });
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Refresh products" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not reach dummyjson.*184 products/i,
    );
  });

  it("asks before resetting, and deletes nothing if the presenter backs out", async () => {
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      /calls, carts, vouchers and orders made in this demo/i,
    );
    expect(mocked.resetDemo).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep my data" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocked.resetDemo).not.toHaveBeenCalled();
  });

  it("resets once confirmed", async () => {
    mocked.resetDemo.mockResolvedValue({ ok: true });
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    await user.click(screen.getByRole("button", { name: "Delete demo data" }));
    await waitFor(() => expect(mocked.resetDemo).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Demo reset. Seeded history is untouched.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("explains when the settings cannot be loaded and lets the presenter retry", async () => {
    mocked.getDemoConfig.mockRejectedValueOnce(new Error("Can't reach ShopNest right now."));
    render(<DemoControls />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach ShopNest right now.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Abandon delay in seconds")).toBeInTheDocument();
  });
});
