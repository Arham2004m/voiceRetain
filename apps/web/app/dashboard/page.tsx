"use client";

import Link from "next/link";
import { CallsTable } from "@/components/dashboard/CallsTable";
import { LiveCallPanel } from "@/components/dashboard/LiveCallPanel";
import { MetricsTally, RecoveryHeadline } from "@/components/dashboard/MetricsTally";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SentimentBreakdown } from "@/components/dashboard/SentimentBreakdown";
import { useDashboardSocket } from "@/lib/dashboard/useDashboardSocket";

export default function OverviewPage() {
  const { metrics, recentCalls, liveCall, loading, error } = useDashboardSocket();

  if (!metrics) {
    return error ? (
      <div role="alert" className="border-kumkum max-w-[34rem] border-2 p-6">
        <p className="display text-3xl">The dashboard did not load.</p>
        <p className="mt-2">{error}</p>
      </div>
    ) : (
      <p aria-busy={loading}>Loading the dashboard…</p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <title>Overview · Merchant desk</title>
      <RecoveryHeadline metrics={metrics} />

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <LiveCallPanel liveCall={liveCall} />
        </div>
        <div className="lg:col-span-5">
          <h3 className="display mb-3 text-3xl">Today&rsquo;s figures</h3>
          <MetricsTally metrics={metrics} />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <h3 className="display mb-3 text-3xl">Recovered, last 7 days</h3>
          <RevenueChart days={metrics.last7Days} />
        </section>
        <section className="lg:col-span-5">
          <h3 className="display mb-3 text-3xl">How callers felt</h3>
          <SentimentBreakdown sentiment={metrics.sentiment} />
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h3 className="display text-3xl">Recent calls</h3>
          <Link href="/dashboard/calls" className="font-semibold underline underline-offset-4">
            All calls
          </Link>
        </div>
        <CallsTable calls={recentCalls} caption="Ten most recent calls" />
      </section>
    </div>
  );
}
