"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CallSummaryDTO } from "@voiceretain/shared";
import { api, type CallFilters } from "@/lib/api";
import { useDashboardEvents } from "./useDashboardRoom";

const PAGE = 20;

type Filters = Pick<CallFilters, "outcome" | "sentiment" | "customerId">;

const clean = (f: Filters): Filters => ({
  ...(f.outcome ? { outcome: f.outcome } : {}),
  ...(f.sentiment ? { sentiment: f.sentiment } : {}),
  ...(f.customerId ? { customerId: f.customerId } : {}),
});

/** A page of calls that stays current: rows update in place and matching new calls appear on top. */
export function useCallsList(filters: Filters) {
  const key = JSON.stringify(clean(filters));
  const [calls, setCalls] = useState<CallSummaryDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    setCalls([]);
    api
      .listCalls({ limit: PAGE, ...clean(filtersRef.current) })
      .then((page) => {
        if (cancelled) return;
        setCalls(page.items);
        setCursor(page.nextCursor);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.listCalls({ limit: PAGE, ...clean(filtersRef.current), cursor });
      setCalls((list) => [...list, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more calls.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  useDashboardEvents({
    "dashboard:call-updated": (call: CallSummaryDTO) => {
      const f = filtersRef.current;
      setCalls((list) => {
        if (list.some((c) => c.id === call.id))
          return list.map((c) => (c.id === call.id ? call : c));
        // A call's customer id is not in the summary, so a one-customer view cannot place it.
        if (f.customerId) return list;
        if (f.outcome && call.outcome !== f.outcome) return list;
        if (f.sentiment && call.sentiment !== f.sentiment) return list;
        return [call, ...list];
      });
    },
  });

  return { calls, loading, loadingMore, error, hasMore: cursor !== null, loadMore };
}
