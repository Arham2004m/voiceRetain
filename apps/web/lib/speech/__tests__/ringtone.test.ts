import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRingtone } from "../ringtone";

class FakeParam {
  value = 0;
  events: [number, number][] = [];
  setValueAtTime(v: number, t: number) {
    this.events.push([v, t]);
  }
}
class FakeNode {
  frequency = new FakeParam();
  gain = new FakeParam();
  type = "";
  started = false;
  stopped = false;
  connections: unknown[] = [];
  connect(n: unknown) {
    this.connections.push(n);
    return n;
  }
  disconnect() {}
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

let ctxState: "running" | "suspended";
let oscillators: FakeNode[];
let resumeResult: "running" | "suspended";

class FakeAudioContext {
  currentTime = 0;
  destination = new FakeNode();
  get state() {
    return ctxState;
  }
  resume() {
    ctxState = resumeResult;
    return Promise.resolve();
  }
  createOscillator() {
    const o = new FakeNode();
    oscillators.push(o);
    return o;
  }
  createGain() {
    return new FakeNode();
  }
  close() {
    return Promise.resolve();
  }
}

beforeEach(() => {
  oscillators = [];
  ctxState = "running";
  resumeResult = "running";
  vi.useFakeTimers();
  vi.stubGlobal("AudioContext", FakeAudioContext);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createRingtone", () => {
  it("rings with a two-tone 440 Hz + 480 Hz sound", async () => {
    const ring = createRingtone();
    expect(await ring.start()).toBe(true);
    expect(oscillators.map((o) => o.frequency.value).sort()).toEqual([440, 480]);
    expect(oscillators.every((o) => o.started)).toBe(true);
    ring.stop();
    expect(oscillators.every((o) => o.stopped)).toBe(true);
  });

  it("returns false when the browser keeps audio suspended (no click yet)", async () => {
    ctxState = "suspended";
    resumeResult = "suspended";
    const ring = createRingtone();
    expect(await ring.start()).toBe(false);
    expect(oscillators).toHaveLength(0);
  });

  it("works on a later attempt once the browser allows audio", async () => {
    ctxState = "suspended";
    resumeResult = "suspended";
    const ring = createRingtone();
    expect(await ring.start()).toBe(false);
    resumeResult = "running";
    expect(await ring.start()).toBe(true);
    expect(oscillators).toHaveLength(2);
  });

  it("returns false where Web Audio does not exist", async () => {
    vi.unstubAllGlobals();
    const ring = createRingtone();
    expect(await ring.start()).toBe(false);
  });

  it("repeats the ring burst every six seconds (2 s on, 4 s off) until stopped", async () => {
    const ring = createRingtone();
    await ring.start();
    const gain = (oscillators[0]!.connections[0] as FakeNode).gain;
    const initial = gain.events.length;
    vi.advanceTimersByTime(6000);
    expect(gain.events.length).toBeGreaterThan(initial);
    ring.stop();
    const afterStop = gain.events.length;
    vi.advanceTimersByTime(12000);
    expect(gain.events.length).toBe(afterStop);
  });

  it("starting twice does not stack oscillators", async () => {
    const ring = createRingtone();
    await ring.start();
    await ring.start();
    expect(oscillators).toHaveLength(2);
  });
});
