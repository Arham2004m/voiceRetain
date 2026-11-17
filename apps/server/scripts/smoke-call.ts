/**
 * End-to-end smoke test for the call flow against a running dev server:
 * webhook → incoming → answer → utterance → agent reply → hang up → call ENDED in the DB.
 *
 *   SERVER_URL=http://localhost:4000 PHONE=9876543210 tsx scripts/smoke-call.ts
 * Optionally pass utterances as arguments; each is sent in order.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { io } from "socket.io-client";
import { createPrisma } from "../src/db/prisma";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const SERVER = process.env.SERVER_URL ?? "http://localhost:4000";
const PHONE = process.env.PHONE ?? "9876543210";
const utterances = process.argv.slice(2);
if (utterances.length === 0) utterances.push("hello there");

const log = (msg: string, extra?: unknown) =>
  console.log(`[smoke] ${msg}`, extra === undefined ? "" : extra);

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`timed out waiting for ${what}`)), ms),
    ),
  ]);

async function main() {
  const socket = io(SERVER, { transports: ["websocket"] });
  await withTimeout(new Promise<void>((r) => socket.on("connect", () => r())), 5000, "connect");

  const ask = (event: string, payload?: unknown): Promise<any> =>
    new Promise((resolve) =>
      (socket as any).emit(event, ...(payload ? [payload, resolve] : [resolve])),
    );
  const next = <T>(event: string, ms = 60_000): Promise<T> =>
    withTimeout(new Promise<T>((r) => (socket as any).once(event, r)), ms, event);

  log("register", await ask("phone:register", { phone: PHONE }));

  const products = (await (await fetch(`${SERVER}/api/products`)).json()) as { id: string }[];
  const incoming = next<{ callId: string; customerName: string }>("call:incoming");
  const hook = await fetch(`${SERVER}/api/cart-abandoned`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customer: { name: "Rohan", phone: PHONE, consentToCall: true },
      items: [{ productId: products[0]!.id, quantity: 1 }],
    }),
  });
  log("webhook", await hook.json());

  const { callId, customerName } = await incoming;
  log(`incoming call for ${customerName}`, callId);

  const answered = await ask("call:answer", { callId });
  log("answered; greeting:", answered.greeting?.text);

  const ended = next<{ outcome: string }>("call:ended");
  let agentEnded = false;
  for (const text of utterances) {
    const reply = next<{
      text: string;
      voucher?: { code: string; percent: number };
      endsCall: boolean;
    }>("call:agent-reply");
    await ask("call:utterance", { callId, text });
    const r = await reply;
    log(`> ${text}`);
    log(`< ${r.text}`, r.voucher ?? "");
    if (r.endsCall) {
      agentEnded = true;
      break;
    }
  }
  if (!agentEnded) await ask("call:hangup", { callId });
  log(agentEnded ? "ended by the agent:" : "ended by hang-up:", await ended);

  const prisma = createPrisma(process.env.DATABASE_URL!);
  const row = await prisma.callLog.findUniqueOrThrow({ where: { id: callId } });
  log("db row", {
    status: row.status,
    outcome: row.outcome,
    endReason: row.endReason,
    durationSec: row.durationSec,
  });
  await prisma.$disconnect();
  socket.disconnect();
  if (row.status !== "ENDED") throw new Error("call is not ENDED in the database");
  log("OK");
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err.message);
  process.exit(1);
});
