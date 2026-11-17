import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpeechRecognition } from "../useSpeechRecognition";

/** A stand-in for the browser's recognizer that tests can drive by hand. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = true;
  interimResults = false;
  starts = 0;
  stops = 0;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((e: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((e: any) => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.starts++;
    this.onstart?.();
  }
  stop() {
    this.stops++;
    this.onend?.();
  }
  abort() {
    this.stop();
  }
  say(text: string, isFinal: boolean) {
    const result = Object.assign([{ transcript: text }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
}

const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1]!;

beforeEach(() => {
  FakeRecognition.instances = [];
  vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
  Object.defineProperty(window, "webkitSpeechRecognition", {
    value: FakeRecognition,
    configurable: true,
    writable: true,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error cleaning up the fake
  delete window.webkitSpeechRecognition;
});

describe("useSpeechRecognition", () => {
  it("reports unsupported browsers", () => {
    // @ts-expect-error simulate Firefox
    delete window.webkitSpeechRecognition;
    vi.unstubAllGlobals();
    const { result } = renderHook(() => useSpeechRecognition({ onFinal: vi.fn() }));
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(result.current.listening).toBe(false);
  });

  it("configures the recognizer for short Indian-English turns", () => {
    const { result } = renderHook(() => useSpeechRecognition({ onFinal: vi.fn() }));
    act(() => result.current.start());
    expect(result.current.supported).toBe(true);
    expect(latest()).toMatchObject({ lang: "en-IN", continuous: false, interimResults: true });
  });

  it("passes a final result to onFinal and shows interim text meanwhile", () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onFinal }));
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    expect(result.current.permission).toBe("granted");

    act(() => latest().say("shipping is", false));
    expect(result.current.interim).toBe("shipping is");
    expect(onFinal).not.toHaveBeenCalled();

    act(() => latest().say("shipping is expensive", true));
    expect(onFinal).toHaveBeenCalledWith("shipping is expensive");
    expect(result.current.interim).toBe("");
  });

  it("ignores empty final results", () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onFinal }));
    act(() => result.current.start());
    act(() => latest().say("   ", true));
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("does not restart on its own after delivering an utterance (the caller controls turn-taking)", () => {
    const { result } = renderHook(() => useSpeechRecognition({ onFinal: vi.fn() }));
    act(() => result.current.start());
    act(() => latest().say("hello", true));
    act(() => latest().onend?.());
    expect(latest().starts).toBe(1);
    expect(result.current.listening).toBe(false);
  });

  it("restarts silently after a no-speech timeout while it still wants to listen", () => {
    const { result } = renderHook(() => useSpeechRecognition({ onFinal: vi.fn() }));
    act(() => result.current.start());
    act(() => latest().fail("no-speech"));
    act(() => latest().onend?.());
    expect(latest().starts).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it("marks permission denied on not-allowed and stops retrying", () => {
    const { result } = renderHook(() => useSpeechRecognition({ onFinal: vi.fn() }));
    act(() => result.current.start());
    act(() => latest().fail("not-allowed"));
    act(() => latest().onend?.());
    expect(result.current.permission).toBe("denied");
    expect(result.current.listening).toBe(false);
    expect(latest().starts).toBe(1);
    act(() => result.current.start());
    expect(latest().starts).toBe(1);
  });

  it("stop() ends listening and prevents a restart", () => {
    const { result } = renderHook(() => useSpeechRecognition({ onFinal: vi.fn() }));
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(result.current.listening).toBe(false);
    expect(latest().starts).toBe(1);
    expect(latest().stops).toBeGreaterThan(0);
  });

  it("keeps other errors visible", () => {
    const { result } = renderHook(() => useSpeechRecognition({ onFinal: vi.fn() }));
    act(() => result.current.start());
    act(() => latest().fail("network"));
    expect(result.current.error).toBe("network");
  });
});
