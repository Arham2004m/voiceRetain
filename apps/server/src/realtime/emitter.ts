import type { ServerToClientEvents } from "@voiceretain/shared";

type Payload<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>[0];

export interface Emitter {
  toPhone<E extends keyof ServerToClientEvents>(phone: string, event: E, payload: Payload<E>): void;
  toDashboard<E extends keyof ServerToClientEvents>(event: E, payload: Payload<E>): void;
}

export interface Emission {
  target: "phone" | "dashboard";
  phone?: string;
  event: string;
  payload: unknown;
}

/** Records emissions instead of sending them; used by tests. */
export function createFakeEmitter(): Emitter & { emissions: Emission[] } {
  const emissions: Emission[] = [];
  return {
    emissions,
    toPhone(phone, event, payload) {
      emissions.push({ target: "phone", phone, event, payload });
    },
    toDashboard(event, payload) {
      emissions.push({ target: "dashboard", event, payload });
    },
  };
}
