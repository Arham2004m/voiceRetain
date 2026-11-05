import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "ink" | "quiet";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

const variants: Record<ButtonVariant, string> = {
  primary: "min-h-12 px-6 bg-marigold text-ink hover:bg-ink hover:text-marigold",
  ink: "min-h-12 px-6 bg-ink text-paper hover:bg-peacock",
  quiet: "underline underline-offset-4 decoration-2 hover:text-peacock",
};

export const buttonClass = (variant: ButtonVariant = "primary", extra = "") =>
  `${base} ${variants[variant]} ${extra}`.trim();

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner decorative /> : null}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
