import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePhoneCall } from "../usePhoneCall";

// ---- Controllable fakes for the socket, speech and ringtone ---------------------------------

const h = vi.hoisted(() => {
  type Handler = (payload: never) => void;
  const socket = {
    connected: true,
    handlers: {} as Record<string, Handler[]>,
    emitted: [] as { event: string; payload: unknown }[],
    responders: {} as Record<string, (payload: unknown) => unknown>,
    on(event: string, fn: Handler) {
      (this.handlers[event] ??= []).push(fn);
      return this;
    },
    off(event: string, fn: Handler) {
      this.handlers[event] = (this.handlers[event] ?? []).filter((f) => f !== fn);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      const ack =
        typeof args[args.length - 1] === "function"
          ? (args.pop() as (r: unknown) => void)
          : undefined;
      this.emitted.push({ event, payload: args[0] });
      ack?.(this.responders[event]?.(args[0]) ?? { ok: true });
      return this;
    },
    trigger(event: string, payload?: unknown) {
      for (const fn of this.handlers[event] ?? []) (fn as (p: unknown) => void)(payload);
    },
    reset() {
      this.connected = true;
      this.handlers = {};
      this.emitted = [];
      this.responders = {};
    },
  };

  const recognition = {
    api: {
      supported: true,
      permission: "granted" as "unknown" | "granted" | "denied",
      listening: false,
      interim: "",
      error: null as string | null,
      start: vi.fn(),
      stop: vi.fn(),
    },
    onFinal: (_: string) => {},
  };

  const speech = {
    resolvers: [] as (() => void)[],
    api: {
      supported: true,
      speaking: false,
      speak: vi.fn(),
      cancel: vi.fn(),
    },
  };

  const ringtone = { start: vi.fn(), stop: vi.fn(), unlock: vi.fn() };
  return { socket, recognition, speech, ringtone };
});

vi.mock("@/lib/socket", () => ({ getSocket: () => h.socket }));
vi.mock("@/lib/speech/useSpeechRecognition", () => ({
  useSpeechRecognition: (opts: { onFinal: (t: string) => void }) => {
    h.recognition.onFinal = opts.onFinal;
    return h.recognition.api;
  },
}));
vi.mock("@/lib/speech/useSpeechSynthesis", () => ({ useSpeechSynthesis: () => h.speech.api }));
vi.mock("@/lib/speech/ringtone", () => ({ getRingtone: () => h.ringtone }));

const incoming = {
  callId: "call1",
  customerName: "Rohan",
  cartId: "cart1",
  subtotalPaise: 149900,
  itemCount: 1,
};
const voucher = {
  code: "VR-8KQ2-X7MD",
  percent: 10,
  expiresAt: "2030-01-01T00:00:00.000Z",
  cartId: "cart1",
};

beforeEach(() => {
  h.socket.reset();
  h.recognition.api.supported = true;
  h.recognition.api.permission = "granted";
  h.recognition.api.start.mockReset();
  h.recognition.api.stop.mockReset();
  h.speech.resolvers = [];
  h.speech.api.speak
    .mockReset()
    .mockImplementation(() => new Promise<void>((resolve) => h.speech.resolvers.push(resolve)));
  h.speech.api.cancel.mockReset();
  h.ringtone.start.mockReset().mockResolvedValue(true);
  h.ringtone.stop.mockReset();
  h.socket.responders["phone:register"] = () => ({ ok: true });
  h.socket.responders["call:answer"] = () => ({
    ok: true,
    greeting: { callId: "call1", text: "Hi Rohan, this is Aria from ShopNest.", endsCall: false },
  });
});
afterEach(() => vi.useRealTimers());

const finishSpeaking = () => act(async () => h.speech.resolvers.shift()?.());
const emitted = (event: string) => h.socket.emitted.filter((e) => e.event === event);

async function ringing() {
  const hook = renderHook(() => usePhoneCall("9876543210"));
  await act(async () => h.socket.trigger("call:incoming", incoming));
  return hook;
}

async function inCall() {
  const hook = await ringing();
  await act(async () => hook.result.current.answer());
  await finishSpeaking(); // greeting
  return hook;
}

// ---- Tests ----------------------------------------------------------------------------------

