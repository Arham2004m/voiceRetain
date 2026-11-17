import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientToServerEvents, ServerToClientEvents } from "@voiceretain/shared";
import { createCallService, type CallService } from "../calls/call.service";
import { createSocketServer, attachSocketHandlers, type AppIo } from "../realtime/socket";
import { FakeCallTimers } from "./setup/fake-timers";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const ctx = createTestContext();
let httpServer: HttpServer;
let io: AppIo;
let service: CallService;
let timers: FakeCallTimers;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  await ctx.reset();
  timers = new FakeCallTimers();
  httpServer = createServer();
  const socketServer = createSocketServer(httpServer, { env: ctx.env });
  io = socketServer.io;
  service = createCallService({
    db: ctx.prisma,
    redis: ctx.redis,
    emitter: socketServer.emitter,
    timers,
    env: ctx.env,
    agent: { runTurn: vi.fn() },
    analyzer: { analyze: vi.fn() },
    metrics: { schedule: vi.fn() },
  });
  attachSocketHandlers(io, { callService: service });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await io.close();
});
afterAll(() => ctx.close());

async function connect(): Promise<Client> {
  const client: Client = ioClient(url, { transports: ["websocket"], forceNew: true });
  clients.push(client);
  await new Promise<void>((resolve) => client.on("connect", () => resolve()));
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ask = <T = any>(client: Client, event: string, payload?: unknown): Promise<T> =>
  new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any[] = payload === undefined ? [resolve] : [payload, resolve];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).emit(event, ...args);
  });

const once = <T>(client: Client, event: string): Promise<T> =>
  new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).once(event, resolve);
  });

describe("phone sockets", () => {
  it("register joins the phone room and receives call:incoming", async () => {
    const client = await connect();
    expect(await ask(client, "phone:register", { phone: "9876543210" })).toEqual({ ok: true });
    const incoming = once<{ callId: string; customerName: string }>(client, "call:incoming");
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    expect(await incoming).toMatchObject({ callId: call.id, customerName: "Rohan" });
  });

  it("register re-delivers a still-ringing call", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    const client = await connect();
    const ack = await ask(client, "phone:register", { phone: "9876543210" });
    expect(ack).toMatchObject({ ok: true, activeCall: { callId: call.id } });
  });

  it("rejects an invalid phone number", async () => {
    const client = await connect();
    const ack = await ask(client, "phone:register", { phone: "12345" });
    expect(ack.ok).toBe(false);
  });

  it("answer ack contains the greeting", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    const client = await connect();
    await ask(client, "phone:register", { phone: "9876543210" });
    const ack = await ask(client, "call:answer", { callId: call.id });
    expect(ack.ok).toBe(true);
    expect(ack.greeting.text).toMatch(/^Hi Rohan, this is Aria from ShopNest/);
  });

  it("rejects call events before registering", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    const client = await connect();
    const ack = await ask(client, "call:answer", { callId: call.id });
    expect(ack.ok).toBe(false);
  });

  it("rejects an utterance for someone else's call", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    const owner = await connect();
    await ask(owner, "phone:register", { phone: "9876543210" });
    await ask(owner, "call:answer", { callId: call.id });

    const intruder = await connect();
    await ask(intruder, "phone:register", { phone: "9123456789" });
    const ack = await ask(intruder, "call:utterance", { callId: call.id, text: "hello" });
    expect(ack.ok).toBe(false);
  });

  it("decline ack is ok and ends the call", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    const client = await connect();
    await ask(client, "phone:register", { phone: "9876543210" });
    expect((await ask(client, "call:decline", { callId: call.id })).ok).toBe(true);
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: call.id } });
    expect(row.outcome).toBe("DECLINED");
  });
});

describe("dashboard sockets", () => {
  it("dashboard:join receives dashboard:call-updated", async () => {
    const client = await connect();
    expect(await ask(client, "dashboard:join")).toEqual({ ok: true });
    const updated = once<{ id: string; status: string }>(client, "dashboard:call-updated");
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    expect(await updated).toMatchObject({ id: call.id, status: "RINGING" });
  });
});
