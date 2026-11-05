import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, api } from "@/lib/api";
import { VoucherInput } from "../VoucherInput";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { validateVoucher: vi.fn() } };
});

const validate = vi.mocked(api.validateVoucher);

beforeEach(() => {
  validate.mockReset();
});

describe("VoucherInput", () => {
  it("shows the saving for a valid code and reports it upward", async () => {
    validate.mockResolvedValue({ valid: true, percent: 10, discountPaise: 14990 });
    const onApplied = vi.fn();
    render(<VoucherInput cartId="c1" onApplied={onApplied} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Discount code"), " vr-8kq2-x7md ");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("10% off — you save ₹149.90")).toBeInTheDocument();
    expect(validate).toHaveBeenCalledWith({ code: "VR-8KQ2-X7MD", cartId: "c1" });
    expect(onApplied).toHaveBeenCalledWith({
      code: "VR-8KQ2-X7MD",
      percent: 10,
      discountPaise: 14990,
    });
  });

  it.each([
    ["EXPIRED", "This code has expired"],
    ["NOT_FOUND", "We don't recognise that code"],
    ["WRONG_CART", "This code belongs to a different cart"],
    ["NOT_ACTIVE", "This code was already used or replaced by a newer one"],
  ] as const)("explains a %s code", async (reason, message) => {
    validate.mockResolvedValue({ valid: false, reason });
    const onApplied = vi.fn();
    render(<VoucherInput cartId="c1" onApplied={onApplied} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Discount code"), "VR-AAAA-BBBB");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onApplied).toHaveBeenLastCalledWith(null);
  });

  it("reports a network failure in plain words", async () => {
    validate.mockImplementation(async () => {
      throw new ApiClientError(0, "NETWORK_ERROR", "Can't reach ShopNest right now.");
    });
    render(<VoucherInput cartId="c1" onApplied={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Discount code"), "VR-AAAA-BBBB");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("Can't reach ShopNest right now.")).toBeInTheDocument();
  });

  it("does not call the server for an empty code", async () => {
    render(<VoucherInput cartId="c1" onApplied={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(validate).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your code first")).toBeInTheDocument();
  });

  it("fills in and applies a code that arrived in the link", async () => {
    validate.mockResolvedValue({ valid: true, percent: 15, discountPaise: 22485 });
    const onApplied = vi.fn();
    render(<VoucherInput cartId="c1" initialCode="VR-8KQ2-X7MD" onApplied={onApplied} />);
    expect(screen.getByLabelText("Discount code")).toHaveValue("VR-8KQ2-X7MD");
    await waitFor(() =>
      expect(onApplied).toHaveBeenCalledWith({
        code: "VR-8KQ2-X7MD",
        percent: 15,
        discountPaise: 22485,
      }),
    );
    expect(await screen.findByText("15% off — you save ₹224.85")).toBeInTheDocument();
  });

  it("lets the shopper remove an applied code", async () => {
    validate.mockResolvedValue({ valid: true, percent: 10, discountPaise: 14990 });
    const onApplied = vi.fn();
    render(<VoucherInput cartId="c1" onApplied={onApplied} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Discount code"), "VR-8KQ2-X7MD");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("10% off — you save ₹149.90");
    await user.click(screen.getByRole("button", { name: "Remove code" }));
    expect(onApplied).toHaveBeenLastCalledWith(null);
    expect(screen.getByLabelText("Discount code")).toHaveValue("");
  });
});
