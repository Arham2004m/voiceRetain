import { z } from "zod";
import { MAX_UTTERANCE_CHARS, phoneField } from "@voiceretain/shared";
import { CallError, type CallService } from "../../calls/call.service";
import { logger } from "../../lib/logger";
import { phoneRoom, type AppIo, type AppSocket } from "../socket";
import { respond } from "./respond";

const RegisterPayload = z.object({ phone: phoneField });
const CallPayload = z.object({ callId: z.string().min(1) });
const UtterancePayload = CallPayload.extend({ text: z.string().max(MAX_UTTERANCE_CHARS * 4) });

function requirePhone(socket: AppSocket): string {
  const phone = socket.data.phone;
  if (!phone) throw new CallError("FORBIDDEN", "Register your phone first");
  return phone;
}

export function registerPhoneHandlers(io: AppIo, socket: AppSocket, calls: CallService): void {
  socket.on("phone:register", (payload, ack) =>
    respond(ack, async () => {
      const { phone } = RegisterPayload.parse(payload);
      const previous = socket.data.phone;
      if (previous && previous !== phone) await socket.leave(phoneRoom(previous));
      socket.data.phone = phone;
      await socket.join(phoneRoom(phone));
      await calls.handleReconnect(phone);
      const activeCall = await calls.getActiveCallForPhone(phone);
      return activeCall ? { activeCall } : {};
    }),
  );

  socket.on("call:answer", (payload, ack) =>
    respond(ack, async () => {
      const { callId } = CallPayload.parse(payload);
      return { greeting: await calls.answerCall(callId, requirePhone(socket)) };
    }),
  );

  socket.on("call:decline", (payload, ack) =>
    respond(ack, async () => {
      const { callId } = CallPayload.parse(payload);
      await calls.declineCall(callId, requirePhone(socket));
    }),
  );

  socket.on("call:utterance", (payload, ack) =>
    respond(ack, async () => {
      const { callId, text } = UtterancePayload.parse(payload);
      const phone = requirePhone(socket);
      await calls.assertCallAccess(callId, phone, "IN_PROGRESS");
      // The reply arrives as call:agent-reply; the ack only confirms the utterance was accepted.
      calls
        .handleUtterance(callId, phone, text)
        .catch((err) => logger.error({ err, callId }, "utterance handling failed"));
    }),
  );

  socket.on("call:hangup", (payload, ack) =>
    respond(ack, async () => {
      const { callId } = CallPayload.parse(payload);
      const phone = requirePhone(socket);
      await calls.assertCallAccess(callId, phone, "IN_PROGRESS");
      calls
        .endCall(callId, "CUSTOMER_HANGUP")
        .catch((err) => logger.error({ err, callId }, "hangup failed"));
    }),
  );

  socket.on("disconnect", async () => {
    const phone = socket.data.phone;
    if (!phone) return;
    // Another tab for the same phone may still be connected.
    const remaining = await io.in(phoneRoom(phone)).fetchSockets();
    if (remaining.length === 0) {
      calls
        .handleDisconnect(phone)
        .catch((err) => logger.error({ err }, "disconnect handling failed"));
    }
  });
}
