"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";

type Handlers = Partial<{
  "dashboard:call-updated": (p: never) => void;
  "dashboard:turn": (p: never) => void;
  "dashboard:metrics": (p: never) => void;
}>;

/**
 * Joins the dashboard room (the server only broadcasts to sockets that did) and listens for the
 * given events. Rejoins after a reconnect; `onReconnect` lets a page refetch what it missed.
 * The handlers can change every render: the latest ones are always the ones that run.
 */
export function useDashboardEvents(handlers: Handlers, onReconnect?: () => void) {
  const latest = useRef(handlers);
  latest.current = handlers;
  const reconnect = useRef(onReconnect);
  reconnect.current = onReconnect;

  useEffect(() => {
    const socket = getSocket();
    let first = true;
    const join = () => {
      socket.emit("dashboard:join", () => undefined);
      if (!first) reconnect.current?.();
      first = false;
    };
    const events = Object.keys(latest.current) as (keyof Handlers)[];
    const wrappers = events.map((event) => {
      const wrapper = (payload: never) => latest.current[event]?.(payload);
      socket.on(event as never, wrapper as never);
      return [event, wrapper] as const;
    });
    socket.on("connect", join);
    if (socket.connected) join();
    return () => {
      for (const [event, wrapper] of wrappers) socket.off(event as never, wrapper as never);
      socket.off("connect", join);
    };
  }, []);
}
