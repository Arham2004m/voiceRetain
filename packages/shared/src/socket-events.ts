import type {
  CallOutcome,
  CallSummaryDTO,
  DashboardMetrics,
  TranscriptTurnDTO,
  VoucherCard,
} from "./dto";

export interface IncomingCallPayload {
  callId: string;
  customerName: string;
  cartId: string;
  subtotalPaise: number;
  itemCount: number;
}

export interface AgentReplyPayload {
  callId: string;
  text: string;
  voucher?: VoucherCard;
  endsCall: boolean;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServerEvents {
  "phone:register": (
    p: { phone: string },
    ack: (r: Ack<{ activeCall?: IncomingCallPayload }>) => void,
  ) => void;
  "dashboard:join": (ack: (r: Ack) => void) => void;
  "call:answer": (
    p: { callId: string },
    ack: (r: Ack<{ greeting: AgentReplyPayload }>) => void,
  ) => void;
  "call:decline": (p: { callId: string }, ack: (r: Ack) => void) => void;
  "call:utterance": (p: { callId: string; text: string }, ack: (r: Ack) => void) => void;
  "call:hangup": (p: { callId: string }, ack: (r: Ack) => void) => void;
}

export interface ServerToClientEvents {
  "call:incoming": (p: IncomingCallPayload) => void;
  "call:agent-reply": (p: AgentReplyPayload) => void;
  "call:ended": (p: { callId: string; outcome: CallOutcome }) => void;
  "call:ring-cancelled": (p: { callId: string }) => void;
  "dashboard:call-updated": (p: CallSummaryDTO) => void;
  "dashboard:turn": (p: { callId: string; turn: TranscriptTurnDTO }) => void;
  "dashboard:metrics": (p: DashboardMetrics) => void;
}
