import { DASHBOARD_ROOM, type AppSocket } from "../socket";
import { respond } from "./respond";

export function registerDashboardHandlers(socket: AppSocket): void {
  socket.on("dashboard:join", (ack) =>
    respond(ack, async () => {
      await socket.join(DASHBOARD_ROOM);
    }),
  );
}
