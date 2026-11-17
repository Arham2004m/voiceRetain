import { formatINR, type DashboardMetrics } from "@voiceretain/shared";
import { formatLatency, formatPercent } from "@/lib/format";

/** The one-sentence answer to "is this working?". */
export function RecoveryHeadline({ metrics }: { metrics: DashboardMetrics }) {
  const { abandonedCarts, recoveredCarts, revenueRecoveredPaise } = metrics;
  const carts = (n: number) => `${n} abandoned cart${n === 1 ? "" : "s"}`;

  const text =
    abandonedCarts === 0
      ? "No abandoned carts yet."
      : recoveredCarts === 0
        ? `Nothing recovered yet. ${abandonedCarts} cart${abandonedCarts === 1 ? "" : "s"} abandoned so far.`
        : `${formatINR(revenueRecoveredPaise)} recovered from ${recoveredCarts} of ${carts(abandonedCarts)}.`;

  return <h2 className="display text-[2.8rem] sm:text-7xl">{text}</h2>;
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className={strong ? "font-semibold" : ""}>{label}</dt>
      <span
        aria-hidden
        className="border-ink/40 mb-1 min-w-4 flex-1 self-end border-b-2 border-dotted"
      />
      <dd className={`num whitespace-nowrap ${strong ? "display text-3xl" : "font-semibold"}`}>
        {value}
      </dd>
    </div>
  );
}

/** The day's figures as a till-roll: a label, a dotted leader, the number. */
export function MetricsTally({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="receipt-edge border-ink bg-paper border-t-8 px-5 pt-5 pb-8">
      <dl className="flex flex-col gap-3">
        <Row label="Carts abandoned" value={String(metrics.abandonedCarts)} />
        <Row label="Calls placed" value={String(metrics.callsPlaced)} />
        <Row label="Answer rate" value={formatPercent(metrics.answerRate)} />
        <Row label="Carts recovered" value={String(metrics.recoveredCarts)} />
        <Row label="Recovery rate" value={formatPercent(metrics.recoveryRate)} />
        <Row label="Agent reply time" value={formatLatency(metrics.avgLatencyMs)} />
        <div className="border-ink mt-1 border-t-2 pt-3">
          <Row label="Revenue recovered" value={formatINR(metrics.revenueRecoveredPaise)} strong />
        </div>
      </dl>
    </div>
  );
}
