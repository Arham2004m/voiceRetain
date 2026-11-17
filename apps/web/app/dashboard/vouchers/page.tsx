"use client";

import { useCallback, useEffect, useState } from "react";
import type { VoucherDTO } from "@voiceretain/shared";
import { VoucherTable } from "@/components/dashboard/VoucherTable";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useDashboardEvents } from "@/lib/dashboard/useDashboardRoom";

const STATUSES = [
  ["ACTIVE", "Active"],
  ["REDEEMED", "Redeemed"],
  ["SUPERSEDED", "Replaced"],
  ["EXPIRED", "Expired"],
] as const;

export default function VouchersPage() {
  const [status, setStatus] = useState("");
  const [vouchers, setVouchers] = useState<VoucherDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const page = await api.listVouchers({ limit: 20, status: status || undefined });
      setVouchers(page.items);
      setCursor(page.nextCursor);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the codes.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Issuing, redeeming and resetting all end in a metrics update, so that is the cue to refresh.
  useDashboardEvents({ "dashboard:metrics": () => void load() }, () => void load());

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.listVouchers({ limit: 20, cursor, status: status || undefined });
      setVouchers((list) => [...list, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <title>Vouchers · Merchant desk</title>
      <h1 className="display text-6xl sm:text-8xl">Vouchers</h1>

      <label className="flex max-w-[16rem] flex-col gap-1.5 font-semibold">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-paper border-ink min-h-11 border-2 px-3"
        >
          <option value="">Any status</option>
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p role="alert" className="text-kumkum font-medium">
          {error}
        </p>
      ) : null}
      {loading ? <p aria-busy>Loading codes…</p> : <VoucherTable vouchers={vouchers} />}

      {cursor ? (
        <div>
          <Button variant="ink" onClick={loadMore} loading={loadingMore}>
            Show more codes
          </Button>
        </div>
      ) : null}
    </div>
  );
}
