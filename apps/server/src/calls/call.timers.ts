export type TimerKind = "ring" | "maxDuration" | "disconnect";

export interface CallTimerStore {
  set(kind: TimerKind, callId: string, ms: number, fn: () => void | Promise<void>): void;
  clear(kind: TimerKind, callId: string): void;
  clearAll(callId: string): void;
  has(kind: TimerKind, callId: string): boolean;
}

/** In-memory timers; lost on restart, which `recoverStaleCalls` compensates for. */
export class CallTimers implements CallTimerStore {
  private timers = new Map<string, NodeJS.Timeout>();

  private key(kind: TimerKind, callId: string) {
    return `${kind}:${callId}`;
  }

  set(kind: TimerKind, callId: string, ms: number, fn: () => void | Promise<void>): void {
    this.clear(kind, callId);
    const key = this.key(kind, callId);
    const handle = setTimeout(() => {
      this.timers.delete(key);
      void Promise.resolve(fn()).catch(() => undefined);
    }, ms);
    this.timers.set(key, handle);
  }

  clear(kind: TimerKind, callId: string): void {
    const key = this.key(kind, callId);
    const handle = this.timers.get(key);
    if (handle) clearTimeout(handle);
    this.timers.delete(key);
  }

  clearAll(callId: string): void {
    for (const kind of ["ring", "maxDuration", "disconnect"] as const) this.clear(kind, callId);
  }

  has(kind: TimerKind, callId: string): boolean {
    return this.timers.has(this.key(kind, callId));
  }
}
