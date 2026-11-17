import Link from "next/link";
import type { VoucherDTO } from "@voiceretain/shared";
import { formatWhen } from "@/lib/format";
import { VoucherStatusBadge } from "./Badges";

const th = "px-3 py-2 text-left font-semibold";
const td = "px-3 py-3 align-middle";

export function VoucherTable({ vouchers }: { vouchers: VoucherDTO[] }) {
  if (vouchers.length === 0) return <p className="text-ink-soft py-6">No discount codes yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse">
        <caption className="sr-only">Discount codes</caption>
        <thead className="border-ink border-b-2">
          <tr>
            <th scope="col" className={th}>
              Code
            </th>
            <th scope="col" className={th}>
              Offer
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Expires
            </th>
            <th scope="col" className={th}>
              Redeemed
            </th>
            <th scope="col" className={th}>
              Call
            </th>
          </tr>
        </thead>
        <tbody>
          {vouchers.map((v) => (
            <tr key={v.id} className="border-ink/20 hover:bg-paper border-b">
              <td className={`${td} font-mono font-bold tracking-wide`}>{v.code}</td>
              <td className={`${td} num`}>{v.percent}% off</td>
              <td className={td}>
                <VoucherStatusBadge status={v.status} />
              </td>
              <td className={`${td} text-ink-soft whitespace-nowrap`}>{formatWhen(v.expiresAt)}</td>
              <td className={`${td} text-ink-soft whitespace-nowrap`}>
                {formatWhen(v.redeemedAt)}
              </td>
              <td className={td}>
                {v.callId ? (
                  <Link
                    href={`/dashboard/calls/${v.callId}`}
                    className="font-semibold underline underline-offset-4"
                  >
                    Open call
                  </Link>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
