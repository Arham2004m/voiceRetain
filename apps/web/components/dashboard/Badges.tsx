import type { CallOutcome, CallStatus, Sentiment, VoucherStatus } from "@voiceretain/shared";
import { Badge } from "@/components/ui/Badge";

type Tone = Parameters<typeof Badge>[0]["tone"];

const OUTCOMES: Record<CallOutcome, { label: string; tone: Tone }> = {
  RECOVERED: { label: "Recovered", tone: "leaf" },
  ACCEPTED_OFFER: { label: "Accepted offer", tone: "marigold" },
  UNDECIDED: { label: "Undecided", tone: "plain" },
  DECLINED: { label: "Declined", tone: "kumkum" },
  NO_ANSWER: { label: "No answer", tone: "ink" },
  PENDING: { label: "In progress", tone: "plain" },
};

const SENTIMENTS: Record<Sentiment, { label: string; tone: Tone }> = {
  POSITIVE: { label: "Positive", tone: "leaf" },
  NEUTRAL: { label: "Neutral", tone: "plain" },
  NEGATIVE: { label: "Negative", tone: "kumkum" },
};

const STATUSES: Record<CallStatus, { label: string; tone: Tone }> = {
  RINGING: { label: "Ringing", tone: "marigold" },
  IN_PROGRESS: { label: "In progress", tone: "leaf" },
  ENDED: { label: "Ended", tone: "plain" },
  MISSED: { label: "Missed", tone: "ink" },
};

const VOUCHER_STATUSES: Record<VoucherStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "leaf" },
  SUPERSEDED: { label: "Replaced", tone: "plain" },
  REDEEMED: { label: "Redeemed", tone: "marigold" },
  EXPIRED: { label: "Expired", tone: "ink" },
};

export const outcomeLabel = (o: CallOutcome) => OUTCOMES[o].label;
export const sentimentLabel = (s: Sentiment) => SENTIMENTS[s].label;

export function OutcomeBadge({ outcome }: { outcome: CallOutcome }) {
  return <Badge tone={OUTCOMES[outcome].tone}>{OUTCOMES[outcome].label}</Badge>;
}

export function SentimentBadge({ sentiment }: { sentiment: Sentiment | null }) {
  if (!sentiment) return <span aria-label="Not analysed yet">—</span>;
  return <Badge tone={SENTIMENTS[sentiment].tone}>{SENTIMENTS[sentiment].label}</Badge>;
}

export function CallStatusBadge({ status }: { status: CallStatus }) {
  return <Badge tone={STATUSES[status].tone}>{STATUSES[status].label}</Badge>;
}

export function VoucherStatusBadge({ status }: { status: VoucherStatus }) {
  return <Badge tone={VOUCHER_STATUSES[status].tone}>{VOUCHER_STATUSES[status].label}</Badge>;
}
