import type { CallTimerStore, TimerKind } from "../../calls/call.timers";

/** Timer store whose timers only fire when a test calls `fire`. */
export class FakeCallTimers implements CallTimerStore {
  readonly pending = new Map<string, { ms: number; fn: () => void | Promise<void> }>();

  private key(kind: TimerKind, callId: string) {
    return `${kind}:${callId}`;
  }

  set(kind: TimerKind, callId: string, ms: number, fn: () => void | Promise<void>) {
    this.pending.set(this.key(kind, callId), { ms, fn });
  }
  clear(kind: TimerKind, callId: string) {
    this.pending.delete(this.key(kind, callId));
  }
  clearAll(callId: string) {
    for (const kind of ["ring", "maxDuration", "disconnect"] as const) this.clear(kind, callId);
  }
  has(kind: TimerKind, callId: string) {
    return this.pending.has(this.key(kind, callId));
  }
  msOf(kind: TimerKind, callId: string) {
    return this.pending.get(this.key(kind, callId))?.ms;
  }
  async fire(kind: TimerKind, callId: string) {
    const entry = this.pending.get(this.key(kind, callId));
    if (!entry) throw new Error(`no ${kind} timer for ${callId}`);
    this.pending.delete(this.key(kind, callId));
    await entry.fn();
  }
}
