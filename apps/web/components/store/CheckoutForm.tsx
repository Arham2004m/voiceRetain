"use client";

import { useState, type FormEvent } from "react";
import { isValidIndianMobile, normalizePhone } from "@voiceretain/shared";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/Input";

export interface CheckoutValues {
  name: string;
  phone: string;
  email?: string;
  consentToCall: boolean;
}

type Errors = Partial<Record<"name" | "phone" | "email", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(raw: { name: string; phone: string; email: string }): Errors {
  const errors: Errors = {};
  const name = raw.name.trim();
  if (name.length < 2 || name.length > 60)
    errors.name = "Enter your full name, 2 to 60 characters.";
  const phone = normalizePhone(raw.phone.trim()) ?? raw.phone;
  if (!isValidIndianMobile(phone)) {
    errors.phone = "Enter a 10-digit mobile number starting with 6, 7, 8 or 9.";
  }
  const email = raw.email.trim();
  if (email && !EMAIL.test(email))
    errors.email = "Enter a valid email address, or leave this blank.";
  return errors;
}

export function CheckoutForm({
  onSubmit,
  initial,
  submitting = false,
}: {
  onSubmit: (values: CheckoutValues) => void | Promise<void>;
  initial?: { name?: string; phone?: string };
  submitting?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);

  // After the first attempt, keep the messages in step with what the shopper is typing.
  const recheck = (next: { name: string; phone: string; email: string }) => {
    if (attempted) setErrors(validate(next));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    const found = validate({ name, phone, email });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const cleanEmail = email.trim();
    void onSubmit({
      name: name.trim(),
      phone: normalizePhone(phone.trim()) ?? phone,
      ...(cleanEmail ? { email: cleanEmail } : {}),
      consentToCall: consent,
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-[34rem] flex-col gap-6">
      <Input
        label="Full name"
        name="name"
        autoComplete="name"
        value={name}
        error={errors.name}
        onChange={(e) => {
          setName(e.target.value);
          recheck({ name: e.target.value, phone, email });
        }}
      />
      <Input
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        hint="10 digits. You don't need to add +91."
        value={phone}
        error={errors.phone}
        onChange={(e) => {
          setPhone(e.target.value);
          recheck({ name, phone: e.target.value, email });
        }}
      />
      <Input
        label="Email (optional)"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        error={errors.email}
        onChange={(e) => {
          setEmail(e.target.value);
          recheck({ name, phone, email: e.target.value });
        }}
      />
      <Checkbox
        label="Yes, ShopNest may call me about this order"
        checked={consent}
        onChange={(e) => setConsent(e.target.checked)}
        note={consent ? undefined : "We won't call you about this order."}
      />
      <div>
        <Button type="submit" loading={submitting}>
          Continue to payment
        </Button>
      </div>
    </form>
  );
}
