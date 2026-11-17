import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CheckoutForm } from "../CheckoutForm";

const fill = async (name: string, phone: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Full name"), name);
  await user.type(screen.getByLabelText("Mobile number"), phone);
  return user;
};

describe("CheckoutForm", () => {
  it("shows inline errors for a one-letter name and a short phone number, and does not submit", async () => {
    const onSubmit = vi.fn();
    render(<CheckoutForm onSubmit={onSubmit} />);
    const user = await fill("R", "12345");
    await user.click(screen.getByRole("button", { name: "Continue to payment" }));

    expect(screen.getByText(/enter your full name/i)).toBeInTheDocument();
    expect(screen.getByText(/10-digit mobile number/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a mobile number that does not start with 6 to 9", async () => {
    render(<CheckoutForm onSubmit={vi.fn()} />);
    const user = await fill("Rohan", "5876543210");
    await user.click(screen.getByRole("button", { name: "Continue to payment" }));
    expect(screen.getByText(/10-digit mobile number/i)).toBeInTheDocument();
  });

  it("explains that nobody will call while the consent box is unticked", async () => {
    render(<CheckoutForm onSubmit={vi.fn()} />);
    expect(screen.getByText("We won't call you about this order.")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("checkbox", { name: "Yes, ShopNest may call me about this order" }),
    );
    expect(screen.queryByText("We won't call you about this order.")).not.toBeInTheDocument();
  });

  it("submits clean values, normalising the phone number", async () => {
    const onSubmit = vi.fn();
    render(<CheckoutForm onSubmit={onSubmit} />);
    const user = await fill("  Rohan Mehta ", "+91 98765 43210");
    await user.click(
      screen.getByRole("checkbox", { name: "Yes, ShopNest may call me about this order" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue to payment" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Rohan Mehta",
      phone: "9876543210",
      consentToCall: true,
    });
  });

  it("includes a valid email and flags a bad one", async () => {
    const onSubmit = vi.fn();
    render(<CheckoutForm onSubmit={onSubmit} />);
    const user = await fill("Rohan", "9876543210");
    await user.type(screen.getByLabelText("Email (optional)"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Continue to payment" }));
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Email (optional)"));
    await user.type(screen.getByLabelText("Email (optional)"), "rohan@example.com");
    await user.click(screen.getByRole("button", { name: "Continue to payment" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Rohan",
      phone: "9876543210",
      email: "rohan@example.com",
      consentToCall: false,
    });
  });

  it("starts from saved details and disables the button while submitting", () => {
    render(
      <CheckoutForm
        onSubmit={vi.fn()}
        initial={{ name: "Rohan", phone: "9876543210" }}
        submitting
      />,
    );
    expect(screen.getByLabelText("Full name")).toHaveValue("Rohan");
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
  });
});
