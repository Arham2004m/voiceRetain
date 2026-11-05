import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@voiceretain/shared";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | undefined;

/** One shared connection per tab. Browser only: call it from effects, not during render. */
export function getSocket(): AppSocket {
  socket ??= io(process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000", {
    autoConnect: true,
    reconnection: true,
    transports: ["websocket"],
  });
  return socket;
}
