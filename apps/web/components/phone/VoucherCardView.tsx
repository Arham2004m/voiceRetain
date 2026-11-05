import type { VoucherCard } from "@voiceretain/shared";
import { ButtonLink } from "@/components/ui/Button";

const expiry = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

/** The offer, as a price tag: a red thread, the code in large type, and the way back to checkout. */
export function VoucherCardView({ voucher }: { voucher: VoucherCard }) {
  return (
    <section aria-label="Your discount code" className="relative mx-auto w-full max-w-[19rem] pt-8">
      <span aria-hidden className="bg-kumkum absolute top-0 left-9 h-9 w-0.5" />
      <div className="bg-paper text-ink [clip-path:polygon(0_22px,22px_0,100%_0,100%_100%,0_100%)] px-5 pt-7 pb-5">
        <span
          aria-hidden
          className="bg-ink border-kumkum absolute top-[2.15rem] left-[1.78rem] size-3 rounded-full border-2"
        />
        <p className="display text-4xl">{voucher.percent}% off</p>
        <p className="num mt-2 font-mono text-[1.65rem] leading-none font-bold tracking-wider break-all">
          {voucher.code}
        </p>
        <p className="text-ink-soft mt-2 text-sm">Valid until {expiry(voucher.expiresAt)}</p>
        <ButtonLink
          href={`/checkout?cart=${voucher.cartId}&code=${voucher.code}`}
          target="_blank"
          rel="noopener"
          className="mt-4 w-full"
        >
          Complete my order
        </ButtonLink>
      </div>
    </section>
  );
}
