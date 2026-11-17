"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ApiClientError, api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const PRESETS = [
  { label: "10 s", seconds: 10 },
  { label: "30 s", seconds: 30 },
  { label: "2 min", seconds: 120 },
];

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

type Notice = { kind: "ok" | "error"; text: string };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-ink border-t-2 py-6">
      <h2 className="display mb-3 text-3xl">{title}</h2>
      {children}
    </section>
  );
}

/** Everything a presenter needs to run the demo: pace it, trigger it, refill it, start over. */
export function DemoControls() {
  const [config, setConfig] = useState<{ abandonDelayMs: number; mockLlm: boolean }>();
  const [loadError, setLoadError] = useState<string>();
  const [seconds, setSeconds] = useState(30);
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState<string>();
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(() => {
    setLoadError(undefined);
    api
      .getDemoConfig()
      .then((c) => {
        setConfig(c);
        setSeconds(Math.round(c.abandonDelayMs / 1000));
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  useEffect(load, [load]);

  const run = async (name: string, action: () => Promise<Notice | void>) => {
    setBusy(name);
    setNotice(undefined);
    try {
      const result = await action();
      if (result) setNotice(result);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "That did not work." });
    } finally {
      setBusy(undefined);
    }
  };

  if (loadError) {
    return (
      <div role="alert" className="border-kumkum border-2 p-6">
        <p className="display text-3xl">Demo settings did not load.</p>
        <p className="mt-2 mb-4">{loadError}</p>
        <Button onClick={load}>Try again</Button>
      </div>
    );
  }
  if (!config) return <p>Loading demo settings…</p>;

  return (
    <div className="max-w-[44rem]">
      <p className="mb-4">
        <Badge tone={config.mockLlm ? "marigold" : "leaf"} className="px-3">
          {config.mockLlm ? "Mock AI is on" : "Gemini is on"}
        </Badge>
      </p>

      {notice ? (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mb-2 font-semibold ${notice.kind === "error" ? "text-kumkum" : "text-leaf"}`}
        >
          {notice.text}
        </p>
      ) : null}

      <Section title="Abandon delay">
        <p className="mb-4">
          How long after checkout starts the phone rings if the order is not placed.
        </p>
        <div className="mb-4 flex items-center gap-4">
          <input
            type="range"
            min={5}
            max={600}
            step={5}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            aria-label="Abandon delay in seconds"
            className="accent-ink min-w-0 flex-1"
          />
          <span className="num display w-28 text-right text-3xl">{formatSeconds(seconds)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {PRESETS.map((p) => (
            <Button key={p.label} variant="quiet" onClick={() => setSeconds(p.seconds)}>
              {p.label}
            </Button>
          ))}
          <Button
            loading={busy === "delay"}
            onClick={() =>
              run("delay", async () => {
                const saved = await api.setDemoDelay(seconds * 1000);
                setConfig(saved);
                return {
                  kind: "ok",
                  text: `Calls now ring ${formatSeconds(saved.abandonDelayMs / 1000)} after checkout.`,
                };
              })
            }
          >
            Save delay
          </Button>
        </div>
      </Section>

      <Section title="Try it">
        <p className="mb-4">
          Skip the wait and ring the newest customer who started checkout and ticked the call box.
        </p>
        <Button
          variant="ink"
          loading={busy === "ring"}
          onClick={() =>
            run("ring", async () => {
              try {
                await api.triggerLatest();
                return { kind: "ok", text: "Ringing now." };
              } catch (err) {
                if (err instanceof ApiClientError && err.status === 404) {
                  return {
                    kind: "error",
                    text: "No cart is waiting for a call. Start a checkout and tick the call box first.",
                  };
                }
                throw err;
              }
            })
          }
        >
          Ring the phone now
        </Button>
      </Section>

      <Section title="Products">
        <p className="mb-4">Reload the shop&rsquo;s products from the dummyjson catalogue.</p>
        <Button
          variant="ink"
          loading={busy === "sync"}
          onClick={() =>
            run("sync", async () => {
              const result = await api.syncCatalogue();
              if (result.source === "dummyjson") {
                return { kind: "ok", text: `${result.synced} products loaded from dummyjson.` };
              }
              return {
                kind: "error",
                text:
                  result.source === "kept"
                    ? `Could not reach dummyjson, so the ${result.synced} products already on the shelves were kept.`
                    : "Could not reach dummyjson, so the built-in products were loaded instead.",
              };
            })
          }
        >
          Refresh products
        </Button>
      </Section>

      <Section title="Start over">
        <p className="mb-4">
          Deletes the calls, carts, vouchers and orders made in this demo. Seeded history and the
          products stay.
        </p>
        {confirmReset ? (
          <div
            role="alertdialog"
            aria-labelledby="reset-title"
            aria-describedby="reset-text"
            className="border-kumkum border-2 p-5"
          >
            <p id="reset-title" className="display mb-2 text-3xl">
              Delete this demo&rsquo;s data?
            </p>
            <p id="reset-text" className="mb-4">
              This removes the calls, carts, vouchers and orders made in this demo. It cannot be
              undone.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="ink" autoFocus onClick={() => setConfirmReset(false)}>
                Keep my data
              </Button>
              <button
                type="button"
                className="bg-kumkum text-paper hover:bg-ink min-h-12 cursor-pointer px-6 font-semibold transition-colors"
                onClick={() => {
                  setConfirmReset(false);
                  void run("reset", async () => {
                    await api.resetDemo();
                    return { kind: "ok", text: "Demo reset. Seeded history is untouched." };
                  });
                }}
              >
                Delete demo data
              </button>
            </div>
          </div>
        ) : (
          <Button variant="ink" loading={busy === "reset"} onClick={() => setConfirmReset(true)}>
            Reset demo
          </Button>
        )}
      </Section>
    </div>
  );
}
