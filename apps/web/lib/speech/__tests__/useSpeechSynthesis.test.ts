import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickVoice, splitSentences, useSpeechSynthesis } from "../useSpeechSynthesis";

class FakeUtterance {
  text: string;
  lang = "";
  rate = 0;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const voice = (lang: string, name = lang) => ({ lang, name }) as SpeechSynthesisVoice;

let spoken: FakeUtterance[];
let voices: SpeechSynthesisVoice[];
let listeners: Record<string, () => void>;
const synth = {
  speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
  cancel: vi.fn(),
  getVoices: () => voices,
  addEventListener: (name: string, fn: () => void) => {
    listeners[name] = fn;
  },
  removeEventListener: vi.fn(),
};

beforeEach(() => {
  spoken = [];
  voices = [voice("en-US"), voice("en-IN", "Heera"), voice("hi-IN")];
  listeners = {};
  synth.speak.mockClear();
  synth.cancel.mockClear();
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error cleaning up the fake
  delete window.speechSynthesis;
});

describe("splitSentences", () => {
  it("splits on sentence boundaries and keeps the punctuation", () => {
    expect(splitSentences("One. Two? Three!")).toEqual(["One.", "Two?", "Three!"]);
  });
  it("keeps a trailing fragment and drops blanks", () => {
    expect(splitSentences("  Hello there.  And you ")).toEqual(["Hello there.", "And you"]);
    expect(splitSentences("   ")).toEqual([]);
  });
  it("does not split inside a rupee amount", () => {
    expect(splitSentences("That is ₹1,499.50 in total. Thanks.")).toEqual([
      "That is ₹1,499.50 in total.",
      "Thanks.",
    ]);
  });
});

describe("pickVoice", () => {
  it("prefers en-IN, then any English, then nothing", () => {
    expect(pickVoice([voice("en-US"), voice("en-IN")])?.lang).toBe("en-IN");
    expect(pickVoice([voice("fr-FR"), voice("en-GB")])?.lang).toBe("en-GB");
    expect(pickVoice([voice("fr-FR")])).toBeUndefined();
  });
});

describe("useSpeechSynthesis", () => {
  it("speaks one utterance per sentence and resolves after the last one ends", async () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    let resolved = false;
    let promise!: Promise<void>;
    act(() => {
      promise = result.current.speak("One. Two? Three!").then(() => {
        resolved = true;
      });
    });
    expect(spoken).toHaveLength(1);
    expect(result.current.speaking).toBe(true);

    await act(async () => spoken[0]!.onend?.());
    expect(spoken).toHaveLength(2);
    await act(async () => spoken[1]!.onend?.());
    expect(spoken).toHaveLength(3);
    expect(resolved).toBe(false);
    await act(async () => spoken[2]!.onend?.());
    await promise;
    expect(resolved).toBe(true);
    expect(result.current.speaking).toBe(false);
    expect(spoken.map((u) => u.text)).toEqual(["One.", "Two?", "Three!"]);
  });

  it("uses en-IN, the Indian-English voice, at normal rate", () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => {
      void result.current.speak("Hello there.");
    });
    expect(spoken[0]).toMatchObject({ lang: "en-IN", rate: 1 });
    expect((spoken[0]!.voice as SpeechSynthesisVoice).name).toBe("Heera");
  });

  it("picks up voices that load late", () => {
    voices = [];
    const { result } = renderHook(() => useSpeechSynthesis());
    voices = [voice("en-IN", "Late")];
    act(() => listeners.voiceschanged?.());
    act(() => {
      void result.current.speak("Hi.");
    });
    expect((spoken[0]!.voice as SpeechSynthesisVoice).name).toBe("Late");
  });

  it("continues past an utterance error so the call never stalls", async () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    let promise!: Promise<void>;
    act(() => {
      promise = result.current.speak("One. Two.");
    });
    await act(async () => spoken[0]!.onerror?.());
    await act(async () => spoken[1]!.onend?.());
    await promise;
    expect(result.current.speaking).toBe(false);
  });

  it("cancel() stops the queue and resolves the pending promise", async () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    let promise!: Promise<void>;
    act(() => {
      promise = result.current.speak("One. Two. Three.");
    });
    act(() => result.current.cancel());
    // The browser fires onend/onerror for the cancelled utterance; nothing more should be spoken.
    await act(async () => spoken[0]!.onerror?.());
    await promise;
    expect(synth.cancel).toHaveBeenCalled();
    expect(spoken).toHaveLength(1);
    expect(result.current.speaking).toBe(false);
  });

  it("does not stall the call when the browser never reports that an utterance ended", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSpeechSynthesis());
      let done = false;
      act(() => {
        void result.current.speak("One. Two.").then(() => {
          done = true;
        });
      });
      expect(spoken).toHaveLength(1);
      // No onend ever fires: a watchdog moves on after a time based on the sentence length.
      await act(async () => vi.advanceTimersByTime(3000));
      expect(spoken).toHaveLength(2);
      expect(done).toBe(false);
      await act(async () => vi.advanceTimersByTime(3000));
      expect(done).toBe(true);
      expect(result.current.speaking).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire the watchdog after the utterance ended normally", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSpeechSynthesis());
      act(() => {
        void result.current.speak("One. Two.");
      });
      await act(async () => spoken[0]!.onend?.());
      expect(spoken).toHaveLength(2);
      await act(async () => vi.advanceTimersByTime(1500));
      // The first sentence's watchdog must not have advanced the queue a second time.
      expect(spoken).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves immediately when speech synthesis is unavailable", async () => {
    // @ts-expect-error simulate an unsupported browser
    delete window.speechSynthesis;
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.supported).toBe(false);
    await expect(result.current.speak("Hello.")).resolves.toBeUndefined();
  });
});
