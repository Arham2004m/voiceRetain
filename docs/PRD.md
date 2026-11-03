# VoiceRetain AI — Product Requirements & Staged Build Plan

> **For agentic workers (Claude Code):** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **How to use this document**
> 1. Put this file at `docs/PRD.md` in an empty Git repository and point Claude Code at it.
> 2. Read **Part 1 (PRD)** completely before writing any code. Part 1 is the source of truth; Part 2 implements it.
> 3. Build **one stage at a time, in order**. A stage is finished only when every task's tests pass and the stage's **Stage gate** command succeeds. Stop at each stage gate, report what was built, and wait for the human to say "continue" before starting the next stage.
> 4. Never skip a test step. Never mark a checkbox done without running its verification command.
> 5. Before writing code against a third-party library (Next.js 16, Prisma 7, BullMQ, Socket.IO, `@google/genai`, Tailwind v4), check its current documentation (Context7 or the official docs). Where this document and the library's current docs disagree on API *syntax*, follow the docs and keep this document's *behaviour*.
> 6. If anything in this document is ambiguous, ask before guessing. Do not invent features that are not listed here.

---

# PART 1 — PRODUCT REQUIREMENTS DOCUMENT

## 1. Summary

VoiceRetain AI is an AI voice agent that recovers abandoned e-commerce checkouts. When a shopper enters contact details at checkout and does not complete the order, the system waits a configurable delay, then "calls" the shopper. An LLM agent talks to them by voice, handles objections (shipping cost, price, trust, timing), and can issue a discount code — but only within hard limits enforced by server code, not by the prompt. Every call, transcript, voucher, and recovered order appears live on a merchant dashboard.

This build is a **college mini project demo**. Telephony is simulated: the "phone" is a web page that rings, and speech uses the browser's free Web Speech API. Everything runs locally with Docker Compose so the live demo does not depend on hosted free tiers.

## 2. Goals

| # | Goal | Measure of success |
|---|------|--------------------|
| G1 | Show the full recovery loop live in under 3 minutes | Demo script (§5) runs start to finish without manual DB edits |
| G2 | Show safe LLM tool use | No code path can create a voucher above 15%, even if the customer or the model asks |
| G3 | Show real-time systems | Transcript appears on the dashboard within 1 s of each turn |
| G4 | Demo survives bad conditions | Works with typed input if the mic fails; works with `MOCK_LLM=true` if internet/Gemini fails |
| G5 | Clean, explainable engineering | Tests per module, a README with an architecture diagram, and seed data for the dashboard |

## 3. Non-goals (out of scope for this build — list them under "Future Scope" in the README)

- Real phone calls (Twilio/Plivo/Exotel), streaming STT/TTS services
- Multi-merchant / multi-tenant support, Shopify app, WooCommerce plugin, embeddable JS snippet
- Real payments (checkout uses a fake "Place order" button)
- Merchant login/authentication (the dashboard is open on localhost)
- Languages other than English (en-IN)
- Mobile apps

## 4. Users

- **Shopper (customer):** uses the demo store and answers the simulated call.
- **Merchant (store owner):** watches the dashboard — live calls, outcomes, revenue recovered, vouchers.
- **Presenter (Arham):** runs the demo, uses the demo control panel to reset data and trigger calls.

## 5. Demo script (the acceptance test for the whole project)

1. Presenter opens three windows on the same laptop in Chrome: **Store** (`http://localhost:3000`), **Phone** (`http://localhost:3000/phone`), **Dashboard** (`http://localhost:3000/dashboard`).
2. On **Phone**, presenter registers the device number `9876543210` (stored in the browser).
3. On **Store**, presenter adds "Wireless Earbuds Pro" (₹1,499) to the cart, goes to checkout, enters name "Rohan", phone `9876543210`, ticks the call-consent box, clicks **Continue to payment**, then clicks **Leave store** (or closes the tab).
4. After `ABANDON_DELAY_MS` (default 30 s) the **Phone** window rings showing "ShopNest — Rohan's order ₹1,499". The dashboard shows the call as *Ringing*.
5. Presenter clicks **Answer**. The agent greets by voice.
6. Presenter says: "The shipping was too expensive." The agent responds and issues a 10% code, e.g. `VR-8KQ2-X7MD`, reading it aloud and showing it on screen with a **Complete my order** link.
7. Presenter says: "Can you make it 50%?" The agent says 15% is the most it can do, and the server issues a 15% code that supersedes the 10% one; no request can ever produce more than 15% (server cap).
8. Presenter hangs up. Within 5 s the dashboard shows the call *Ended*, with sentiment, objection, summary, and outcome *Accepted offer*.
9. Presenter clicks **Complete my order** on the phone, which opens the checkout with the code pre-filled, and places the order. The dashboard updates: outcome *Recovered*, revenue recovered increases by the order total after the 15% code (₹1,499 − ₹224.85 + ₹99 shipping = ₹1,373.15).

## 6. Functional requirements

### FR-1 Demo store
- FR-1.1 Product list page showing 6 seeded products (name, price, image, short description).
- FR-1.2 Cart (persisted server-side; cart id stored in `localStorage`), with quantity +/- and remove.
- FR-1.3 Checkout form: name (required, 2–60 chars), Indian mobile number (required, exactly 10 digits, starting 6–9), email (optional), checkbox "Yes, ShopNest may call me about this order" (required to schedule a call; if unticked, the order can still be placed, but no call is ever made).
- FR-1.4 "Continue to payment" step records checkout start and schedules the abandonment check.
- FR-1.5 Payment step: voucher code field (with **Apply** showing the discounted total), **Place order** button, **Leave store** button (navigates to a "You left ShopNest" page — this is the visible abandonment for the demo).
- FR-1.6 `/checkout?cart=<id>&code=<code>` restores the cart and pre-fills the code (used by the phone's "Complete my order" link).
- FR-1.7 Order confirmation page showing subtotal, discount, total.

### FR-2 Abandonment tracking & queue
- FR-2.1 Scheduling happens when checkout starts (FR-1.4), not on tab close. Tab-close detection is unreliable and is not used.
- FR-2.2 One delayed BullMQ job per cart, job id `abandon-<cartId>` (BullMQ custom ids must not contain `:`). Re-submitting checkout must not create a second job or a second call.
- FR-2.3 When an order is placed, the job is removed. The worker also re-checks cart status when it runs, so a completed cart is never called even if job removal raced.
- FR-2.4 When the job runs and the cart is still `CHECKOUT_STARTED` and the customer consented: mark the cart `ABANDONED`, create a `CallLog` in `RINGING`, emit `call:incoming` to the customer's phone room.
- FR-2.5 `POST /api/cart-abandoned` webhook (from the original spec) accepts an external payload (customer + items) and schedules the same check. It exists so the demo can be triggered with `curl` and so the "integration" story can be explained.
- FR-2.6 Delay is configured by `ABANDON_DELAY_MS` (default `30000`), overridable at runtime from the demo control panel (stored in Redis key `config:abandonDelayMs`).

### FR-3 Call lifecycle
States: `RINGING → IN_PROGRESS → ENDED`, or `RINGING → MISSED`.
- FR-3.1 Ringing lasts at most `RING_TIMEOUT_MS` (default `30000`); unanswered → `MISSED`, outcome `NO_ANSWER`.
- FR-3.2 Decline → `ENDED`, outcome `DECLINED`.
- FR-3.3 On answer: status `IN_PROGRESS`, `answeredAt` set, the server sends the templated greeting (§8.3) as the first agent turn (no LLM call — keeps first response instant).
- FR-3.4 Each customer utterance → one agent turn (§8). The agent reply is emitted to the phone and the dashboard and stored as transcript turns.
- FR-3.5 A call ends when: the customer hangs up; the agent calls `endCall`; the call exceeds `MAX_CALL_DURATION_MS` (default `300000`); or the phone socket disconnects and does not reconnect within `DISCONNECT_GRACE_MS` (default `15000`).
- FR-3.6 On end: compute `durationSec`, `avgLatencyMs`, run post-call analysis (§8.5), set the outcome (§7.3), emit `call:ended` and dashboard updates.
- FR-3.7 Only one active call (`RINGING` or `IN_PROGRESS`) per customer at a time. If a new check fires while one is active, skip it.

### FR-4 AI negotiation agent
See §8 for the full specification.

### FR-5 Voucher guardrails (server-enforced)
- FR-5.1 Allowed tiers: **5, 10, 15** percent. Hard cap 15. `MAX_DISCOUNT_PERCENT` env may lower the cap (e.g. 10) but never raise it; any value above 15 is clamped to 15 at startup with a warning.
- FR-5.2 Requested percent is snapped **down** to the largest allowed tier ≤ request; requests between 1 and 4 become 5; requests ≤ 0 or non-numeric are refused.
- FR-5.3 Carts below `MIN_CART_FOR_DISCOUNT_PAISE` (default `50000` = ₹500) get no discount (refused with a reason the model can relay).
- FR-5.4 At most one `ACTIVE` voucher per cart. A new request for a **higher** tier supersedes the old one (old → `SUPERSEDED`, new code issued). A request for an equal or lower tier returns the existing voucher with `alreadyIssued: true`. At most **2** voucher issuances per call; a third request is refused.
- FR-5.5 Codes: format `VR-XXXX-XXXX`, characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L), generated with `crypto.randomInt`, unique in DB (retry on collision, max 5 attempts).
- FR-5.6 Vouchers expire after `VOUCHER_TTL_HOURS` (default 24). Valid only for the cart they were issued for. Single-use.
- FR-5.7 Discount amount = `floor(subtotal × percent / 100)` in paise.

### FR-6 Merchant dashboard
- FR-6.1 **Overview** (`/dashboard`): metric cards — abandoned carts, calls placed, answer rate, recovered carts, recovery rate, revenue recovered (₹), average agent latency (ms); a 7-day bar chart of recovered revenue; sentiment breakdown; **Live call panel** showing the active call's transcript updating in real time; recent calls table (10 rows).
- FR-6.2 **Calls** (`/dashboard/calls`): paginated table (20/page, cursor-based) — customer, cart total, status, outcome, sentiment, duration, started at. Filters: outcome, sentiment.
- FR-6.3 **Call detail** (`/dashboard/calls/[id]`): side-by-side chat-style transcript (agent left, customer right, system events centred), summary, primary objection, latency per agent turn, vouchers issued (incl. superseded), linked order.
- FR-6.4 **Vouchers** (`/dashboard/vouchers`): code, percent, status, cart, expires at, redeemed at.
- FR-6.5 **Global search** (header input, debounced 300 ms): searches customer name, phone, voucher code, call summary; grouped results (Customers / Calls / Vouchers, max 5 each); Redis-cached (§10.3).
- FR-6.6 **Demo control panel** (`/dashboard/demo`): set abandonment delay; "Trigger call now" for the latest `CHECKOUT_STARTED` cart; "Reset demo" (deletes all non-seed data and re-runs the seed); shows whether `MOCK_LLM` is on.
- FR-6.7 All dashboard pages update live over Socket.IO without refresh.

