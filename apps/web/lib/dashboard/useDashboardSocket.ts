"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CallSummaryDTO, DashboardMetrics, TranscriptTurnDTO } from "@voiceretain/shared";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export interface LiveCall {
  call: CallSummaryDTO;
  turns: TranscriptTurnDTO[];
}

const RECENT = 10;
const isActive = (c: CallSummaryDTO) => c.status === "RINGING" || c.status === "IN_PROGRESS";

/** Turns already streamed in plus those loaded from the server, once each, oldest first. */
function mergeTurns(
  loaded: TranscriptTurnDTO[],
  streamed: TranscriptTurnDTO[],
): TranscriptTurnDTO[] {
  const byId = new Map<string, TranscriptTurnDTO>();
  for (const t of [...loaded, ...streamed]) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * The overview's live data: first loaded over REST, then kept current by Socket.IO events. The
 * "live call" is the call in progress, and stays on screen (marked ended) until the next call
 * starts, so the merchant can read how it finished.
 */
export function useDashboardSocket() {
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [recentCalls, setRecentCalls] = useState<CallSummaryDTO[]>([]);
  const [liveCall, setLiveCall] = useState<LiveCall>();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const liveId = useRef<string | undefined>(undefined);

  const showLive = useCallback((next: LiveCall | undefined) => {
    liveId.current = next?.call.id;
    setLiveCall(next);
  }, []);

  const loadTurns = useCallback(async (id: string) => {
    try {
      const detail = await api.getCall(id);
      setLiveCall((cur) =>
        cur && cur.call.id === id ? { ...cur, turns: mergeTurns(detail.turns, cur.turns) } : cur,
      );
    } catch {
      /* the turns still arrive live */
    }
  }, []);

  const refreshCalls = useCallback(async () => {
    const page = await api.listCalls({ limit: RECENT });
    setRecentCalls(page.items);
    return page.items;
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [m, calls] = await Promise.all([api.getMetrics(), refreshCalls()]);
      setMetrics(m);
      setError(undefined);
      const active = calls.find(isActive);
      if (active && liveId.current !== active.id) {
        showLive({ call: active, turns: [] });
        void loadTurns(active.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [loadTurns, refreshCalls, showLive]);

  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit("dashboard:join", () => undefined);
    let first = true;

    const onConnect = () => {
      setConnected(true);
      join();
      // After a reconnect, events may have been missed.
      if (!first) void loadAll();
      first = false;
    };
    const onDisconnect = () => setConnected(false);

    const onCallUpdated = (call: CallSummaryDTO) => {
      setRecentCalls((list) =>
        list.some((c) => c.id === call.id)
          ? list.map((c) => (c.id === call.id ? call : c))
          : [call, ...list].slice(0, RECENT),
      );
      if (isActive(call)) {
        if (liveId.current !== call.id) {
          showLive({ call, turns: [] });
          void loadTurns(call.id);
        } else {
          setLiveCall((cur) => (cur ? { ...cur, call } : cur));
        }
      } else if (liveId.current === call.id) {
        setLiveCall((cur) => (cur ? { ...cur, call } : cur));
      }
    };

    const onTurn = ({ callId, turn }: { callId: string; turn: TranscriptTurnDTO }) => {
      setLiveCall((cur) =>
        cur && cur.call.id === callId && !cur.turns.some((t) => t.id === turn.id)
          ? { ...cur, turns: [...cur.turns, turn] }
          : cur,
      );
    };

    const onMetrics = (m: DashboardMetrics) => {
      setMetrics(m);
      void refreshCalls().catch(() => undefined);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("dashboard:call-updated", onCallUpdated);
    socket.on("dashboard:turn", onTurn);
    socket.on("dashboard:metrics", onMetrics);
    if (socket.connected) onConnect();
    void loadAll();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("dashboard:call-updated", onCallUpdated);
      socket.off("dashboard:turn", onTurn);
      socket.off("dashboard:metrics", onMetrics);
    };
    // loadAll only changes if its own dependencies do, and those are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { metrics, recentCalls, liveCall, connected, loading, error };
}
