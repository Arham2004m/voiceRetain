# Demo guide

## Before you present

- [ ] Use **Chrome or Edge** (the Web Speech API is limited elsewhere). A headset avoids the agent hearing itself.
- [ ] Postgres and Redis are running, `.env` exists, `npm run db:seed` has been run once.
- [ ] Decide the AI mode:
  - Real Gemini: `GEMINI_API_KEY` set and `MOCK_LLM=false`. **Do one full dry run first.**
  - Safe mode: `MOCK_LLM=true`. Predictable, needs no internet for the AI.
- [ ] `npm run dev`, and wait until both the server and the web app say ready.
- [ ] On the dashboard **Demo** page: **Reset demo** (keeps the 20 seeded calls), then set the abandonment delay to something short such as 10 seconds for the room. Reset it afterwards if you want the 30 s default.
- [ ] Open three windows: Store `http://localhost:3000`, Phone `http://localhost:3000/phone`, Dashboard `http://localhost:3000/dashboard`.
- [ ] On the Phone page, allow the microphone when asked, and click "Tap to enable sound" if it shows.
- [ ] Have a short screen recording of a good run ready as a backup.

## The script

Pick any product costing ₹500 or more (smaller carts get no discount by design). Example numbers below assume a ₹1,499 cart.

1. **Phone:** register `9876543210`.
2. **Store:** add the product to the cart, go to checkout, enter name "Rohan", phone `9876543210`, tick the call consent box, **Continue to payment**, then **Leave store**.
3. Wait for the delay. The **Phone** rings with "ShopNest, Rohan's order". The dashboard shows the call as *Ringing*. Point out the live update.
4. **Answer.** The agent greets.
5. Say: *"The shipping was too expensive."* The agent offers 10% with a code like `VR-8KQ2-X7MD`, shown on screen with a **Complete my order** link.
6. Say: *"Can you make it 50 percent?"* The agent says 15% is the most it can do, and a 15% code replaces the 10% one. Explain: the cap is in the server code, not the prompt.
7. **Hang up.** Within a few seconds the dashboard shows the call *Ended* with sentiment, objection, summary and outcome *Accepted offer*.
8. **Complete my order** on the phone, which opens checkout with the code filled in. **Place order.** The dashboard shows outcome *Recovered* and revenue recovered goes up by the order total.

Then open **Calls**, **Vouchers** and the search box to show the data behind it.

## If something fails

| Problem | Do this |
|---|---|
| Voice not recognised or no sound | Use the **typed input** box on the phone. The flow is identical. |
| Agent slow or silent, Gemini errors | Set `MOCK_LLM=true` in `.env`, restart `npm run dev`, carry on. |
| Phone never rings | Check the delay on the Demo page, that the phone number matches, and that the consent box was ticked. Use **Trigger call now** on the Demo page. |
| Dashboard looks stale | The connection light in the shell shows the Socket.IO state. Refresh the page. |
| Everything is messy after rehearsals | Demo page, **Reset demo**. Seeded history is kept. |
| Nothing works | Play the backup recording. |

## Using a real phone

The Phone page is just a web page, so a real phone can be the handset:

1. Put the laptop and phone on the same Wi-Fi, or run a tunnel such as `ngrok http 3000` (and one for port 4000).
2. Point `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL` and `WEB_ORIGIN` at the reachable addresses, then restart.
3. Open `/phone` on the phone and register the number. Browsers only allow the microphone on HTTPS or localhost, so a tunnel (HTTPS) is the easier route.

This is an unverified setup; try it before the day.
