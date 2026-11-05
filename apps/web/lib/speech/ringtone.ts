export interface Ringtone {
  /** Resolves true when the ring is audible, false if the browser is still blocking audio. */
  start(): Promise<boolean>;
  stop(): void;
  /** Call from a click handler so the browser allows sound later (autoplay policy). */
  unlock(): Promise<void>;
}

const RING_HZ = [440, 480];
const BURST_MS = 6000; // 2 s ringing, 4 s silence
const RING_SECONDS = 2;

function audioContextCtor(): (new () => AudioContext) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

/** A classic two-tone phone ring generated with Web Audio, so there is no audio file to ship. */
export function createRingtone(): Ringtone {
  let ctx: AudioContext | undefined;
  let gain: GainNode | undefined;
  let oscillators: OscillatorNode[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  const context = (): AudioContext | undefined => {
    if (ctx) return ctx;
    const Ctor = audioContextCtor();
    if (Ctor) ctx = new Ctor();
    return ctx;
  };

  const resume = async (c: AudioContext) => {
    if (c.state === "running") return;
    try {
      await c.resume();
    } catch {
      /* stays suspended */
    }
  };

  const burst = () => {
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.setValueAtTime(0, now + RING_SECONDS);
  };

  return {
    async start() {
      if (oscillators.length > 0) return true;
      const c = context();
      if (!c) return false;
      await resume(c);
      if (c.state !== "running") return false;
      if (oscillators.length > 0) return true; // another start() won the race

      gain = c.createGain();
      gain.gain.value = 0;
      gain.connect(c.destination);
      oscillators = RING_HZ.map((hz) => {
        const osc = c.createOscillator();
        osc.type = "sine";
        osc.frequency.value = hz;
        osc.connect(gain!);
        osc.start();
        return osc;
      });
      burst();
      timer = setInterval(burst, BURST_MS);
      return true;
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      for (const osc of oscillators) {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
        osc.disconnect();
      }
      oscillators = [];
      gain?.disconnect();
      gain = undefined;
    },

    async unlock() {
      const c = context();
      if (c) await resume(c);
    },
  };
}

let shared: Ringtone | undefined;
/** One ringtone per tab, so the unlocking click and the later ring use the same audio context. */
export function getRingtone(): Ringtone {
  shared ??= createRingtone();
  return shared;
}