describe("registration", () => {
  it("stays unregistered without a number and does not touch the socket", () => {
    const { result } = renderHook(() => usePhoneCall(null));
    expect(result.current.state).toBe("unregistered");
    expect(h.socket.emitted).toHaveLength(0);
  });

  it("registers the number and goes idle", () => {
    const { result } = renderHook(() => usePhoneCall("9876543210"));
    expect(emitted("phone:register")[0]?.payload).toEqual({ phone: "9876543210" });
    expect(result.current.state).toBe("idle");
    expect(result.current.connected).toBe(true);
  });

  it("registers again after the socket reconnects", () => {
    renderHook(() => usePhoneCall("9876543210"));
    act(() => h.socket.trigger("connect"));
    expect(emitted("phone:register")).toHaveLength(2);
  });

  it("rings again for a call that was still ringing when the page reloaded", () => {
    h.socket.responders["phone:register"] = () => ({ ok: true, activeCall: incoming });
    const { result } = renderHook(() => usePhoneCall("9876543210"));
    expect(result.current.state).toBe("ringing");
    expect(result.current.incoming?.callId).toBe("call1");
  });
});

describe("ringing", () => {
  it("rings on call:incoming and stops the ringtone when the call is answered or missed", async () => {
    const { result } = await ringing();
    expect(result.current.state).toBe("ringing");
    expect(result.current.incoming).toMatchObject({ customerName: "Rohan", subtotalPaise: 149900 });
    expect(h.ringtone.start).toHaveBeenCalled();

    await act(async () => h.socket.trigger("call:ring-cancelled", { callId: "call1" }));
    expect(h.ringtone.stop).toHaveBeenCalled();
  });

  it("shows a missed-call notice when the ring is cancelled", async () => {
    const { result } = await ringing();
    await act(async () => h.socket.trigger("call:ring-cancelled", { callId: "call1" }));
    expect(result.current.state).toBe("idle");
    expect(result.current.missedNotice).toBe("Missed call from ShopNest");
  });

  it("offers to enable sound when the browser blocks the ringtone, and retries on request", async () => {
    h.ringtone.start.mockResolvedValue(false);
    const { result } = await ringing();
    expect(result.current.soundBlocked).toBe(true);

    h.ringtone.start.mockResolvedValue(true);
    await act(async () => result.current.enableSound());
    expect(result.current.soundBlocked).toBe(false);
  });

  it("declining tells the server and returns to idle", async () => {
    const { result } = await ringing();
    await act(async () => result.current.decline());
    expect(emitted("call:decline")[0]?.payload).toEqual({ callId: "call1" });
    expect(result.current.state).toBe("idle");
  });
});

describe("answering", () => {
  it("emits call:answer, speaks the greeting, then starts listening", async () => {
    const { result } = await ringing();
    await act(async () => result.current.answer());
    expect(emitted("call:answer")[0]?.payload).toEqual({ callId: "call1" });
    expect(result.current.state).toBe("speaking");
    expect(h.speech.api.speak).toHaveBeenCalledWith("Hi Rohan, this is Aria from ShopNest.");
    expect(result.current.transcript).toEqual([
      expect.objectContaining({ speaker: "AGENT", text: "Hi Rohan, this is Aria from ShopNest." }),
    ]);

    await finishSpeaking();
    expect(result.current.state).toBe("listening");
    expect(h.recognition.api.start).toHaveBeenCalledTimes(1);
  });

  it("returns to idle with a message when the call is no longer there to answer", async () => {
    h.socket.responders["call:answer"] = () => ({ ok: false, error: "Call is no longer ringing" });
    const { result } = await ringing();
    await act(async () => result.current.answer());
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBe("Call is no longer ringing");
  });
});

