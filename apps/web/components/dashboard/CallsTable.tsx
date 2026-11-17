import Link from "next/link";
import { formatINR, type CallSummaryDTO } from "@voiceretain/shared";
import { formatDuration, formatPhone, formatWhen } from "@/lib/format";
import { CallStatusBadge, OutcomeBadge, SentimentBadge } from "./Badges";

const th = "px-3 py-2 text-left font-semibold";
const td = "px-3 py-3 align-middle";

export function CallsTable({
  calls,
  caption = "Calls",
}: {
  calls: CallSummaryDTO[];
  caption?: string;
}) {
  if (calls.length === 0) return <p className="text-ink-soft py-6">No calls yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-ink border-b-2">
          <tr>
            <th scope="col" className={th}>
              Customer
            </th>
            <th scope="col" className={th}>
              Cart
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Outcome
            </th>
            <th scope="col" className={th}>
              Sentiment
            </th>
            <th scope="col" className={th}>
              Length
            </th>
            <th scope="col" className={th}>
              Started
            </th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id} className="border-ink/20 hover:bg-paper border-b">
              <td className={td}>
                <Link
                  href={`/dashboard/calls/${c.id}`}
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  {c.customerName}
                </Link>
                <span className="num text-ink-soft block text-sm">
                  {formatPhone(c.customerPhone)}
                </span>
              </td>
              <td className={`${td} num`}>{formatINR(c.cartTotalPaise)}</td>
              <td className={td}>
                <CallStatusBadge status={c.status} />
              </td>
              <td className={td}>
                <OutcomeBadge outcome={c.outcome} />
              </td>
              <td className={td}>
                <SentimentBadge sentiment={c.sentiment} />
              </td>
              <td className={`${td} num`}>{formatDuration(c.durationSec)}</td>
              <td className={`${td} text-ink-soft whitespace-nowrap`}>{formatWhen(c.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
