"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CallsTable } from "@/components/dashboard/CallsTable";
import { Button } from "@/components/ui/Button";
import { useCallsList } from "@/lib/dashboard/useCallsList";

const OUTCOMES = [
  ["RECOVERED", "Recovered"],
  ["ACCEPTED_OFFER", "Accepted offer"],
  ["UNDECIDED", "Undecided"],
  ["DECLINED", "Declined"],
  ["NO_ANSWER", "No answer"],
  ["PENDING", "In progress"],
] as const;
const SENTIMENTS = [
  ["POSITIVE", "Positive"],
  ["NEUTRAL", "Neutral"],
  ["NEGATIVE", "Negative"],
] as const;

const select = "bg-paper border-ink min-h-11 border-2 px-3";

function CallsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const outcome = params.get("outcome") ?? undefined;
  const sentiment = params.get("sentiment") ?? undefined;
  const customerId = params.get("customerId") ?? undefined;

  const { calls, loading, loadingMore, error, hasMore, loadMore } = useCallsList({
    outcome,
    sentiment,
    customerId,
  });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-col gap-6">
      <title>Calls · Merchant desk</title>
      <h1 className="display text-6xl sm:text-8xl">Calls</h1>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 font-semibold">
          Outcome
          <select
            value={outcome ?? ""}
            onChange={(e) => setFilter("outcome", e.target.value)}
            className={select}
          >
            <option value="">Any outcome</option>
            {OUTCOMES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          Sentiment
          <select
            value={sentiment ?? ""}
            onChange={(e) => setFilter("sentiment", e.target.value)}
            className={select}
          >
            <option value="">Any sentiment</option>
            {SENTIMENTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {customerId ? (
          <p className="pb-2">
            Showing one customer&rsquo;s calls.{" "}
            <Link href="/dashboard/calls" className="font-semibold underline underline-offset-4">
              Show everyone
            </Link>
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-kumkum font-medium">
          {error}
        </p>
      ) : null}
      {loading ? <p aria-busy>Loading calls…</p> : <CallsTable calls={calls} caption="Calls" />}

      {hasMore ? (
        <div>
          <Button variant="ink" onClick={loadMore} loading={loadingMore}>
            Show more calls
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading calls…</p>}>
      <CallsPage />
    </Suspense>
  );
}
