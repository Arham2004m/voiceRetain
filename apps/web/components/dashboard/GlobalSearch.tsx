"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SearchResults } from "@voiceretain/shared";
import { api } from "@/lib/api";
import { formatPhone } from "@/lib/format";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

function Group({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={title} className="border-ink/20 border-b py-2 last:border-b-0">
      <p className="text-ink-soft px-3 pb-1 text-sm font-semibold">{title}</p>
      {empty ? <p className="px-3 py-1 text-sm">No results</p> : <ul>{children}</ul>}
    </div>
  );
}

const itemLink = "hover:bg-marigold block px-3 py-2";

/** Header search: customers, calls and vouchers, after a 300 ms pause in typing. */
export function GlobalSearch() {
  const [value, setValue] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const onChange = (next: string) => {
    setValue(next);
    clearTimeout(timer.current);
    const q = next.trim();
    if (q.length < MIN_CHARS) {
      latest.current++; // a late answer for an older query must not appear
      setResults(null);
      setFailed(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const mine = ++latest.current;
      try {
        const found = await api.search(q);
        if (mine !== latest.current) return;
        setResults(found);
        setFailed(false);
        setOpen(true);
      } catch {
        if (mine !== latest.current) return;
        setFailed(true);
        setOpen(true);
      }
    }, DEBOUNCE_MS);
  };

  const reset = () => {
    clearTimeout(timer.current);
    latest.current++;
    setValue("");
    setResults(null);
    setFailed(false);
    setOpen(false);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close]);

  const showPanel = open && (failed || results !== null);

  return (
    <div ref={root} className="relative w-full max-w-[28rem]">
      <input
        role="combobox"
        aria-label="Search customers, calls and vouchers"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        type="search"
        autoComplete="off"
        placeholder="Search customers, calls, vouchers"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") reset();
        }}
        className="bg-paper border-ink min-h-11 w-full border-2 px-3"
      />
      {showPanel ? (
        <div
          id={listId}
          className="bg-paper border-ink absolute top-full right-0 left-0 z-50 mt-1 max-h-[26rem] overflow-y-auto border-2"
        >
          {failed ? (
            <p role="alert" className="text-kumkum px-3 py-3 font-medium">
              Search is unavailable right now.
            </p>
          ) : results ? (
            <>
              <Group title="Customers" empty={results.customers.length === 0}>
                {results.customers.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/calls?customerId=${c.id}`}
                      className={itemLink}
                      onClick={reset}
                    >
                      <span className="font-semibold">{c.name}</span>{" "}
                      <span className="num text-ink-soft text-sm">{formatPhone(c.phone)}</span>
                    </Link>
                  </li>
                ))}
              </Group>
              <Group title="Calls" empty={results.calls.length === 0}>
                {results.calls.map((c) => (
                  <li key={c.id}>
                    <Link href={`/dashboard/calls/${c.id}`} className={itemLink} onClick={reset}>
                      <span className="font-semibold">{c.customerName}</span>
                      {c.summary ? (
                        <span className="text-ink-soft block text-sm">{c.summary}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </Group>
              <Group title="Vouchers" empty={results.vouchers.length === 0}>
                {results.vouchers.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={v.callId ? `/dashboard/calls/${v.callId}` : "/dashboard/vouchers"}
                      className={itemLink}
                      onClick={reset}
                    >
                      <span className="font-mono font-semibold">{v.code}</span>{" "}
                      <span className="text-ink-soft text-sm">{v.percent}% off</span>
                    </Link>
                  </li>
                ))}
              </Group>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