describe("turn-taking is half-duplex", () => {
  it("keeps the microphone off while the agent speaks and restarts it afterwards", async () => {
    const { result } = await inCall();
    h.recognition.api.stop.mockClear();
    h.recognition.api.start.mockClear();

    await act(async () =>
      h.socket.trigger("call:agent-reply", {
        callId: "call1",
        text: "Which part?",
        endsCall: false,
      }),
    );
    expect(result.current.state).toBe("speaking");
    expect(h.recognition.api.stop).toHaveBeenCalled();
    expect(h.recognition.api.start).not.toHaveBeenCalled();

    await finishSpeaking();
    expect(result.current.state).toBe("listening");
    expect(h.recognition.api.start).toHaveBeenCalledTimes(1);
  });

  it("does not start the microphone when recognition is unsupported, but still waits for typed input", async () => {
    h.recognition.api.supported = false;
    const { result } = await inCall();
    expect(result.current.state).toBe("listening");
    expect(h.recognition.api.start).not.toHaveBeenCalled();
    expect(result.current.recognition.supported).toBe(false);
  });

  it("does not start the microphone after permission was denied", async () => {
    h.recognition.api.permission = "denied";
    await inCall();
    expect(h.recognition.api.start).not.toHaveBeenCalled();
  });

  it("stays muted after the agent speaks, and resumes on unmute", async () => {
    const { result } = await inCall();
    h.recognition.api.start.mockClear();
    await act(async () => result.current.toggleMute());
    expect(result.current.muted).toBe(true);
    expect(h.recognition.api.stop).toHaveBeenCalled();

    await act(async () =>
      h.socket.trigger("call:agent-reply", { callId: "call1", text: "Hello?", endsCall: false }),
    );
    await finishSpeaking();
    expect(h.recognition.api.start).not.toHaveBeenCalled();

    await act(async () => result.current.toggleMute());
    expect(h.recognition.api.start).toHaveBeenCalledTimes(1);
  });
});

describe("customer turns", () => {
  it("sends typed text as an utterance and waits for the agent", async () => {
    const { result } = await inCall();
    h.recognition.api.stop.mockClear();
    await act(async () => result.current.sendText("  the shipping was too expensive "));
    expect(emitted("call:utterance")[0]?.payload).toEqual({
      callId: "call1",
      text: "the shipping was too expensive",
    });
    expect(result.current.state).toBe("thinking");
    expect(h.recognition.api.stop).toHaveBeenCalled();
    expect(result.current.transcript.at(-1)).toMatchObject({
      speaker: "CUSTOMER",
      text: "the shipping was too expensive",
    });
  });

  it("sends recognised speech the same way", async () => {
    const { result } = await inCall();
    await act(async () => h.recognition.onFinal("it is too costly"));
    expect(emitted("call:utterance")[0]?.payload).toEqual({
      callId: "call1",
      text: "it is too costly",
    });
    expect(result.current.state).toBe("thinking");
  });

  it("ignores blank input and truncates to 500 characters", async () => {
    const { result } = await inCall();
    await act(async () => result.current.sendText("   "));
    expect(emitted("call:utterance")).toHaveLength(0);
    await act(async () => result.current.sendText("a".repeat(600)));
    expect((emitted("call:utterance")[0]?.payload as { text: string }).text).toHaveLength(500);
  });

  it("typing while the agent is talking interrupts the speech", async () => {
    const { result } = await inCall();
    await act(async () =>
      h.socket.trigger("call:agent-reply", {
        callId: "call1",
        text: "Long answer.",
        endsCall: false,
      }),
    );
    h.speech.api.cancel.mockClear();
    await act(async () => result.current.sendText("okay"));
    expect(h.speech.api.cancel).toHaveBeenCalled();
    await finishSpeaking();
    expect(result.current.state).toBe("thinking");
  });

  it("recovers to listening when the server rejects an utterance", async () => {
    h.socket.responders["call:utterance"] = () => ({ ok: false, error: "Call is not in_progress" });
    const { result } = await inCall();
    await act(async () => result.current.sendText("hello"));
    expect(result.current.state).toBe("listening");
    expect(result.current.error).toBe("Call is not in_progress");
  });
});

describe("agent replies and vouchers", () => {
  it("shows the voucher card the server returned and speaks the reply", async () => {
    const { result } = await inCall();
    await act(async () =>
      h.socket.trigger("call:agent-reply", {
        callId: "call1",
        text: "Your code is V R.",
        voucher,
        endsCall: false,
      }),
    );
    expect(result.current.voucher).toEqual(voucher);
    expect(h.speech.api.speak).toHaveBeenLastCalledWith("Your code is V R.");
    expect(result.current.transcript.at(-1)).toMatchObject({
      speaker: "AGENT",
      text: "Your code is V R.",
    });
  });

  it("ignores replies for a different call", async () => {
    const { result } = await inCall();
    await act(async () =>
      h.socket.trigger("call:agent-reply", { callId: "other", text: "Hi", endsCall: false }),
    );
    expect(result.current.transcript).toHaveLength(1);
  });
});

