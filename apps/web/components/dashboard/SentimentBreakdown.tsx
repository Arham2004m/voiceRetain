import type { DashboardMetrics } from "@voiceretain/shared";

const SEGMENTS = [
  { key: "POSITIVE", label: "Positive", color: "bg-leaf" },
  { key: "NEUTRAL", label: "Neutral", color: "bg-sky" },
  { key: "NEGATIVE", label: "Negative", color: "bg-kumkum" },
] as const;

/** How callers felt: one bar split by share, with the counts spelled out beneath it. */
export function SentimentBreakdown({ sentiment }: { sentiment: DashboardMetrics["sentiment"] }) {
  const total = sentiment.POSITIVE + sentiment.NEUTRAL + sentiment.NEGATIVE;
  if (total === 0) return <p className="text-ink-soft">No analysed calls yet.</p>;

  return (
    <div>
      <div
        className="border-ink flex h-7 w-full overflow-hidden border-2"
        role="img"
        aria-label="How callers felt"
      >
        {SEGMENTS.map(({ key, color }) =>
          sentiment[key] > 0 ? (
            <div
              key={key}
              data-sentiment={key}
              className={color}
              style={{ width: `${Math.round((sentiment[key] / total) * 1000) / 10}%` }}
            />
          ) : null,
        )}
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        {SEGMENTS.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-2">
            <span aria-hidden className={`size-3 ${color}`} />
            <dt>{label}</dt>
            <dd className="num font-semibold">{sentiment[key]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