### FR-7 Phone simulator (`/phone`)
- FR-7.1 First visit: "Register this phone" form for a 10-digit number, saved to `localStorage` key `vr.phone`; the page joins room `phone:<number>`. A "Change number" link resets it.
- FR-7.2 Idle screen styled like a phone lock screen. On `call:incoming`: ringing screen with caller "ShopNest", subtitle "<name>'s order ₹<total>", Answer/Decline buttons, a ringtone generated with the Web Audio API (no audio file assets), vibration animation.
- FR-7.3 Ringing must work without a prior click on the page: if the browser blocks audio autoplay, show the visual ring and a "Tap to enable sound" hint; registering the phone counts as the unlocking click.
- FR-7.4 In call: timer, scrolling transcript, mic state indicator (Listening / Agent speaking / Thinking…), Mute, Hang up, and a **typed input** box (always visible; auto-focused if speech recognition is unsupported or mic permission is denied).
- FR-7.5 Turn-taking is half-duplex: recognition is stopped while TTS speaks, and restarts automatically when TTS finishes (prevents the agent hearing itself).
- FR-7.6 A final recognition result (or typed Enter) sends `call:utterance`. Ignore empty/whitespace results. Max 500 chars per utterance (truncate).
- FR-7.7 When an agent reply contains a voucher, show a card: code (large, monospaced), "<percent>% off", expiry, **Complete my order** link → `/checkout?cart=<id>&code=<code>`.
- FR-7.8 TTS: `speechSynthesis`, language `en-IN`, prefer a voice whose `lang` starts with `en-IN`, else `en-`, else default; rate 1.0.
- FR-7.9 Browser support message: if `SpeechRecognition`/`webkitSpeechRecognition` is missing, show "Voice works best in Chrome or Edge — type your replies below."

## 7. Data model

### 7.1 Conventions
- All money is stored as **integer paise** (`Int`). Display with `formatINR()` (₹1,499).
- All ids are `cuid()` strings. All timestamps UTC.
- Phone numbers stored as 10 digits without `+91`.

### 7.2 Prisma schema (pinned — implement exactly; Prisma 7 style, no `url` in the datasource block)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum CartStatus      { ACTIVE CHECKOUT_STARTED ABANDONED RECOVERED COMPLETED }
enum CallStatus      { RINGING IN_PROGRESS ENDED MISSED }
enum CallOutcome     { PENDING RECOVERED ACCEPTED_OFFER UNDECIDED DECLINED NO_ANSWER }
enum Sentiment       { POSITIVE NEUTRAL NEGATIVE }
enum Objection       { SHIPPING_COST PRICE TRUST TIMING CHANGED_MIND OTHER NONE }
enum Speaker         { AGENT CUSTOMER SYSTEM }
enum VoucherStatus   { ACTIVE SUPERSEDED REDEEMED EXPIRED }

model Customer {
  id                 String    @id @default(cuid())
  name               String
  phone              String    @unique
  email              String?
  consentToCall      Boolean   @default(false)
  lifetimeValuePaise Int       @default(0)
  isActive           Boolean   @default(true)
  isSeed             Boolean   @default(false)
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  carts              Cart[]
  calls              CallLog[]
}

model Product {
  id          String     @id @default(cuid())
  slug        String     @unique
  name        String
  description String
  pricePaise  Int
  imageUrl    String
  cartItems   CartItem[]
}

model Cart {
  id                String     @id @default(cuid())
  customerId        String?
  customer          Customer?  @relation(fields: [customerId], references: [id])
  status            CartStatus @default(ACTIVE)
  subtotalPaise     Int        @default(0)
  checkoutStartedAt DateTime?
  abandonedAt       DateTime?
  completedAt       DateTime?
  isSeed            Boolean    @default(false)
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  items             CartItem[]
  calls             CallLog[]
  vouchers          Voucher[]
  order             Order?
  @@index([status, checkoutStartedAt])
}

model CartItem {
  id             String  @id @default(cuid())
  cartId         String
  cart           Cart    @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productId      String
  product        Product @relation(fields: [productId], references: [id])
  quantity       Int
  unitPricePaise Int
  @@unique([cartId, productId])
}

model CallLog {
  id              String           @id @default(cuid())
  cartId          String
  cart            Cart             @relation(fields: [cartId], references: [id])
  customerId      String
  customer        Customer         @relation(fields: [customerId], references: [id])
  status          CallStatus       @default(RINGING)
  outcome         CallOutcome      @default(PENDING)
  sentiment       Sentiment?
  objection       Objection?
  summary         String?
  endReason       String?
  startedAt       DateTime         @default(now())
  answeredAt      DateTime?
  endedAt         DateTime?
  durationSec     Int?
  avgLatencyMs    Int?
  isSeed          Boolean          @default(false)
  turns           TranscriptTurn[]
  vouchers        Voucher[]
  @@index([status])
  @@index([startedAt])
  @@index([outcome])
}

model TranscriptTurn {
  id        String   @id @default(cuid())
  callId    String
  call      CallLog  @relation(fields: [callId], references: [id], onDelete: Cascade)
  speaker   Speaker
  text      String
  latencyMs Int?
  createdAt DateTime @default(now())
  @@index([callId, createdAt])
}

model Voucher {
  id         String        @id @default(cuid())
  code       String        @unique
  percent    Int
  status     VoucherStatus @default(ACTIVE)
  cartId     String
  cart       Cart          @relation(fields: [cartId], references: [id])
  callId     String?
  call       CallLog?      @relation(fields: [callId], references: [id])
  expiresAt  DateTime
  redeemedAt DateTime?
  createdAt  DateTime      @default(now())
  order      Order?
  @@index([cartId, status])
}

model Order {
  id            String   @id @default(cuid())
  cartId        String   @unique
  cart          Cart     @relation(fields: [cartId], references: [id])
  voucherId     String?  @unique
  voucher       Voucher? @relation(fields: [voucherId], references: [id])
  subtotalPaise Int
  discountPaise Int
  totalPaise    Int
  createdAt     DateTime @default(now())
}
```

A raw-SQL migration (Task 2.2) adds `pg_trgm` and GIN trigram indexes on `Customer.name`, `Customer.phone`, `Voucher.code`, `CallLog.summary` for fast `ILIKE` search.

### 7.3 Outcome rules (deterministic, evaluated top to bottom — the LLM never sets the outcome directly)
| Condition | Outcome |
|---|---|
| Unanswered within ring timeout | `NO_ANSWER` |
| Declined while ringing | `DECLINED` |
| Ended, and an order was later placed for the cart | `RECOVERED` (set at order time; overrides any earlier outcome) |
| Ended, and analysis intent = `WILL_PURCHASE`, or a voucher was issued and intent ≠ `DECLINED` | `ACCEPTED_OFFER` |
| Ended, analysis intent = `DECLINED` | `DECLINED` |
| Otherwise (incl. analysis failed) | `UNDECIDED` |

Sentiment comes from the analysis; it is separate from the outcome. When a cart becomes `RECOVERED`, add `totalPaise` to `Customer.lifetimeValuePaise`. A normal order (no call) sets the cart to `COMPLETED` and also adds to lifetime value.

## 8. AI agent specification

### 8.1 Model & SDK
- SDK: `@google/genai`. Model id from env `GEMINI_MODEL`, default `gemini-3.5-flash`.
- Per-turn timeout `LLM_TIMEOUT_MS` (default `8000`). One retry on HTTP 429/5xx with 500 ms backoff, then fallback (§8.6).
- All LLM access goes through the `LlmClient` interface (§Part 2, Task 6.1) so tests and `MOCK_LLM=true` never hit the network.

### 8.2 System prompt (exact copy — fill `{…}` from call context)

```
You are Aria, a friendly customer-care specialist calling from ShopNest, an online store.
You are on a live voice call with {customerName}, who started checkout but did not finish.

Their cart:
{itemsList}            ← one line per item: "- {quantity} × {productName} at ₹{unitPrice}"
Cart subtotal: ₹{subtotal}. Shipping: ₹{shippingFee} (free at ₹{freeShippingThreshold} or above).

Your goals, in order:
1. Find out politely why they did not complete the order.
2. Address the concern honestly using only the facts above. Never invent prices, delivery dates, stock levels, or policies.
3. Only if the concern is about cost (price or shipping) or they are about to decline, you may offer a discount using the issueDiscountCode tool. Start with 5 or 10 percent. Offer {maxDiscountPercent} percent only if they are still hesitant after a lower offer. You cannot offer more than {maxDiscountPercent} percent under any circumstances — if asked, say that {maxDiscountPercent} percent is the best you can do.
4. Never say a discount amount or code out loud unless the issueDiscountCode tool returned it. Read the code exactly as the tool's spokenCode gives it.
5. When the conversation is finished (they will complete the order, they decline, or they ask to end the call), say a short goodbye and call the endCall tool.