describe("ending", () => {
  it("lets a goodbye finish before showing the ended screen", async () => {
    const { result } = await inCall();
    await act(async () =>
      h.socket.trigger("call:agent-reply", { callId: "call1", text: "Goodbye!", endsCall: true }),
    );
    await act(async () =>
      h.socket.trigger("call:ended", { callId: "call1", outcome: "ACCEPTED_OFFER" }),
    );
    expect(result.current.state).toBe("speaking");

    h.recognition.api.start.mockClear();
    await finishSpeaking();
    expect(result.current.state).toBe("ended");
    expect(result.current.ended).toMatchObject({ callId: "call1", outcome: "ACCEPTED_OFFER" });
    expect(h.recognition.api.start).not.toHaveBeenCalled();
  });

  it("does not listen again after the agent ends the call, even before call:ended arrives", async () => {
    const { result } = await inCall();
    h.recognition.api.start.mockClear();
    await act(async () =>
      h.socket.trigger("call:agent-reply", { callId: "call1", text: "Goodbye!", endsCall: true }),
    );
    await finishSpeaking();
    expect(h.recognition.api.start).not.toHaveBeenCalled();
    expect(result.current.state).not.toBe("listening");
  });

  it("shows the ended screen at once when the call ends while listening", async () => {
    const { result } = await inCall();
    await act(async () =>
      h.socket.trigger("call:ended", { callId: "call1", outcome: "UNDECIDED" }),
    );
    expect(result.current.state).toBe("ended");
    expect(h.recognition.api.stop).toHaveBeenCalled();
    expect(h.speech.api.cancel).toHaveBeenCalled();
  });

  it("hang up tells the server, silences speech and the mic, and waits for call:ended", async () => {
    const { result } = await inCall();
    await act(async () => result.current.hangup());
    expect(emitted("call:hangup")[0]?.payload).toEqual({ callId: "call1" });
    expect(h.speech.api.cancel).toHaveBeenCalled();
    expect(result.current.hangingUp).toBe(true);
    await act(async () =>
      h.socket.trigger("call:ended", { callId: "call1", outcome: "ACCEPTED_OFFER" }),
    );
    expect(result.current.state).toBe("ended");
  });

  it("returns to the lock screen after 10 seconds but keeps the voucher", async () => {
    const { result } = await inCall();
    await act(async () =>
      h.socket.trigger("call:agent-reply", {
        callId: "call1",
        text: "Code.",
        voucher,
        endsCall: false,
      }),
    );
    await finishSpeaking();
    vi.useFakeTimers();
    await act(async () =>
      h.socket.trigger("call:ended", { callId: "call1", outcome: "ACCEPTED_OFFER" }),
    );
    expect(result.current.state).toBe("ended");
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(result.current.state).toBe("idle");
    expect(result.current.ended).toBeUndefined();
    expect(result.current.transcript).toEqual([]);
    expect(result.current.voucher).toEqual(voucher);
  });

  it("dismissEnded goes idle immediately", async () => {
    const { result } = await inCall();
    await act(async () =>
      h.socket.trigger("call:ended", { callId: "call1", outcome: "UNDECIDED" }),
    );
    act(() => result.current.dismissEnded());
    expect(result.current.state).toBe("idle");
  });

  it("clears the last voucher when the next call is answered", async () => {
    const { result } = await inCall();
    await act(async () =>
      h.socket.trigger("call:agent-reply", {
        callId: "call1",
        text: "Code.",
        voucher,
        endsCall: false,
      }),
    );
    await finishSpeaking();
    await act(async () =>
      h.socket.trigger("call:ended", { callId: "call1", outcome: "ACCEPTED_OFFER" }),
    );
    act(() => result.current.dismissEnded());

    await act(async () => h.socket.trigger("call:incoming", { ...incoming, callId: "call2" }));
    await act(async () => result.current.answer());
    expect(result.current.voucher).toBeUndefined();
  });
});
