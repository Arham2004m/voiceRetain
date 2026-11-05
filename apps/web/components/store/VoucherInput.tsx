"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { formatINR } from "@voiceretain/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface AppliedVoucher {
  code: string;
  percent: number;
  discountPaise: number;
}

const REASONS = {
  NOT_FOUND: "We don't recognise that code",
  WRONG_CART: "This code belongs to a different cart",
  EXPIRED: "This code has expired",
  NOT_ACTIVE: "This code was already used or replaced by a newer one",
} as const;

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "applied"; voucher: AppliedVoucher }
  | { kind: "error"; message: string };

export function VoucherInput({
  cartId,
  initialCode,
  onApplied,
}: {
  cartId: string;
  /** A code that arrived in the link (the phone's "Complete my order"); applied automatically. */
  initialCode?: string;
  onApplied: (voucher: AppliedVoucher | null) => void;
}) {
  const [code, setCode] = useState(initialCode ?? "");
  const [state, setState] = useState<State>({ kind: "idle" });
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;

  const check = useCallback(
    async (raw: string) => {
      const clean = raw.trim().toUpperCase();
      if (!clean) {
        setState({ kind: "error", message: "Enter your code first" });
        return;
      }
      setState({ kind: "checking" });
      try {
        const result = await api.validateVoucher({ code: clean, cartId });
        if (result.valid) {
          const voucher = {
            code: clean,
            percent: result.percent,
            discountPaise: result.discountPaise,
          };
          setCode(clean);
          setState({ kind: "applied", voucher });
          onAppliedRef.current(voucher);
        } else {
          setState({ kind: "error", message: REASONS[result.reason] });
          onAppliedRef.current(null);
        }
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not check that code. Try again.",
        });
        onAppliedRef.current(null);
      }
    },
    [cartId],
  );

  const autoApplied = useRef(false);
  useEffect(() => {
    if (initialCode && !autoApplied.current) {
      autoApplied.current = true;
      void check(initialCode);
    }
  }, [initialCode, check]);

  const applied = state.kind === "applied";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!applied) void check(code);
  };

  const remove = () => {
    setCode("");
    setState({ kind: "idle" });
    onApplied(null);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Input
            label="Discount code"
            name="code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={code}
            readOnly={applied}
            onChange={(e) => {
              setCode(e.target.value);
              if (state.kind === "error") setState({ kind: "idle" });
            }}
            className="font-semibold tracking-wide uppercase"
          />
        </div>
        {applied ? (
          <Button variant="quiet" onClick={remove} className="mb-3">
            Remove code
          </Button>
        ) : (
          <Button type="submit" variant="ink" loading={state.kind === "checking"}>
            Apply
          </Button>
        )}
      </div>
      {state.kind === "applied" ? (
        <p role="status" className="text-leaf font-semibold">
          {state.voucher.percent}% off — you save {formatINR(state.voucher.discountPaise)}
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p role="alert" className="text-kumkum font-medium">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
