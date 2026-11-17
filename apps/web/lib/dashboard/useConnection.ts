"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

/** Whether the live connection to the server is up, for the header's status light. */
export function useConnection(): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const socket = getSocket();
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    socket.on("connect", up);
    socket.on("disconnect", down);
    setConnected(socket.connected);
    return () => {
      socket.off("connect", up);
      socket.off("disconnect", down);
    };
  }, []);
  return connected;
}
