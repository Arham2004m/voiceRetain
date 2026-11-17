# Acceptance checklist

Legend: ✅ verified (automated test and/or run live in the browser) · ⚠ built, but not verified end to end · ❌ not done.

"Live" means I drove it in the running app with `MOCK_LLM=1` and typed input. Nothing here was run against the real Gemini API or a real microphone.

## FR-1 Store

| ID | Status | Notes |
|---|---|---|
| FR-1.1 | ✅ | Catalogue is synced from dummyjson (184 active products, USD→INR at 85) with category chips and "Show 12 more". The 6 built-in products are the offline fallback. This deliberately exceeds the PRD's "6 products". |
| FR-1.2 | ✅ | Server-side cart, id in `localStorage`, quantity and remove. Tests plus live. |
| FR-1.3 | ✅ | Name, phone (6–9 start, 10 digits), optional email, consent. Shared Zod schema, tests plus live. |
| FR-1.4 | ✅ | Checkout start schedules the abandonment job. |
| FR-1.5 | ✅ | Voucher apply, place order, leave store. Live. |
| FR-1.6 | ✅ | `/checkout?cart=&code=` restores the cart and pre-fills the code. |
| FR-1.7 | ✅ | Order page shows subtotal, discount and total. |

## FR-2 Abandonment

| ID | Status | Notes |
|---|---|---|
| FR-2.1 | ✅ | Scheduled at checkout start. |
| FR-2.2 | ✅ | Job id `abandon-<cartId>`. Re-submitting does not duplicate. Tests. |
| FR-2.3 | ✅ | Job removed on order. The worker also re-checks the cart status. |
| FR-2.4 | ✅ | ABANDONED and RINGING `CallLog` are created in one transaction. Live. |
| FR-2.5 | ✅ | `POST /api/cart-abandoned` tested. |
| FR-2.6 | ✅ | `ABANDON_DELAY_MS` default, runtime override through the Demo page and Redis. |

## FR-3 Call lifecycle

| ID | Status | Notes |
|---|---|---|
| FR-3.1 | ✅ | Ring timeout leads to MISSED / NO_ANSWER. Tested with fake timers. |
| FR-3.2 | ✅ | Decline leads to ENDED / DECLINED. |
| FR-3.3 | ✅ | Templated greeting with no LLM call. Live. |
| FR-3.4 | ✅ | One agent turn per utterance, stored and emitted. Live. |
| FR-3.5 | ✅ | Hang up, agent `endCall`, max duration and disconnect grace are all covered by tests. Hang up and agent end were run live. |
| FR-3.6 | ✅ | Duration, latency, analysis and outcome per §7.3. Live. |
| FR-3.7 | ✅ | Partial unique index plus P2002 handling. Tests. |

## FR-4 AI agent (§8)

| ID | Status | Notes |
|---|---|---|
| FR-4 | ⚠ | Mock LLM verified live and in tests, including the tool loop and fallbacks. `GeminiLlmClient` is tested only against a fake SDK handle. **A real-Gemini run is pending the API key.** |

## FR-5 Voucher guardrails

| ID | Status | Notes |
|---|---|---|
| FR-5.1 | ✅ | Tiers 5/10/15, cap clamped to 15. The live run produced 10% and then a 15% cap. |
| FR-5.2 | ✅ | Snap down, 1–4 becomes 5, refuse ≤ 0 or non-numeric. |
| FR-5.3 | ✅ | Minimum cart ₹500. |
| FR-5.4 | ✅ | One active voucher per cart. Higher tier supersedes. Row lock. |
| FR-5.5 | ✅ | `VR-XXXX-XXXX`, unambiguous alphabet, `crypto.randomInt`, collision retry. |
| FR-5.6 | ✅ | 24 h TTL, cart-bound, single use. The dashboard shows an effective status once the time has run out. |
| FR-5.7 | ✅ | `floor(subtotal × percent / 100)` in paise. |

## FR-6 Merchant dashboard

| ID | Status | Notes |
|---|---|---|
| FR-6.1 | ✅ | Tally, headline, 7-day chart, sentiment bar, live panel. Checked against 20 seeded calls (₹27,457.10 from 7 of 20). |
| FR-6.2 | ✅ | Cursor pages of 20 with filters. Tests plus live. |
| FR-6.3 | ✅ | Chat-style transcript, summary, objection and voucher. |
| FR-6.4 | ✅ | Voucher table with status filter. |
| FR-6.5 | ✅ | Debounced 300 ms, grouped results, `%`/`_` escaped. Tests. |
| FR-6.6 | ✅ | Delay, trigger now and reset, all verified live. Reset keeps the seeded history and restores it. |
| FR-6.7 | ✅ | Live updates over Socket.IO, checked across two tabs. |

## FR-7 Phone simulator

| ID | Status | Notes |
|---|---|---|
| FR-7.1 | ✅ | Register, `localStorage` `vr.phone`, room join, change number. |
| FR-7.2 | ✅ | Lock-screen idle, ringing screen with Answer and Decline. |
| FR-7.3 | ⚠ | Visual ring and "Tap to enable sound" hint are built. **Audible ringtone not checked** (the pane has no audio). |
| FR-7.4 | ✅ | Timer, transcript, state indicator, mute, hang up and typed input all work. Typed path live. |
| FR-7.5 | ⚠ | Half-duplex logic is covered by tests, with a speech watchdog for engines that never fire `onend`. **Not tried with a real mic and speakers.** |
| FR-7.6 | ⚠ | Typed Enter verified, 500-char truncation tested. **Recognition results not tried with a real mic.** |
| FR-7.7 | ✅ | Voucher card with a "Complete my order" link. Live. |
| FR-7.8 | ⚠ | `en-IN` voice preference implemented and unit tested. **Audio not heard.** |
| FR-7.9 | ✅ | Fallback message shown when recognition is unsupported, tested. |

## Open items

1. Run the full `npm test` with the real `prisma migrate reset` in your own terminal (I use `SKIP_DB_RESET=1`, because the reset is blocked for agents).
2. Supply the Gemini key for one real-LLM pass, then test voice in Chrome or Edge.
3. Stage 11 is not started: Docker Compose images, Playwright E2E, README and viva notes. `docker-compose.yml` exists but has never been run (Docker isn't installed here).