Style rules: this is a voice call. Reply in at most 2 short sentences, plain spoken English, no lists, no emojis, no markdown. Do not repeat the greeting. If the customer is rude or off-topic, stay polite and steer back to their order once, then offer to end the call.
```

Shipping constants for the demo store: `SHIPPING_FEE_PAISE = 9900` (₹99), `FREE_SHIPPING_THRESHOLD_PAISE = 200000` (₹2,000). Shipping is added at checkout totals (subtotal − discount + shipping-if-applicable). The discount applies to the subtotal only.

### 8.3 Greeting (templated, not LLM)
`Hi {firstName}, this is Aria from ShopNest. I noticed you left {firstItemName}{ and N more items} in your cart. Was there anything that stopped you from finishing your order?`

### 8.4 Tools (function declarations)
1. `issueDiscountCode` — params `{ percent: integer (required), reason: string enum ["SHIPPING_COST","PRICE","HESITATION","OTHER"] (required) }`. Server runs the voucher service (FR-5) and returns to the model either `{ ok: true, code, percent, spokenCode, expiresInHours, alreadyIssued }` or `{ ok: false, reason }`. `spokenCode` is the code spelled with spaces for TTS, e.g. `"V R, 8 K Q 2, X 7 M D"`.
2. `endCall` — params `{ reason: string enum ["WILL_PURCHASE","DECLINED","CUSTOMER_REQUEST","OTHER"] }`. Server marks the turn as final; the reply is spoken, then the call ends.

Agent turn loop: send history + customer text → if the model returns function calls, execute them, send results back, repeat; **max 3 model round-trips per turn**. If the model still returns no text, use fallback text. The reply text (read aloud) uses the tool's `spokenCode`; the phone UI shows the written `code` on the voucher card taken from the tool result (not parsed from text).

### 8.5 Post-call analysis
One LLM call with structured JSON output (response schema):
`{ sentiment: "POSITIVE"|"NEUTRAL"|"NEGATIVE", objection: Objection enum, intent: "WILL_PURCHASE"|"UNDECIDED"|"DECLINED", summary: string (max 200 chars) }`.
Skipped for calls with no customer turns (outcome from §7.3; sentiment `NEUTRAL`, objection `NONE`, summary "Customer did not speak."). On failure: sentiment `NEUTRAL`, objection `OTHER`, intent `UNDECIDED`, summary "Analysis unavailable.".

### 8.6 Fallbacks
- LLM timeout/error during a turn → reply "Sorry, I didn't catch that properly. Could you say that again?" (stored with `latencyMs`, logged with error).
- Three consecutive LLM failures in one call → reply "I'm having trouble on my end, so I'll let you go. Your cart is saved if you want to finish later. Goodbye!" and end the call with `endReason = "LLM_FAILURE"`.

### 8.7 Mock LLM (`MOCK_LLM=true`)
Deterministic rules on the lowercased customer text, evaluated top to bottom (first match wins). Keywords match whole words (`\b…\b`), so `ok` does not match "took" nor `order` "ordering". `{cap}` below is `MAX_DISCOUNT_PERCENT`:
- contains `ship` → call `issueDiscountCode({percent:10, reason:"SHIPPING_COST"})`, reply "I understand, shipping adds up. I can give you 10 percent off right now — your code is {spokenCode}."
- contains `expensive|price|costly|cheaper` → same with 10 / PRICE.
- contains a number ≥ 16 followed by `%|percent` → reply "{cap} percent is the best I can do, and I'm happy to apply that for you." and call issueDiscountCode {cap} / HESITATION.
- contains `bye|no thanks|not interested|stop` → reply "No problem at all. Have a great day!" + `endCall({reason:"DECLINED"})`.
- contains `ok|okay|yes|sure|will buy|order` → reply "Wonderful! Just use the link on your screen to finish. Goodbye!" + `endCall({reason:"WILL_PURCHASE"})`.
- otherwise → "Got it. Is it the price or the delivery that's holding you back?"
Mock analysis: intent `WILL_PURCHASE` if any voucher issued, `DECLINED` if endCall reason DECLINED, else `UNDECIDED`; sentiment POSITIVE/NEGATIVE/NEUTRAL accordingly; objection from the first matched rule; summary built from those.
Mock latency: wait 300 ms to feel realistic.

## 9. API & realtime contracts

### 9.1 REST (Express, prefix `/api`, JSON; validation with Zod; error shape `{ error: { code: string, message: string, details?: unknown } }`)

| Method & path | Body / query | Response | Notes |
|---|---|---|---|
| `GET /health` | — | `{ ok: true, db: "up", redis: "up" }` | 503 if a dependency is down |
| `GET /products` | — | `Product[]` | |
| `POST /carts` | `{ items: [{ productId, quantity }] }` (≥1 item, qty 1–10) | `CartDTO` | |
| `GET /carts/:id` | — | `CartDTO` | 404 unknown |
| `PUT /carts/:id/items` | `{ items: [...] }` (replaces items; empty array allowed) | `CartDTO` | 409 if cart not `ACTIVE`/`CHECKOUT_STARTED`/`ABANDONED` |
| `POST /carts/:id/checkout` | `{ name, phone, email?, consentToCall }` | `CartDTO` | upsert customer by phone; status → `CHECKOUT_STARTED` (allowed from ACTIVE, CHECKOUT_STARTED, ABANDONED); schedule check if consent; idempotent |
| `POST /vouchers/validate` | `{ code, cartId }` | `{ valid: true, percent, discountPaise } \| { valid: false, reason }` | reasons: `NOT_FOUND`, `WRONG_CART`, `EXPIRED`, `NOT_ACTIVE` |
| `POST /carts/:id/complete` | `{ voucherCode? }` | `OrderDTO` | creates Order in one transaction, cancels job, redeems voucher, sets cart RECOVERED (if a call exists for the cart) or COMPLETED, updates call outcome → RECOVERED; 409 if already completed; 422 for invalid voucher |
| `GET /orders/:id` | — | `OrderDTO` | |
| `POST /cart-abandoned` | `{ customer: { name, phone, email?, consentToCall }, items: [{ productId, quantity }] }` | `{ cartId, scheduledInMs }` | external webhook; creates cart + checkout start |
| `GET /dashboard/metrics` | — | `DashboardMetrics` | excludes nothing; seed data counts |
| `GET /calls` | `?cursor&limit=20&outcome&sentiment` | `{ items: CallSummaryDTO[], nextCursor: string \| null }` | ordered by `startedAt desc, id desc`; cursor = last row's id |
| `GET /calls/:id` | — | `CallDetailDTO` | includes turns, vouchers, order |
| `GET /vouchers` | `?cursor&limit=20&status` | paginated `VoucherDTO[]` | |
| `GET /search` | `?q` (2–50 chars, trimmed) | `SearchResults` | 400 if q too short |
| `GET /demo/config` | — | `{ abandonDelayMs, mockLlm }` | |
| `PUT /demo/config` | `{ abandonDelayMs }` (5000–600000) | same | |
| `POST /demo/trigger-latest` | — | `{ cartId } \| 404` | runs the abandonment check now for the newest CHECKOUT_STARTED cart |
| `POST /demo/reset` | — | `{ ok: true }` | deletes non-seed rows, clears queue, re-seeds |

### 9.2 Socket.IO events (types live in `packages/shared`)

Client → server:
| Event | Payload | Ack |
|---|---|---|
| `phone:register` | `{ phone }` | `{ ok, activeCall?: IncomingCallPayload }` (re-delivers a still-ringing call after reload) |
| `dashboard:join` | — | `{ ok }` |
| `call:answer` | `{ callId }` | `{ ok, greeting: AgentReplyPayload }` |
| `call:decline` | `{ callId }` | `{ ok }` |
| `call:utterance` | `{ callId, text }` | `{ ok }` (reply arrives as `call:agent-reply`) |
| `call:hangup` | `{ callId }` | `{ ok }` |

Server → client:
| Event | Room | Payload |
|---|---|---|
| `call:incoming` | `phone:<phone>` | `IncomingCallPayload { callId, customerName, cartId, subtotalPaise, itemCount }` |
| `call:agent-reply` | `phone:<phone>` | `AgentReplyPayload { callId, text, voucher?: VoucherCard, endsCall: boolean }` |
| `call:ended` | `phone:<phone>` | `{ callId, outcome }` |
| `call:ring-cancelled` | `phone:<phone>` | `{ callId }` (missed) |
| `dashboard:call-updated` | `dashboard` | `CallSummaryDTO` |
| `dashboard:turn` | `dashboard` | `{ callId, turn: TranscriptTurnDTO }` |
| `dashboard:metrics` | `dashboard` | `DashboardMetrics` (emitted after any call end / order / voucher change, debounced 1 s) |

Server rejects (ack `{ ok: false, error }`) any call event whose `callId` does not belong to the socket's registered phone, or whose call is not in the right state.

## 10. Non-functional requirements
- 10.1 **Latency:** mock agent turn < 600 ms server-side; Gemini turn target < 3 s (p50). Record `latencyMs` per agent turn (time from receiving utterance to reply ready).
- 10.2 **Reliability:** server restarts must not lose scheduled checks (BullMQ in Redis). Call timers are in-memory, so on server start stale calls are cleaned up: `RINGING` older than `RING_TIMEOUT_MS` → `MISSED`; `IN_PROGRESS` older than `MAX_CALL_DURATION_MS` → ended with `endReason = "SERVER_RESTART"`; younger active calls get their timers re-armed.
- 10.3 **Search caching:** key `search:v{n}:{normalizedQuery}` (lowercase, trimmed, collapsed spaces), TTL 60 s, `n` = value of Redis counter `search:version`, which is `INCR`ed on every write to customers, calls, vouchers. Metrics cached at `metrics:v{n}` TTL 10 s with the same versioning.
- 10.4 **Security basics:** Helmet, CORS limited to `WEB_ORIGIN`, body limit 100 kb, rate-limit `/api/carts/:id/checkout` and `/api/cart-abandoned` to 20/min/IP, never log full phone numbers (mask to `98******10`). API keys only via env. Customer text is passed to the model as content, never concatenated into the system prompt. The `/api/demo/*` routes (reset, trigger, config) are mounted only when `DEMO_MODE=true`.
- 10.5 **Secure context:** mic and speech require `localhost` or HTTPS. The demo runs all windows on `localhost`. Document using a tunnel (e.g. cloudflared) if a real phone is used. Chrome's speech recognition sends audio to Google, so voice input needs internet; typed input and `MOCK_LLM=true` work offline.
- 10.6 **Accessibility:** buttons have labels, focus states visible, transcript is an ARIA live region.
- 10.7 **Code quality:** TypeScript strict everywhere, ESLint + Prettier, no `any` in exported signatures.

## 11. Architecture

```
┌────────────── apps/web (Next.js 16, React 19, Tailwind v4, Framer Motion) ─────────────┐
│  /  /cart  /checkout  /order/[id]      /phone (call simulator)      /dashboard/*        │
│        │  REST (fetch)                        │ Socket.IO client         │ Socket.IO    │
└────────┼──────────────────────────────────────┼─────────────────────────┼──────────────┘
         ▼                                      ▼                         ▼
┌──────────────────── apps/server (Node.js, Express 5, Socket.IO 4) ────────────────────┐
│ routes → services (cart, checkout, order, voucher, call, agent, metrics, search)        │
│ BullMQ Queue "abandonment" ──► Worker (same process) ──► CallService.startCall          │
│ AgentService ──► LlmClient (GeminiLlmClient | MockLlmClient) ──► Gemini API             │
└──────────┬───────────────────────────────┬─────────────────────────────────────────────┘
           ▼                               ▼
   PostgreSQL 17 (Prisma 7 + adapter-pg)   Redis 7 (BullMQ jobs, search/metrics cache, config)
```

Repository layout (npm workspaces, TypeScript):
```
voiceretain-ai/
├─ apps/
│  ├─ web/                 Next.js app
│  └─ server/              Express + Socket.IO + BullMQ worker
├─ packages/
│  └─ shared/              Zod schemas, DTO types, socket event types, money/phone utils, constants
├─ docker-compose.yml      postgres, redis (+ web, server in Stage 11)
├─ docs/PRD.md             this file
├─ .env.example
└─ README.md
```

## 12. Configuration (`.env.example` — every variable documented)

```
# server
NODE_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://voiceretain:voiceretain@localhost:5432/voiceretain
DATABASE_URL_TEST=postgresql://voiceretain:voiceretain@localhost:5432/voiceretain_test
REDIS_URL=redis://localhost:6379
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
MOCK_LLM=false
LLM_TIMEOUT_MS=8000
ABANDON_DELAY_MS=30000
RING_TIMEOUT_MS=30000
MAX_CALL_DURATION_MS=300000
DISCONNECT_GRACE_MS=15000
MAX_DISCOUNT_PERCENT=15
MIN_CART_FOR_DISCOUNT_PAISE=50000
VOUCHER_TTL_HOURS=24
DEMO_MODE=true
# web
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```
Server fails fast on startup with a readable message if a required variable is missing or invalid. `GEMINI_API_KEY` is required only when `MOCK_LLM=false`.

## 13. Seed data
- 6 products (slugs: `wireless-earbuds-pro` ₹1,499; `smart-fitness-band` ₹2,499; `cotton-hoodie` ₹1,199; `steel-water-bottle` ₹599; `laptop-backpack` ₹1,899; `desk-lamp-led` ₹899). Images: local SVG placeholders in `apps/web/public/products/<slug>.svg` (generate simple original illustrations — no copied images).
- 20 historical calls over the last 7 days with `isSeed = true` (customers, carts, transcripts of 4–8 turns, vouchers, orders), distributed: 7 RECOVERED, 4 ACCEPTED_OFFER, 3 UNDECIDED, 3 DECLINED, 3 NO_ANSWER; mixed objections and sentiments; realistic Indian names; latencies 400–2500 ms. Generated deterministically (fixed random seed) so screenshots are reproducible. Seed customers use reserved phones `9000000001`–`9000000020`. Only `Customer`, `Cart` and `CallLog` carry `isSeed`; seeding and reset delete dependents (items, turns, vouchers, orders) through those parents.

---

# PART 2 — IMPLEMENTATION PLAN

**Goal:** Build the VoiceRetain AI demo described in Part 1 as a local, Docker-backed monorepo with a store, phone simulator, AI agent, and live dashboard.

**Architecture:** npm-workspaces monorepo: `apps/server` (Express 5 + Socket.IO + BullMQ worker + Prisma 7) and `apps/web` (Next.js 16 App Router), sharing types and Zod schemas from `packages/shared`. Business logic lives in services with injected dependencies (prisma, redis, queue, llm, emitter) so every service is unit/integration testable without the network.

**Tech Stack:** TypeScript 5 (strict), Node.js 22 LTS, Express 5, Socket.IO 4, BullMQ 5 + ioredis, Prisma 7 + `@prisma/adapter-pg` + `pg`, PostgreSQL 17, Redis 7, `@google/genai`, Zod, Pino, Vitest, Supertest, socket.io-client, Next.js 16, React 19, Tailwind CSS v4, Framer Motion, Recharts, Playwright, Docker Compose.

**Spec:** Part 1 of this document (`docs/PRD.md`).

## Global Constraints
- All money in integer paise; display only through `formatINR` from `@voiceretain/shared`.
- Discount tiers exactly `[5, 10, 15]`; hard cap 15; enforced in `voucher.service.ts` only.
- Voucher code regex: `^VR-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$`.
- BullMQ job id: `abandon-<cartId>`; queue name `abandonment`; ioredis connections for workers use `maxRetriesPerRequest: null`.
- Phone: 10 digits, regex `^[6-9]\d{9}$`; mask in logs.
- LLM accessed only through `LlmClient`; tests never call the real Gemini API.
- Server tests run against `DATABASE_URL_TEST` (reset per test file with `prisma migrate reset --force --skip-seed` in global setup and table truncation in `beforeEach`; server Vitest config sets `fileParallelism: false` because all files share one database) and a real Redis on a separate logical DB (`redis://localhost:6379/1`) using BullMQ's `prefix: "test"` option. Never use the ioredis `keyPrefix` option — BullMQ rejects it; prefix app-level keys (`config:`, `search:`, `metrics:`) manually.
- Every service function that writes customers/calls/vouchers calls `bumpCacheVersion()`.
- No feature outside Part 1. Commit after every task with a Conventional Commit message.

## Review Focus
1. **Customer completes the order before the delay ends** → no call ever rings. Test: Task 3.2 `does not call when cart completed before job runs` and Task 4.4 `complete removes scheduled job`.
2. **Customer (or a confused model) asks for more than 15%, or asks repeatedly** → never above 15, never more than 2 issuances per call, same-or-lower request returns the existing code. Tests: Task 5.1 / 5.2 tier and limit tests; Task 6.3 `model requesting 40 percent yields 15 percent voucher`.
3. **Mic denied / Firefox / no speech recognition** → typed input is focused and the call still works end to end. Test: Task 8.2 `falls back to typed input when recognition unsupported`; Playwright E2E (Task 11.2) uses typed input only.
4. **Gemini timeout, 429, or offline Wi-Fi** → the call continues with the fallback line; three failures end the call gracefully. Test: Task 6.3 `timeout produces fallback reply` and `three failures end call`.
5. **Double-submitting checkout, page reloads, or socket drops mid-call** → exactly one job, one call; a reloaded phone gets the still-ringing call back; a dropped call ends after the grace period with the outcome §7.3 gives (UNDECIDED when no voucher was issued). Tests: Task 3.1 `idempotent scheduling`, Task 4.2 `register re-delivers ringing call`, Task 4.3 `disconnect grace ends call`.

---

## STAGE 0 — Repository, tooling, infrastructure

### Task 0.1: Monorepo skeleton and tooling

**Files:**
- Create: `package.json` (workspaces `apps/*`, `packages/*`; scripts `dev`, `build`, `test`, `lint`, `typecheck`, `db:migrate`, `db:seed`, `db:reset`), `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), `eslint.config.mjs` (flat config), `.prettierrc`, `.gitignore`, `.nvmrc` (`22`), `.env.example` (exact copy of §12), `README.md` (title + "see docs/PRD.md" for now)
- Create: `packages/shared/package.json` (name `@voiceretain/shared`), `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/vitest.config.ts`
- Create: `apps/server/package.json` (name `@voiceretain/server`), `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`
- Test: `packages/shared/src/__tests__/sanity.test.ts`

**Interfaces:**
- Produces: workspace package `@voiceretain/shared` importable from both apps.

- [ ] **Step 1:** Write `sanity.test.ts` asserting `import * as shared from "../index"` is an object.
- [ ] **Step 2:** Run `npm install && npm test -w @voiceretain/shared` → PASS.
- [ ] **Step 3:** Run `npm run lint && npm run typecheck` → no errors.
- [ ] **Step 4:** `git init` (if needed) and commit `chore: monorepo skeleton`.

### Task 0.2: Docker Compose for Postgres and Redis

**Files:**
- Create: `docker-compose.yml` with `postgres:17` (user/pass/db `voiceretain`, port 5432, volume, healthcheck `pg_isready`), an init script `docker/postgres/init.sql` creating `voiceretain_test`, and `redis:7-alpine` (port 6379, healthcheck `redis-cli ping`).

- [ ] **Step 1:** Run `docker compose up -d` then `docker compose ps` → both services `healthy`.
- [ ] **Step 2:** Run `docker compose exec postgres psql -U voiceretain -l` → lists `voiceretain` and `voiceretain_test`.
- [ ] **Step 3:** Commit `chore: docker compose for postgres and redis`.

### Task 0.3: Shared utilities and constants

**Files:**
- Create: `packages/shared/src/money.ts`, `phone.ts`, `constants.ts`, `voucher-format.ts`
- Test: `packages/shared/src/__tests__/money.test.ts`, `phone.test.ts`, `voucher-format.test.ts`

**Interfaces:**
- Produces:
  - `formatINR(paise: number): string` — `149900 → "₹1,499"`, `149950 → "₹1,499.50"`, `10000000 → "₹1,00,000"` (Indian grouping via `Intl.NumberFormat("en-IN")`).
  - `isValidIndianMobile(s: string): boolean`; `normalizePhone(s: string): string | null` (strips spaces, dashes, leading `+91`/`0`; returns 10 digits or null); `maskPhone(p: string): string` (`9876543210 → "98******10"`).
  - `constants.ts`: `DISCOUNT_TIERS = [5,10,15] as const`, `HARD_MAX_DISCOUNT = 15`, `SHIPPING_FEE_PAISE = 9900`, `FREE_SHIPPING_THRESHOLD_PAISE = 200000`, `STORE_NAME = "ShopNest"`, `AGENT_NAME = "Aria"`, `MAX_UTTERANCE_CHARS = 500`.
  - `VOUCHER_ALPHABET`, `VOUCHER_REGEX`, `toSpokenCode(code: string): string` (`"VR-8KQ2-X7MD" → "V R, 8 K Q 2, X 7 M D"`).
  - `computeTotals(subtotalPaise: number, percent: number): { subtotalPaise, discountPaise, shippingPaise, totalPaise }` — discount = floor(subtotal × percent / 100); shipping is 0 if subtotal ≥ threshold else 9900.

- [ ] **Step 1:** Write the tests with the exact examples above, plus `normalizePhone("+91 98765-43210") === "9876543210"`, `normalizePhone("12345") === null`, `computeTotals(149900, 10)` → `{149900, 14990, 9900, 144810}`, `computeTotals(250000, 0).shippingPaise === 0`.
- [ ] **Step 2:** Run `npm test -w @voiceretain/shared` → FAIL (not defined).
- [ ] **Step 3:** Implement the functions.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Commit `feat(shared): money, phone, voucher format utils`.

### Task 0.4: Shared Zod schemas, DTOs, socket event types

**Files:**
- Create: `packages/shared/src/schemas.ts`, `dto.ts`, `socket-events.ts`; export all from `index.ts`
- Test: `packages/shared/src/__tests__/schemas.test.ts`

**Interfaces:**
- Produces Zod schemas: `CreateCartInput`, `ReplaceCartItemsInput`, `CheckoutInput` (name 2–60 trimmed, phone via `normalizePhone` transform + validity refine, email optional, `consentToCall: boolean`), `ValidateVoucherInput`, `CompleteOrderInput`, `CartAbandonedWebhookInput`, `SearchQuery`, `DemoConfigInput`, `PaginationQuery`.
- Produces DTO types (all money in paise, dates as ISO strings): `ProductDTO`, `CartDTO { id, status, items: {productId, name, quantity, unitPricePaise, imageUrl}[], subtotalPaise, customer?: {name, phone} }`, `OrderDTO`, `VoucherDTO`, `VoucherCard { code, percent, expiresAt, cartId }`, `TranscriptTurnDTO`, `CallSummaryDTO`, `CallDetailDTO`, `DashboardMetrics { abandonedCarts, callsPlaced, answerRate, recoveredCarts, recoveryRate, revenueRecoveredPaise, avgLatencyMs, sentiment: {POSITIVE, NEUTRAL, NEGATIVE}, last7Days: {date, revenueRecoveredPaise}[] }`, `SearchResults { customers, calls, vouchers }`, `ApiError`.
- Produces `ClientToServerEvents`, `ServerToClientEvents`, `IncomingCallPayload`, `AgentReplyPayload` exactly as §9.2.

- [ ] **Step 1:** Tests: `CheckoutInput.parse({name:" Rohan ", phone:"+91 98765 43210", consentToCall:true})` gives `name "Rohan"`, `phone "9876543210"`; phone `"5876543210"` fails; `CreateCartInput` rejects quantity 0 and 11 and empty items.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(shared): zod schemas, DTOs, socket event types`.

**Stage 0 gate:** `docker compose up -d && npm run lint && npm run typecheck && npm test` all succeed. Stop and report.

---

## STAGE 1 — Server foundation

### Task 1.1: Env config, logger, Express app factory, health route

**Files:**
- Create: `apps/server/src/config/env.ts`, `src/lib/logger.ts` (Pino, pretty in dev, redact `phone`, `GEMINI_API_KEY`), `src/app.ts`, `src/server.ts` (entry: creates http server, starts app; later stages add socket + worker), `src/http/errors.ts`, `src/http/validate.ts`, `src/routes/health.routes.ts`, `src/lib/redis.ts`
- Test: `apps/server/src/__tests__/env.test.ts`, `health.test.ts`

**Interfaces:**
- Produces:
  - `loadEnv(source = process.env): Env` (Zod-validated; numeric coercion; `MAX_DISCOUNT_PERCENT` clamped to ≤ 15 with a logged warning; throws `Error` listing every invalid key) and `env: Env`.
  - `class HttpError extends Error { status: number; code: string; details?: unknown }`, helpers `notFound(msg)`, `conflict(msg)`, `badRequest(msg, details)`, `unprocessable(msg, details)`.
  - `validate(schema, "body" | "query" | "params")` Express middleware → 400 with `{error:{code:"VALIDATION_ERROR", details: zod issues}}`.
  - `createRedis(url): Redis` and `createApp(deps: AppDeps): express.Express` where `AppDeps = { prisma, redis, queue, emitter, llm, env }` (types filled in by later tasks; start with what exists).
  - Error middleware producing the §9.1 error shape; unknown errors → 500 `INTERNAL_ERROR`, logged.

- [ ] **Step 1:** Tests: `loadEnv({...valid, MAX_DISCOUNT_PERCENT:"40"}).MAX_DISCOUNT_PERCENT === 15`; missing `DATABASE_URL` throws mentioning `DATABASE_URL`; `MOCK_LLM=false` without `GEMINI_API_KEY` throws; `GET /api/health` returns 200 `{ok:true, db:"up", redis:"up"}` with live deps; returns 503 when redis ping rejects (inject a stub).
- [ ] **Step 2:** Run `npm test -w @voiceretain/server` → FAIL. **Step 3:** Implement (add Helmet, CORS to `WEB_ORIGIN`, `express.json({limit:"100kb"})`). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(server): env, logger, app factory, health check`.

**Stage 1 gate:** `npm run dev -w @voiceretain/server` then `curl localhost:4000/api/health` → `{"ok":true,...}`. Stop and report.

---

## STAGE 2 — Database

### Task 2.1: Prisma 7 schema, client, first migration

**Files:**
- Create: `apps/server/prisma/schema.prisma` (exact §7.2), `apps/server/prisma.config.ts` (schema path, `datasource.url` from `DATABASE_URL`, migrations path, seed command `tsx prisma/seed.ts`), `src/db/prisma.ts`
- Test: `apps/server/src/__tests__/db.test.ts`, `src/__tests__/setup/global-setup.ts`, `src/__tests__/setup/test-db.ts`

**Interfaces:**
- Produces: `createPrisma(url: string): PrismaClient` (uses `PrismaPg` adapter) and `prisma` singleton; `resetTestDb(prisma)` truncating all tables (`TRUNCATE ... RESTART IDENTITY CASCADE`); type `Db = PrismaClient`.

- [ ] **Step 1:** Test: create a Customer and a Product, read back; `Customer.phone` unique violation throws `P2002`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Install `prisma @prisma/client @prisma/adapter-pg pg dotenv`, write the schema, run `npx prisma migrate dev --name init` and `npx prisma generate`; global setup runs `prisma migrate reset --force` against `DATABASE_URL_TEST`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(db): prisma 7 schema and initial migration`.

### Task 2.2: Trigram search indexes migration

**Files:**
- Create: `apps/server/prisma/migrations/<timestamp>_search_indexes/migration.sql` (via `prisma migrate dev --create-only --name search_indexes`): `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and `CREATE INDEX ... USING GIN (... gin_trgm_ops)` on `"Customer"(name)`, `"Customer"(phone)`, `"Voucher"(code)`, `"CallLog"(summary)`; plus a partial unique index `CREATE UNIQUE INDEX ... ON "CallLog"("customerId") WHERE status IN ('RINGING','IN_PROGRESS')` enforcing FR-3.7 in the database (`startCall` treats the unique violation as "skip").

- [ ] **Step 1:** Run `npx prisma migrate dev` → applied. **Step 2:** Verify `\di` in psql lists the 4 GIN indexes.
- [ ] **Step 3:** Commit `feat(db): trigram indexes for search`.

### Task 2.3: Product seed

**Files:**
- Create: `apps/server/prisma/seed.ts`, `apps/server/src/seed/products.ts`
- Test: `apps/server/src/__tests__/seed-products.test.ts`

**Interfaces:**
- Produces: `seedProducts(db: Db): Promise<void>` (upsert by slug; the 6 products in §13); `seed.ts` calls `seedProducts` now and `seedHistory` after Stage 10.

- [ ] **Step 1:** Test: running `seedProducts` twice yields exactly 6 products; `wireless-earbuds-pro` has `pricePaise 149900`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(db): product seed`.

**Stage 2 gate:** `npm run db:reset && npm run db:seed` then `npx prisma studio` shows 6 products. Stop and report.

---

## STAGE 3 — Store API & abandonment queue

### Task 3.1: Abandonment queue (schedule / cancel)

**Files:**
- Create: `apps/server/src/queue/abandonment.queue.ts`, `src/config/runtime-config.ts`
- Test: `apps/server/src/__tests__/abandonment-queue.test.ts`

**Interfaces:**
- Produces:
  - `getAbandonDelayMs(redis, env): Promise<number>` / `setAbandonDelayMs(redis, ms): Promise<void>` (Redis key `config:abandonDelayMs`, falls back to env).
  - `createAbandonmentQueue(redis): Queue<{ cartId: string }>` (name `abandonment`, `defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000, attempts: 3, backoff: { type: "exponential", delay: 2000 } }`).
  - `scheduleAbandonmentCheck(queue, cartId: string, delayMs: number): Promise<{ scheduled: boolean }>` — job id `abandon-<cartId>`; if a job with that id exists in delayed/waiting/active state, do nothing and return `{scheduled:false}`; if one exists in a completed/failed state (BullMQ silently ignores `add` for an existing id, and `removeOnComplete: 1000` keeps finished jobs), remove it first and then add the new job.
  - `cancelAbandonmentCheck(queue, cartId: string): Promise<boolean>`.
  - `runAbandonmentCheckNow(queue, cartId): Promise<void>` — removes any existing job and adds one with delay 0 (used by demo trigger).

- [ ] **Step 1:** Tests: `idempotent scheduling` (schedule twice → one delayed job with id `abandon-c1`); `cancel removes delayed job`; `cancel returns false when absent`; `runNow replaces delayed job with immediate job`; `reschedules after the previous job completed`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(queue): abandonment scheduling`.

### Task 3.2: Abandonment worker processor

**Files:**
- Create: `apps/server/src/queue/abandonment.worker.ts`
- Test: `apps/server/src/__tests__/abandonment-worker.test.ts`

**Interfaces:**
- Consumes: `CallService.startCall` (Task 4.1) — inject as a function dependency `startCall(cartId): Promise<void>` so this task can test with a spy.
- Produces:
  - `processAbandonmentCheck(cartId: string, deps: { db, startCall }): Promise<"CALLED" | "SKIPPED_NOT_PENDING" | "SKIPPED_NO_CONSENT" | "SKIPPED_ACTIVE_CALL" | "SKIPPED_NOT_FOUND">` — transactional status check; the `ABANDONED` status change (with `abandonedAt`) and the creation of the `RINGING` CallLog commit together (`startCall(cartId, tx?)` accepts the transaction client), so a failed attempt rolls back and a BullMQ retry still sees `CHECKOUT_STARTED`. Socket emits happen after commit.
  - `startAbandonmentWorker(deps): Worker` (concurrency 5, separate ioredis connection with `maxRetriesPerRequest: null`, logs results).

- [ ] **Step 1:** Tests: `calls when checkout started and consented` (cart → ABANDONED, startCall called once); `does not call when cart completed before job runs`; `skips without consent`; `skips when customer already has RINGING or IN_PROGRESS call`; `skips unknown cart`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(queue): abandonment worker`.

### Task 3.3: Products & cart routes

**Files:**
- Create: `apps/server/src/services/cart.service.ts`, `src/routes/products.routes.ts`, `src/routes/carts.routes.ts`, `src/mappers/cart.mapper.ts`
- Test: `apps/server/src/__tests__/carts.routes.test.ts`

**Interfaces:**
- Produces: `listProducts(db)`, `createCart(db, items)`, `getCart(db, id)`, `replaceItems(db, id, items)` — unit prices copied from Product at write time; `subtotalPaise` recomputed on every change; `toCartDTO(cart)`.

- [ ] **Step 1:** Tests: `GET /api/products` returns 6; `POST /api/carts` with 2 × earbuds → subtotal 299800; unknown productId → 422; `PUT items` with `[]` → subtotal 0; `PUT` on a COMPLETED cart → 409; `GET` unknown → 404.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(api): products and carts`.

### Task 3.4: Checkout start & external webhook

**Files:**
- Create: `apps/server/src/services/checkout.service.ts`, `src/routes/webhook.routes.ts`; modify `src/routes/carts.routes.ts`
- Test: `apps/server/src/__tests__/checkout.test.ts`

**Interfaces:**
- Consumes: `scheduleAbandonmentCheck`, `getAbandonDelayMs` (Task 3.1).
- Produces: `startCheckout(deps, cartId, input: CheckoutInput): Promise<CartDTO>` (upsert Customer by phone — update name/email/consent; link cart; set `CHECKOUT_STARTED` + `checkoutStartedAt`; schedule only if `consentToCall`; reject empty cart with 422 `EMPTY_CART`); `handleCartAbandonedWebhook(deps, input): Promise<{ cartId, scheduledInMs }>`.
- Rate limit (express-rate-limit, 20/min/IP) on both routes.

- [ ] **Step 1:** Tests: checkout creates customer + delayed job; second checkout same cart → still one job, customer name updated; consent false → no job; empty cart → 422; checkout on ABANDONED cart allowed (re-schedules); webhook creates cart + job and returns `scheduledInMs === 30000`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(api): checkout start and cart-abandoned webhook`.

**Stage 3 gate:** With server running, `curl` the webhook with phone `9876543210`; after 30 s the logs show `processAbandonmentCheck → CALLED` (use a temporary logging `startCall` stub until Stage 4). Stop and report.

---

## STAGE 4 — Realtime & call lifecycle

### Task 4.1: Call service — start, answer, decline, miss

**Files:**
- Create: `apps/server/src/calls/call.service.ts`, `src/calls/call.timers.ts`, `src/calls/greeting.ts`, `src/mappers/call.mapper.ts`, `src/realtime/emitter.ts`, `src/services/cache.ts` (`bumpCacheVersion(redis)`, `getCacheVersion(redis)` — moved here from Task 5.2 because call writes need it first)
- Test: `apps/server/src/__tests__/call-lifecycle.test.ts`, `cache.test.ts` (bump increments; get returns 0 when unset)

**Interfaces:**
- Produces:
  - `interface Emitter { toPhone(phone, event, payload): void; toDashboard(event, payload): void }` and `createFakeEmitter()` for tests (records emissions).
  - `buildGreeting(ctx: { customerName: string; items: { name: string }[] }): string` — exact §8.3 copy; `" and 1 more item"` / `" and N more items"`.
  - `class CallTimers` (in-memory `Map<callId, Timeout>` for ring, max-duration, disconnect-grace; `set(kind, callId, ms, fn)`, `clear(kind, callId)`, `clearAll(callId)`).
  - `createCallService(deps: { db, redis, emitter, timers, env, agent, analyzer, metrics }): CallService` (`redis` is for `bumpCacheVersion`; `metrics: { schedule(): void }` is a no-op stub until Task 9.1 provides the real broadcaster) with:
    - `startCall(cartId): Promise<CallLog>` — create RINGING call, emit `call:incoming` + `dashboard:call-updated`, set ring timer → `markMissed`.
    - `answerCall(callId, phone): Promise<AgentReplyPayload>` — verify ownership & RINGING, set IN_PROGRESS, store greeting as AGENT turn, set max-duration timer, emit dashboard updates.
    - `declineCall(callId, phone)`, `markMissed(callId)` (emit `call:ring-cancelled`).
    - `getActiveCallForPhone(phone): Promise<IncomingCallPayload | null>`.
    - `recoverStaleCalls(): Promise<number>` (§10.2) — on startup: `RINGING` calls older than `RING_TIMEOUT_MS` → `MISSED`/`NO_ANSWER`; `IN_PROGRESS` calls older than `MAX_CALL_DURATION_MS` → ended with `SERVER_RESTART`; for younger active calls, re-arm the ring / max-duration timers from `startedAt` / `answeredAt` (timers are in-memory and are lost on restart).
  - `agent` and `analyzer` are injected (real ones in Stage 6; tests use stubs).

- [ ] **Step 1:** Tests (fake timers): `startCall emits incoming to phone room`; `answer sets IN_PROGRESS and returns greeting "Hi Rohan, this is Aria from ShopNest. I noticed you left Wireless Earbuds Pro in your cart. ..."`; `answer by wrong phone rejected`; `answer after miss rejected`; `ring timeout marks MISSED with NO_ANSWER`; `decline sets ENDED with DECLINED`; `recoverStaleCalls ends old IN_PROGRESS calls with SERVER_RESTART`; `recoverStaleCalls misses stale RINGING calls`; `recoverStaleCalls re-arms timers for young active calls`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(calls): call lifecycle start/answer/decline/miss`.

### Task 4.2: Socket.IO server and handlers

**Files:**
- Create: `apps/server/src/realtime/socket.ts`, `src/realtime/handlers/phone.handlers.ts`, `src/realtime/handlers/dashboard.handlers.ts`; modify `src/server.ts` (attach Socket.IO, start worker, run `recoverStaleCalls`, graceful shutdown on SIGINT/SIGTERM closing worker, queue, redis, prisma, http)
- Test: `apps/server/src/__tests__/socket.test.ts` (real server on random port + `socket.io-client`)

**Interfaces:**
- Consumes: `CallService` (4.1), event types (0.4).
- Produces: `createSocketServer(httpServer, deps): { io, emitter: Emitter }` — typed with `ServerToClientEvents`/`ClientToServerEvents`; CORS `WEB_ORIGIN`; `socket.data.phone` set on `phone:register` (validated); handlers map to CallService methods and reply via ack; every handler validates payload with Zod and wraps errors into `{ok:false, error}`.

- [ ] **Step 1:** Tests: `register joins room and receives call:incoming`; `register re-delivers ringing call` (call created before register → ack contains `activeCall`); `answer ack contains greeting`; `utterance for someone else's call rejected`; `dashboard:join receives dashboard:call-updated`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(realtime): socket server and call handlers`.

### Task 4.3: Utterance handling, hang-up, disconnect grace, call end

**Files:**
- Modify: `apps/server/src/calls/call.service.ts`, `src/realtime/handlers/phone.handlers.ts`
- Create: `apps/server/src/calls/outcome.ts`
- Test: `apps/server/src/__tests__/call-conversation.test.ts`, `outcome.test.ts`

**Interfaces:**
- Consumes: `agent.runTurn(ctx): Promise<AgentTurnResult>` and `analyzer.analyze(transcript): Promise<CallAnalysis>` (signatures defined in Task 6.1; stub here).
- Produces:
  - `handleUtterance(callId, phone, text): Promise<void>` — truncate to 500 chars, ignore blank, store CUSTOMER turn, emit `dashboard:turn`, run agent, store AGENT turn with `latencyMs`, emit `call:agent-reply` (with `voucher` card if issued this turn), and if `endsCall` call `endCall(callId, "AGENT_ENDED")` after emitting. Serialize turns per call (a per-call promise chain) so overlapping utterances are processed in order.
  - `endCall(callId, reason: "CUSTOMER_HANGUP" | "AGENT_ENDED" | "MAX_DURATION" | "DISCONNECTED" | "LLM_FAILURE" | "SERVER_RESTART"): Promise<void>` — idempotent; sets ENDED, `endedAt`, `durationSec` (from `answeredAt`), `avgLatencyMs`; runs analyzer; computes outcome via `decideOutcome`; emits `call:ended`, `dashboard:call-updated`, schedules metrics emit; `bumpCacheVersion`.
  - `decideOutcome(input: { status, answered: boolean, declinedWhileRinging: boolean, voucherIssued: boolean, intent?: Intent, orderPlaced: boolean }): CallOutcome` — implements the §7.3 table exactly.
  - On socket disconnect while the phone has an IN_PROGRESS call: start `DISCONNECT_GRACE_MS` timer; `phone:register` from the same phone within grace clears it.

- [ ] **Step 1:** Tests: `decideOutcome` — one case per §7.3 row; `utterance stores customer and agent turns in order`; `blank utterance ignored`; `600-char utterance truncated to 500`; `agent endsCall ends call after reply emitted`; `hangup twice is idempotent`; `disconnect grace ends call with UNDECIDED`; `reconnect within grace keeps call`; `max duration ends call`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(calls): conversation turns and call ending`.

### Task 4.4: Order completion

**Files:**
- Create: `apps/server/src/services/order.service.ts`, `src/routes/orders.routes.ts`; modify `src/routes/carts.routes.ts`
- Test: `apps/server/src/__tests__/orders.test.ts`

**Interfaces:**
- Consumes: `cancelAbandonmentCheck` (3.1); `validateVoucher`, `redeemVoucher` (Task 5.2 — implement this task after 5.2 if working strictly in order; the stage ordering below places Stage 5 before this task's voucher tests, see note).
- Produces: `completeOrder(deps, cartId, voucherCode?): Promise<OrderDTO>` — single Prisma transaction: re-validate voucher, compute totals with `computeTotals`, create Order, redeem voucher, set cart `RECOVERED` if any CallLog exists for the cart else `COMPLETED`, set `completedAt`, set the latest call's outcome `RECOVERED`, add `totalPaise` to customer lifetime value; after commit: cancel job, emit `dashboard:call-updated` + metrics, `bumpCacheVersion`. `getOrder(db, id)`.

> **Ordering note:** do Task 4.4 Steps 1–5 *after* Task 5.2. Stage 4's gate does not include it.

- [ ] **Step 1:** Tests: `complete without voucher → COMPLETED, total includes shipping`; `complete removes scheduled job`; `complete with call-issued 10% voucher → RECOVERED, call outcome RECOVERED, voucher REDEEMED, discount 14990`; `expired voucher → 422`; `voucher for other cart → 422`; `second complete → 409`; `lifetime value increased by total`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(api): order completion with voucher redemption`.

**Stage 4 gate:** With a stub agent that echoes "You said: …", use a small script `apps/server/scripts/smoke-call.ts` (socket.io-client) to: trigger webhook → receive incoming → answer → send utterance → receive echo → hang up → see call ENDED in DB. Stop and report.

---

## STAGE 5 — Voucher guardrails

### Task 5.1: Discount policy (pure functions)

**Files:**
- Create: `apps/server/src/vouchers/discount-policy.ts`, `src/vouchers/code-generator.ts`
- Test: `apps/server/src/__tests__/discount-policy.test.ts`, `code-generator.test.ts`

**Interfaces:**
- Produces:
  - `resolveDiscountPercent(requested: unknown, opts: { subtotalPaise: number; capPercent: number; minCartPaise: number }): { ok: true; percent: 5 | 10 | 15 } | { ok: false; reason: "INVALID_PERCENT" | "CART_TOO_SMALL" }`.
  - `generateVoucherCode(rand?: (max: number) => number): string` (defaults to `crypto.randomInt`).

- [ ] **Step 1:** Tests (table-driven): 10→10, 12→10, 15→15, 16→15, 40→15, 100→15, 3→5, 1→5, 0→INVALID, -5→INVALID, "abc"→INVALID, 7.9→5, NaN→INVALID; cap 10 with request 15 → 10; subtotal 49999 → CART_TOO_SMALL; 1000 generated codes all match `VOUCHER_REGEX` and contain no `0 O 1 I L`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(vouchers): discount policy and code generator`.

### Task 5.2: Voucher service (issue, validate, redeem, expire)

**Files:**
- Create: `apps/server/src/vouchers/voucher.service.ts`
- Test: `apps/server/src/__tests__/voucher-service.test.ts`

**Interfaces:**
- Consumes: Task 5.1.
- Produces:
  - Uses `bumpCacheVersion` / `getCacheVersion` from `cache.ts` (created in Task 4.1).
  - `issueVoucher(deps, { cartId, callId, requestedPercent }): Promise<IssueVoucherResult>` where `IssueVoucherResult = { ok: true; voucher: VoucherCard; spokenCode: string; alreadyIssued: boolean } | { ok: false; reason: "INVALID_PERCENT" | "CART_TOO_SMALL" | "LIMIT_REACHED" | "CART_NOT_ELIGIBLE" }` — implements FR-5.4 inside a transaction; collision retry ×5.
  - `validateVoucher(db, code, cartId, now = new Date()): Promise<{ valid: true; voucher } | { valid: false; reason: "NOT_FOUND" | "WRONG_CART" | "EXPIRED" | "NOT_ACTIVE" }>` (codes compared upper-cased and trimmed; marks an expired ACTIVE voucher `EXPIRED`).
  - `redeemVoucher(tx, voucherId, orderId)`.
  - Route `POST /api/vouchers/validate` and `GET /api/vouchers`.

- [ ] **Step 1:** Tests: `issues 10 percent voucher for 1499 cart`; `same tier returns existing with alreadyIssued`; `lower tier returns existing`; `higher tier supersedes old voucher`; `third issuance in one call → LIMIT_REACHED`; `completed cart → CART_NOT_ELIGIBLE`; `validate lowercase code succeeds`; `validate after 24h → EXPIRED and status updated`; `validate wrong cart → WRONG_CART`; `superseded → NOT_ACTIVE`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(vouchers): issue, validate, redeem`.

→ Now complete **Task 4.4**.

**Stage 5 gate:** `npm test -w @voiceretain/server` all green, including Task 4.4. Stop and report.

---

## STAGE 6 — AI agent

### Task 6.1: LLM client interface, Gemini client, mock client

**Files:**
- Create: `apps/server/src/agent/llm.types.ts`, `src/agent/gemini.client.ts`, `src/agent/mock.client.ts`, `src/agent/tools.ts`, `src/agent/create-llm.ts`
- Test: `apps/server/src/__tests__/mock-llm.test.ts`, `gemini-client.test.ts`

**Interfaces:**
- Produces:
  - `type ChatMessage = { role: "user" | "model"; text?: string; functionCall?: { name: string; args: Record<string, unknown>; id?: string }; functionResponse?: { name: string; response: Record<string, unknown>; id?: string } }`.
  - `interface LlmClient { generate(req: { systemPrompt: string; history: ChatMessage[]; tools: ToolDeclaration[]; timeoutMs: number }): Promise<{ text?: string; functionCalls: { name: string; args: Record<string, unknown>; id?: string }[] }>; analyze(req: { transcript: string; timeoutMs: number }): Promise<CallAnalysis> }`.
  - `type CallAnalysis = { sentiment: Sentiment; objection: Objection; intent: "WILL_PURCHASE" | "UNDECIDED" | "DECLINED"; summary: string }`.
  - `TOOL_DECLARATIONS` for `issueDiscountCode` and `endCall` exactly as §8.4.
  - `class GeminiLlmClient implements LlmClient` — `@google/genai` `GoogleGenAI`, `models.generateContent` with `systemInstruction`, `tools: [{ functionDeclarations }]`; `analyze` uses `responseMimeType: "application/json"` + `responseSchema`; timeout via `AbortController`; one retry on 429/5xx; throws `LlmError` with `kind: "TIMEOUT" | "RATE_LIMIT" | "SERVER" | "BAD_RESPONSE"`. Verify current SDK syntax and that `GEMINI_MODEL`'s default id exists before implementing. Gemini 3 models may require thought signatures to be echoed back on function-call turns: keep the SDK's raw content parts (opaque `raw?: unknown` on `ChatMessage`) and replay them unchanged.
  - `class MockLlmClient implements LlmClient` — §8.7 rules. The mock's `generate` must behave like a real model across the tool loop: first call returns function calls, the follow-up call (history ends with a functionResponse) returns the reply text using `spokenCode` from that response.
  - `createLlm(env): LlmClient`.

- [ ] **Step 1:** Mock tests: "shipping is too expensive" → first `generate` returns `issueDiscountCode {percent:10, reason:"SHIPPING_COST"}`; follow-up with functionResponse returns text containing the spokenCode; "give me 50%" → percent 15; "no thanks bye" → `endCall {reason:"DECLINED"}`; unmatched → the clarifying question. Gemini tests: mock the SDK module (`vi.mock("@google/genai")`) and assert request shape (model id from env, tools present, systemInstruction set), timeout maps to `LlmError TIMEOUT`, 429 retried once.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(agent): llm client interface, gemini and mock clients`.

### Task 6.2: Prompt builder

**Files:**
- Create: `apps/server/src/agent/prompt.ts`
- Test: `apps/server/src/__tests__/prompt.test.ts`

**Interfaces:**
- Produces: `type CallContext = { callId: string; cartId: string; customerName: string; items: { name: string; quantity: number; unitPricePaise: number }[]; subtotalPaise: number; maxDiscountPercent: number }` (from `env.MAX_DISCOUNT_PERCENT`); `buildSystemPrompt(ctx: CallContext): string` (exact §8.2 text, prices via `formatINR`); `buildCallContext(db, callId): Promise<CallContext>`; `historyFromTurns(turns): ChatMessage[]` (AGENT → model, CUSTOMER → user, SYSTEM skipped).

- [ ] **Step 1:** Tests: prompt contains `"- 1 × Wireless Earbuds Pro at ₹1,499"`, `"Cart subtotal: ₹1,499. Shipping: ₹99 (free at ₹2,000 or above)."`, `"more than 15 percent"`; customer text never appears in the system prompt; history mapping order preserved.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(agent): system prompt builder`.

### Task 6.3: Agent turn runner with tool loop and fallbacks

**Files:**
- Create: `apps/server/src/agent/agent.service.ts`
- Test: `apps/server/src/__tests__/agent-service.test.ts`

**Interfaces:**
- Consumes: `LlmClient` (6.1), `buildSystemPrompt`/`historyFromTurns` (6.2), `issueVoucher` (5.2).
- Produces:
  - `type AgentTurnResult = { replyText: string; voucher?: VoucherCard; endsCall: boolean; endReason?: string; latencyMs: number; failed: boolean }`.
  - `createAgentService(deps: { db, llm, redis, env }): { runTurn(input: { callId: string; customerText: string; consecutiveFailures: number }): Promise<AgentTurnResult> }` — tool loop max 3 round-trips; executes `issueDiscountCode` via `issueVoucher` with the model's `percent` (the policy, not the model, decides the final value); `endCall` sets `endsCall`; unknown tool → functionResponse `{ok:false, reason:"UNKNOWN_TOOL"}`; on `LlmError` returns the §8.6 fallback with `failed:true`; when `consecutiveFailures` reaches 2 before this failing turn (i.e., this is the 3rd) returns the goodbye fallback with `endsCall:true, endReason:"LLM_FAILURE"`. CallService tracks `consecutiveFailures` per call (reset on success).
  - Strip markdown characters (`*`, `#`, `` ` ``) from replies before returning.

- [ ] **Step 1:** Tests with a scripted fake `LlmClient`: `model requesting 40 percent yields 15 percent voucher` (and the voucher card carries the real written code while the reply text contains its `spokenCode`); `voucher card returned in result`; `endCall tool sets endsCall`; `timeout produces fallback reply`; `three failures end call`; `tool loop stops after 3 round-trips with fallback text`; `markdown stripped`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(agent): turn runner with guarded tool calls`.

### Task 6.4: Post-call analyzer & wiring

**Files:**
- Create: `apps/server/src/agent/analyzer.service.ts`; modify `src/server.ts` / `src/app.ts` to wire real `agent` and `analyzer` into `CallService`
- Test: `apps/server/src/__tests__/analyzer.test.ts`

**Interfaces:**
- Produces: `createAnalyzer(deps: { llm, env }): { analyze(turns: TranscriptTurnDTO[]): Promise<CallAnalysis> }` — formats transcript as `Agent: …\nCustomer: …`; no customer turns → §8.5 default without calling the LLM; LLM failure → §8.5 failure default; summary truncated to 200 chars.

- [ ] **Step 1:** Tests: no customer turns → no LLM call, summary "Customer did not speak."; failure → "Analysis unavailable."; valid response passes through; 300-char summary truncated.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(agent): post-call analysis and wiring`.

**Stage 6 gate:** With `MOCK_LLM=true`, run `scripts/smoke-call.ts` saying "shipping is too expensive" then "okay" — the script prints a reply containing the spoken code and a voucher card with a written `VR-` code, the call ends with outcome `ACCEPTED_OFFER`. Then, if a `GEMINI_API_KEY` is set, repeat with `MOCK_LLM=false` and paste the transcript in the report. Stop and report.

---

## STAGE 7 — Web app foundation & demo store

### Task 7.1: Next.js app scaffold, design system, API & socket clients

**Files:**
- Create: `apps/web` via `create-next-app` (TypeScript, App Router, Tailwind v4, ESLint, `src/` dir off, import alias `@/*`); `apps/web/app/layout.tsx`, `app/globals.css` (Tailwind v4 `@import "tailwindcss"` + `@theme` tokens: brand indigo, success green, warning amber, danger red; Inter via `next/font`), `lib/api.ts`, `lib/socket.ts`, `components/ui/{Button,Card,Input,Badge,Spinner,Toast}.tsx`, `vitest.config.ts`, `vitest.setup.ts`
- Test: `apps/web/lib/__tests__/api.test.ts`

**Interfaces:**
- Produces:
  - `api` object with one typed function per §9.1 route (e.g. `api.createCart(items): Promise<CartDTO>`), throwing `ApiClientError { status, code, message, details }` on non-2xx.
  - `getSocket(): Socket<ServerToClientEvents, ClientToServerEvents>` singleton (`autoConnect: true`, reconnection on).
  - `useCartId()` hook (localStorage key `vr.cartId`, SSR-safe).

- [ ] **Step 1:** Test (mock `fetch`): `api.getProducts` hits `${NEXT_PUBLIC_API_URL}/api/products`; non-2xx throws `ApiClientError` with server `code`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS; `npm run build -w @voiceretain/web` succeeds.
- [ ] **Step 5:** Commit `feat(web): next.js scaffold, ui kit, api and socket clients`.

### Task 7.2: Store pages — products, cart

**Files:**
- Create: `apps/web/app/(store)/layout.tsx` (header with "ShopNest" wordmark in text, cart count), `app/(store)/page.tsx`, `app/(store)/cart/page.tsx`, `components/store/{ProductCard,CartLine,CartSummary}.tsx`, `public/products/*.svg` (6 original simple SVG illustrations)
- Test: `apps/web/components/store/__tests__/CartSummary.test.tsx`

- [ ] **Step 1:** Test: `CartSummary` with subtotal 149900 shows "₹1,499", shipping "₹99", total "₹1,598"; with 250000 shows "Free" shipping.
- [ ] **Step 2:** FAIL → **Step 3:** implement (add-to-cart creates the cart on first add, then `PUT items`; optimistic quantity updates with rollback on error) → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): product list and cart`.

### Task 7.3: Checkout, payment step, leave page, order confirmation

**Files:**
- Create: `apps/web/app/(store)/checkout/page.tsx`, `components/store/{CheckoutForm,PaymentStep,VoucherInput}.tsx`, `app/(store)/left/page.tsx`, `app/(store)/order/[id]/page.tsx`
- Test: `apps/web/components/store/__tests__/CheckoutForm.test.tsx`, `VoucherInput.test.tsx`

- [ ] **Step 1:** Tests: form shows inline errors for name "R" and phone "12345"; consent checkbox unticked shows the note "We won't call you about this order."; `VoucherInput` on valid response shows "10% off — you save ₹149.90" and on `EXPIRED` shows "This code has expired".
- [ ] **Step 2:** FAIL → **Step 3:** implement — `?cart=<id>&code=<code>` sets `vr.cartId`, jumps to the payment step if the cart already has a customer, pre-fills and auto-applies the code; "Place order" → `api.completeOrder` → `/order/[id]` and clears `vr.cartId`; "Leave store" → `/left`. → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): checkout, payment, order confirmation`.

**Stage 7 gate:** Manually: add a product, check out with consent, place order without voucher → confirmation page; then a second cart, check out, click "Leave store" → server logs a scheduled job; check the cart is ABANDONED after the delay. Stop and report with screenshots.

---

## STAGE 8 — Phone simulator

### Task 8.1: Speech hooks and ringtone

**Files:**
- Create: `apps/web/lib/speech/useSpeechRecognition.ts`, `useSpeechSynthesis.ts`, `ringtone.ts`
- Test: `apps/web/lib/speech/__tests__/useSpeechRecognition.test.ts`, `useSpeechSynthesis.test.ts`

**Interfaces:**
- Produces:
  - `useSpeechRecognition(opts: { lang?: string; onFinal: (text: string) => void }): { supported: boolean; permission: "unknown" | "granted" | "denied"; listening: boolean; interim: string; start(): void; stop(): void; error: string | null }` — `continuous: false`, `interimResults: true`, `lang: "en-IN"`; auto-restarts on `onend` only while a `wantListening` ref is true; `not-allowed` error sets `permission = "denied"`; `no-speech` restarts silently.
  - `useSpeechSynthesis(): { supported: boolean; speaking: boolean; speak(text: string): Promise<void>; cancel(): void }` — voice selection per FR-7.8 (voices load asynchronously — wait for `voiceschanged`); resolves on `onend`/`onerror`; works around Chrome's long-utterance cutoff by splitting text on sentence boundaries.
  - `createRingtone(): { start(): Promise<boolean>; stop(): void }` — Web Audio two-tone ring (440 Hz + 480 Hz, 2 s on / 4 s off); `start` returns false if the AudioContext is suspended.

- [ ] **Step 1:** Tests with a fake `window.webkitSpeechRecognition` class: unsupported → `supported:false`; final result calls `onFinal("shipping is expensive")`; `not-allowed` → `permission:"denied"`; synthesis splits "One. Two? Three!" into 3 utterances and resolves after the last `onend`; prefers an `en-IN` voice.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): speech recognition, synthesis, ringtone`.

### Task 8.2: Phone UI and call state machine

**Files:**
- Create: `apps/web/app/phone/page.tsx`, `components/phone/{PhoneFrame,RegisterPhone,IdleScreen,RingingScreen,InCallScreen,TranscriptView,VoucherCardView,TypedInput}.tsx`, `lib/phone/usePhoneCall.ts`
- Test: `apps/web/lib/phone/__tests__/usePhoneCall.test.ts`, `components/phone/__tests__/InCallScreen.test.tsx`

**Interfaces:**
- Consumes: `getSocket` (7.1), speech hooks (8.1), events (0.4).
- Produces: `usePhoneCall(phone: string | null)` → `{ state: "unregistered" | "idle" | "ringing" | "connecting" | "listening" | "thinking" | "speaking" | "ended"; incoming?: IncomingCallPayload; transcript: { speaker: "AGENT" | "CUSTOMER"; text: string }[]; voucher?: VoucherCard; muted: boolean; answer(); decline(); hangup(); sendText(text: string); toggleMute(); dismissEnded() }`. Flow: answer → speak greeting → listening; final speech/typed text → `call:utterance`, state `thinking` (recognition stopped); `call:agent-reply` → state `speaking`, speak, then `listening` (or end if `endsCall`); `call:ended` → `ended` screen showing duration and the voucher card if any, auto-return to idle after 10 s.

- [ ] **Step 1:** Tests (mock socket + mock speech hooks): `answer emits call:answer and speaks greeting`; `recognition is stopped while speaking` (Review Focus — half-duplex); `typed text sends utterance and enters thinking`; `falls back to typed input when recognition unsupported` (InCallScreen shows the browser-support message and the input is focused); `agent reply with voucher shows card with Complete my order link to /checkout?cart=…&code=…`; `call:ring-cancelled returns to idle with "Missed call from ShopNest"`.
- [ ] **Step 2:** FAIL → **Step 3:** implement (Framer Motion for ring vibration, screen transitions; ARIA live region on transcript) → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): phone simulator`.

**Stage 8 gate:** With `MOCK_LLM=true`, run demo-script steps 1–8 (§5) manually in Chrome, using voice and then again with typed input only. Stop and report.

---

## STAGE 9 — Merchant dashboard

### Task 9.1: Metrics, calls, and search services + routes

**Files:**
- Create: `apps/server/src/services/metrics.service.ts`, `src/services/calls-query.service.ts`, `src/services/search.service.ts`, `src/routes/dashboard.routes.ts`, `src/routes/calls.routes.ts`, `src/routes/search.routes.ts`, `src/realtime/metrics-broadcaster.ts`
- Test: `apps/server/src/__tests__/metrics.test.ts`, `calls-query.test.ts`, `search.test.ts`

**Interfaces:**
- Consumes: `getCacheVersion`/`bumpCacheVersion` (5.2), `Emitter` (4.1).
- Produces:
  - `getMetrics(deps): Promise<DashboardMetrics>` — `abandonedCarts` = carts with status ABANDONED or RECOVERED; `callsPlaced` = all CallLogs; `answerRate` = answered/placed (0 when none); `recoveredCarts` = RECOVERED carts; `recoveryRate` = recovered/abandoned; `revenueRecoveredPaise` = sum of `Order.totalPaise` for RECOVERED carts; `avgLatencyMs` = mean of AGENT turns' `latencyMs` (null-safe); sentiment counts; `last7Days` in Asia/Kolkata calendar days, zero-filled. Cached per §10.3.
  - `listCalls(db, { cursor, limit, outcome, sentiment })`, `getCallDetail(db, id)`.
  - `search(deps, q): Promise<SearchResults>` — `ILIKE %q%` on the indexed columns, 5 per group, cached per §10.3; phones in results are returned unmasked (dashboard is the merchant's own data).
  - `createMetricsBroadcaster(deps): { schedule(): void }` — debounced 1 s, emits `dashboard:metrics`; CallService/OrderService call `schedule()`.

- [ ] **Step 1:** Tests: metrics on an empty DB are all zeros (no division by zero); with fixtures (2 abandoned, 1 recovered order total 144810) → recoveryRate 0.5, revenue 144810; last7Days has 7 entries; pagination returns `nextCursor` and no duplicates across pages; `search("rohan")` finds the customer; second identical search is served from cache (spy on db); after `bumpCacheVersion` the next search hits the db; `q="a"` → 400.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(api): dashboard metrics, calls, search with redis cache`.

### Task 9.2: Dashboard shell, overview, live call panel

**Files:**
- Create: `apps/web/app/dashboard/layout.tsx` (sidebar: Overview, Calls, Vouchers, Demo; header with GlobalSearch), `app/dashboard/page.tsx`, `components/dashboard/{MetricCard,RevenueChart,SentimentBreakdown,LiveCallPanel,RecentCallsTable,OutcomeBadge,SentimentBadge,GlobalSearch}.tsx`, `lib/dashboard/useDashboardSocket.ts`
- Test: `apps/web/components/dashboard/__tests__/LiveCallPanel.test.tsx`, `GlobalSearch.test.tsx`

**Interfaces:**
- Produces: `useDashboardSocket()` → `{ metrics?: DashboardMetrics; liveCall?: { call: CallSummaryDTO; turns: TranscriptTurnDTO[] }; recentCalls: CallSummaryDTO[] }` — joins `dashboard` on connect and on reconnect; initial data from REST, then patched by events.

- [ ] **Step 1:** Tests: `LiveCallPanel` appends a `dashboard:turn` for the active call and ignores turns for other calls; shows "No live call" when none; `GlobalSearch` debounces (one request for fast typing), renders grouped results, shows "No results" for empty groups.
- [ ] **Step 2:** FAIL → **Step 3:** implement (Recharts bar chart for last7Days; badges colour-coded; Framer Motion fade-in for new transcript turns) → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): dashboard overview and live call panel`.

### Task 9.3: Calls list, call detail, vouchers, demo control panel

**Files:**
- Create: `apps/web/app/dashboard/calls/page.tsx`, `app/dashboard/calls/[id]/page.tsx`, `app/dashboard/vouchers/page.tsx`, `app/dashboard/demo/page.tsx`, `components/dashboard/{CallsTable,TranscriptChat,VoucherTable,DemoControls}.tsx`; server: `src/routes/demo.routes.ts`, `src/services/demo.service.ts`
- Test: `apps/server/src/__tests__/demo.test.ts`, `apps/web/components/dashboard/__tests__/TranscriptChat.test.tsx`

**Interfaces:**
- Produces (server): `getDemoConfig`, `updateDemoConfig` (5000–600000 ms), `triggerLatest(deps): Promise<{ cartId } | null>` (uses `runAbandonmentCheckNow`), `resetDemo(deps)` — deletes all rows where `isSeed = false` in dependency order, obliterates the BullMQ queue, clears `search:*`/`metrics:*`, bumps cache version, re-runs `seedProducts` + `seedHistory`.

- [ ] **Step 1:** Tests: `updateDemoConfig(1000)` → 400; `triggerLatest` with no candidate → 404; `resetDemo` leaves only seed rows and zero queue jobs; `TranscriptChat` renders AGENT left, CUSTOMER right, SYSTEM centred, and shows `latencyMs` under agent turns.
- [ ] **Step 2:** FAIL → **Step 3:** implement (calls list: filters synced to URL query; detail page live-updates if the call is in progress; demo page: delay slider with presets 10 s / 30 s / 2 min, "Trigger call now", "Reset demo" with confirm dialog, MOCK_LLM status pill) → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(dashboard): calls, call detail, vouchers, demo controls`.

**Stage 9 gate:** Run the full §5 demo with `MOCK_LLM=true` and watch every dashboard page update without refresh. Stop and report with screenshots.

---

## STAGE 10 — Seed history & polish

### Task 10.1: Deterministic historical seed

**Files:**
- Create: `apps/server/src/seed/history.ts`, `src/seed/fixtures/{names.ts,conversations.ts}`; modify `prisma/seed.ts`
- Test: `apps/server/src/__tests__/seed-history.test.ts`

**Interfaces:**
- Produces: `seedHistory(db, { now?: Date; rngSeed?: number }): Promise<void>` — idempotent (deletes existing `isSeed` rows first), creates the §13 distribution with `isSeed = true`, timestamps spread over the last 7 days, vouchers obeying FR-5 (tiers only, ≤15), orders for RECOVERED, transcripts built from 6 conversation templates (shipping, price, trust, timing, changed mind, no-answer).

- [ ] **Step 1:** Tests: exactly 20 calls with outcomes 7/4/3/3/3; every seed voucher percent ∈ {5,10,15}; running twice still 20 calls; two runs with the same `now` + seed produce identical customer names.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(seed): deterministic historical calls`.

### Task 10.2: UX polish & resilience pass

**Files:** modify as needed across `apps/web` and `apps/server`.

- [ ] **Step 1:** Add: loading skeletons on dashboard tables; toast on API errors; empty states; connection-status dot (socket connected/reconnecting) in the phone and dashboard headers; `prefers-reduced-motion` respected; page titles.
- [ ] **Step 2:** Verify every §6 FR item against the running app; write the checklist result into `docs/acceptance-checklist.md` (one line per FR id: ✅/❌ + note). Fix every ❌.
- [ ] **Step 3:** Run `npm run lint && npm run typecheck && npm test` → all green.
- [ ] **Step 4:** Commit `chore: polish and acceptance checklist`.

**Stage 10 gate:** `npm run db:reset && npm run db:seed` → dashboard shows 20 historical calls and populated charts. Stop and report.

---

## STAGE 11 — Packaging, E2E, documentation

### Task 11.1: Dockerize apps

**Files:**
- Create: `apps/server/Dockerfile` (multi-stage, Node 22 slim, `prisma generate` in build, `prisma migrate deploy` + seed on start via `docker/server-entrypoint.sh`), `apps/web/Dockerfile` (Next.js `output: "standalone"`), `.dockerignore`; modify `docker-compose.yml` to add `server` (depends on healthy postgres/redis, env from `.env`) and `web` services.

- [ ] **Step 1:** Run `docker compose up --build -d` → all 4 services healthy; `curl localhost:4000/api/health` OK; `localhost:3000` renders the store.
- [ ] **Step 2:** Commit `chore(docker): containerize server and web`.

### Task 11.2: Playwright end-to-end test of the demo script

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/recovery-flow.spec.ts`

- [ ] **Step 1:** Write the spec: two browser contexts (store, phone) + one dashboard page; `MOCK_LLM=true`; set delay to 5 s via `PUT /api/demo/config`; register phone; add earbuds; checkout with consent; click "Leave store"; expect ringing within 15 s; answer; type "the shipping was too expensive"; expect voucher card matching `VOUCHER_REGEX`; type "can you do 50 percent"; expect agent text containing "15 percent"; hang up; expect dashboard call row outcome "Accepted offer"; click "Complete my order"; place order; expect dashboard outcome "Recovered" and revenue card increased.
- [ ] **Step 2:** Run `npx playwright test` → PASS (run against `docker compose` stack or `npm run dev`).
- [ ] **Step 3:** Commit `test(e2e): full recovery flow`.

### Task 11.3: README, architecture docs, demo guide

**Files:**
- Create/replace: `README.md`, `docs/architecture.md`, `docs/demo-guide.md`, `docs/viva-notes.md`

- [ ] **Step 1:** `README.md`: what it is, screenshots (3), architecture diagram (Mermaid version of §11), tech stack, quick start (`cp .env.example .env`, `docker compose up -d`, `npm install`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`), env var table, scripts table, testing, "Future Scope" (the §3 non-goals: real telephony with Twilio/Exotel, streaming STT/TTS, multi-tenant merchants, Shopify app & WooCommerce plugin & JS snippet, consent/DND compliance, billing on recovered revenue).
- [ ] **Step 2:** `docs/architecture.md`: Mermaid sequence diagram of the §5 flow; call state machine diagram; data model ER diagram (Mermaid `erDiagram`); explanation of the guardrail (why the server, not the prompt, enforces the cap); queue idempotency; cache versioning.
- [ ] **Step 3:** `docs/demo-guide.md`: pre-demo checklist (Chrome, headset, `MOCK_LLM` decision, `docker compose up`, reset demo, set delay 30 s, open 3 windows, allow mic), the §5 script with what to say, recovery steps if something fails (switch to typed input; switch `MOCK_LLM=true` and restart server; play backup video), how to use a real phone via a tunnel.
- [ ] **Step 4:** `docs/viva-notes.md`: short answers to — why a queue instead of `setTimeout`; why Socket.IO; how the 15% cap is enforced; how duplicate calls are prevented; why money is stored in paise; how search caching and invalidation work; what changes for real telephony; limitations of the Web Speech API.
- [ ] **Step 5:** Commit `docs: readme, architecture, demo guide, viva notes`.

**Stage 11 gate (project complete):** On a clean clone: `cp .env.example .env` (set `MOCK_LLM=true`), `docker compose up --build -d`, open the three windows, run the §5 demo successfully, and `npx playwright test` passes. Report final status, test counts, and any known limitations.

---

## Self-review record
- Spec coverage: FR-1 → Tasks 3.3, 3.4, 7.2, 7.3, 4.4 · FR-2 → 3.1, 3.2, 3.4, 9.3 · FR-3 → 4.1–4.3 · FR-4 → 6.1–6.4 · FR-5 → 5.1, 5.2, 4.4 · FR-6 → 9.1–9.3 · FR-7 → 8.1, 8.2 · §10 NFRs → 1.1, 4.1 (stale recovery), 5.2/9.1 (cache), 3.4 (rate limit) · §13 seed → 2.3, 10.1 · docs/demo → 11.3.
- Names used across tasks: `scheduleAbandonmentCheck`, `cancelAbandonmentCheck`, `runAbandonmentCheckNow`, `processAbandonmentCheck`, `createCallService`, `Emitter`, `issueVoucher`, `validateVoucher`, `redeemVoucher`, `bumpCacheVersion`, `getCacheVersion`, `LlmClient`, `createAgentService().runTurn`, `createAnalyzer().analyze`, `decideOutcome`, `completeOrder`, `getMetrics`, `search` — consistent throughout.
