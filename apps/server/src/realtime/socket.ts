import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@voiceretain/shared";
import type { Env } from "../config/env";
import type { CallService } from "../calls/call.service";
import type { Emitter } from "./emitter";
import { registerDashboardHandlers } from "./handlers/dashboard.handlers";
import { registerPhoneHandlers } from "./handlers/phone.handlers";

export interface SocketData {
  phone?: string;
}

export type AppIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export const phoneRoom = (phone: string) => `phone:${phone}`;
export const DASHBOARD_ROOM = "dashboard";

/** Creates the Socket.IO server and the Emitter that services use to publish to rooms. */
export function createSocketServer(
  httpServer: HttpServer,
  deps: { env: Pick<Env, "WEB_ORIGIN"> },
): { io: AppIo; emitter: Emitter } {
  const io: AppIo = new Server(httpServer, { cors: { origin: deps.env.WEB_ORIGIN } });
  const emitter: Emitter = {
    toPhone: (phone, event, payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (io.to(phoneRoom(phone)) as any).emit(event, payload);
    },
    toDashboard: (event, payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (io.to(DASHBOARD_ROOM) as any).emit(event, payload);
    },
  };
  return { io, emitter };
}

/** Wires the event handlers once the CallService (which needs the emitter) exists. */
export function attachSocketHandlers(io: AppIo, deps: { callService: CallService }): void {
  io.on("connection", (socket) => {
    registerPhoneHandlers(io, socket, deps.callService);
    registerDashboardHandlers(socket);
  });
}
