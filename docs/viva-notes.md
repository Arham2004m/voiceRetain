# Viva notes

**Why a queue instead of `setTimeout`?**
A timer lives in one process's memory. If the server restarts, every pending call is lost. BullMQ stores delayed jobs in Redis, so they survive restarts, can be cancelled by id when the shopper pays, and can be rescheduled or inspected. The job id `abandon-<cartId>` also makes scheduling idempotent: the same cart can never have two jobs.

**Why Socket.IO?**
The call is a two-way, low-latency conversation, and the dashboard must update without refreshing. Socket.IO gives bidirectional events, rooms (`phone:<number>`, `dashboard`), automatic reconnection and a fallback transport. Plain REST polling would be slower and wasteful.

**How is the 15% cap enforced?**
In server code, not in the prompt. Tiers are 5, 10 and 15; requests are snapped down to a tier; the maximum is clamped to 15 even if the environment says more; carts under ₹500 get nothing; only one active voucher per cart; at most two issuances per call. The model only *asks*; the server decides. A jailbroken model still cannot exceed 15%.

**How are duplicate calls prevented?**
Three layers. One delayed job per cart (deterministic id). The worker re-checks that the cart is still unpaid before calling. And a PostgreSQL **partial unique index** allows only one `RINGING` or `IN_PROGRESS` call per customer, so even a race is rejected by the database.

**Why is money stored in paise?**
Floating-point numbers cannot represent amounts like 0.1 exactly, and errors accumulate. Integers cannot drift. Discounts use `floor(subtotal × percent / 100)` on integers, and formatting to rupees happens only at the display edge.

**How do search caching and invalidation work?**
Results are cached in Redis for 60 seconds under a key that includes a version number (`search:v{n}:{query}`). Anything that changes data bumps the version counter, so all old keys become unreachable instantly without hunting them down. Metrics use the same idea with a 10 second lifetime. The search itself uses trigram indexes for substring matching, and escapes `%` and `_` so user input is treated literally.

**What changes for real telephony?**
The phone page is replaced by a provider such as Twilio or Exotel, which dials the customer. Audio streams to a speech-to-text service and the reply goes through text-to-speech, ideally streaming for low latency. The agent, voucher rules, queue and dashboard stay the same, because they talk to the call service through a small interface. New needs: consent and Do-Not-Disturb compliance, retries and call windows, cost control, authentication.

**What are the limits of the Web Speech API?**
Recognition works well in Chrome and Edge, is patchy elsewhere, and in Chrome sends audio to Google's servers, so it needs internet. Accuracy varies with accent and noise. It is not streaming-grade and it can stop listening on its own. Speech synthesis voices differ by device, and some engines never fire the end event, so the app uses a timeout watchdog. That is why typed input is always available.

**What happens if the AI fails?**
The Gemini client has a timeout and one retry on 429, 5xx or network errors. If it still fails, the agent says a safe fallback line instead of going silent. A deterministic mock client exists for tests and offline demos.

**What is not verified yet?**
Be honest about it: voice recognition with a real mic, audible TTS and ringtone, and a real Gemini run were not exercised in automated or in-browser tests. See [acceptance-checklist.md](acceptance-checklist.md).

**What would you do next?**
Real telephony, multi-merchant support with login, Shopify and WooCommerce integrations, DND and consent compliance, billing on recovered revenue.
