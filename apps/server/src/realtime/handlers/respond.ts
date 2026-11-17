import { ZodError } from "zod";
import { CallError } from "../../calls/call.service";
import { logger } from "../../lib/logger";

/** Runs a handler body and reports the result through the socket ack as { ok, ... }. */
export async function respond(ack: unknown, body: () => Promise<object | void>): Promise<void> {
  if (typeof ack !== "function") return;
  try {
    const extra = await body();
    ack({ ok: true, ...(extra ?? {}) });
  } catch (err) {
    if (err instanceof CallError) return void ack({ ok: false, error: err.message });
    if (err instanceof ZodError) return void ack({ ok: false, error: "Invalid payload" });
    logger.error({ err }, "socket handler failed");
    ack({ ok: false, error: "Internal error" });
  }
}
