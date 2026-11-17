"use client";

import { useCallback, useEffect, useState } from "react";
import type { CallDetailDTO, TranscriptTurnDTO } from "@voiceretain/shared";
import { ApiClientError, api } from "@/lib/api";
import { useDashboardEvents } from "./useDashboardRoom";

/** One call in full. While it is in progress, new turns appear as they are spoken. */
export function useCallDetail(id: string) {
  const [call, setCall] = useState<CallDetailDTO>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      setCall(await api.getCall(id));
      setError(undefined);
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) setNotFound(true);
      else setError(err instanceof Error ? err.message : "Could not load this call.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useDashboardEvents(
    {
      "dashboard:turn": ({ callId, turn }: { callId: string; turn: TranscriptTurnDTO }) => {
        if (callId !== id) return;
        setCall((cur) =>
          cur && !cur.turns.some((t) => t.id === turn.id)
            ? { ...cur, turns: [...cur.turns, turn] }
            : cur,
        );
      },
      // Outcome, summary, vouchers and the order all settle when the call changes: take them fresh.
      "dashboard:call-updated": (updated: { id: string }) => {
        if (updated.id === id) void load();
      },
    },
    () => void load(),
  );

  return { call, loading, error, notFound };
}
