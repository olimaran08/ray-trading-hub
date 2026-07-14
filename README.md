# RAY TRADING HUB

A 100% paper-trading terminal for Indian intraday markets, wired directly to
your Chartink scanner alerts. No real orders are ever placed — every "trade"
is simulated using live NSE price data so you can test scanner strategies
risk-free.

## House rules (built into the engine)

| Rule | Value |
|---|---|
| Max investment per stock | ₹1,25,000 (exposure) |
| Leverage assumed | 5× (intraday/MIS) |
| Risk : Reward | 1 : 2 |
| Max loss per trade | ₹2,000 (auto stop-loss) |
| Max profit per trade | ₹4,000 (auto target booking) |
| Capital | Unlimited — every alert is taken |
| Auto square-off | 3:00 PM IST, every open position |
| Direction | Always BUY (long), as configured |

Position sizing is automatic: `qty = floor(125000 / entry price)`. The
stop-loss and target are placed so a full stop costs exactly ₹2,000 and a
full target pays exactly ₹4,000, whatever the quantity works out to.

## 1. Run it locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## 2. Deploy it for free (so it works on your phone too)

The easiest path is **Render**:

1. Push this repo to your own GitHub account (see below).
2. Go to [render.com](https://render.com) → **New** → **Web Service** →
   connect the repo. Render will detect `render.yaml` automatically —
   just click **Apply**.
3. Wait for the build to finish. Render gives you a URL like
   `https://ray-trading-hub.onrender.com`.
4. Open that URL on your phone and add it to your home screen — it's fully
   responsive and works like an app.

(Free-tier Render services sleep after inactivity; the first request after
a while takes a few seconds to wake up. If you trade every day this rarely
matters, but if you want zero cold-starts, upgrade the Render plan or use
Railway/Fly.io instead — the code is standard Node/Express and works
anywhere.)

## 3. Wire up your two Chartink scanners

1. Open the deployed hub — scroll to **"Connect your Chartink scanners"**.
2. Copy the webhook URL shown there
   (`https://your-app-url/webhook/chartink`).
3. On Chartink, open each scan → **Create Alert** → paste that URL into the
   **Webhook URL** field.
4. Do this for both scanners. The same URL works for both — every alert
   from either one opens a new paper position here automatically.
5. Use the **"Send test alert"** box on the hub to fire a test position
   without waiting for a real scan to trigger.

## How a trade's life cycle works

1. Chartink fires → webhook hits `/webhook/chartink` → a position opens at
   the alert's trigger price with quantity sized to ~₹1,25,000 exposure.
2. Every 15 seconds, the server checks live price (Yahoo Finance, NSE
   symbols) against each open position's target/stop-loss.
3. Target hit → booked at +₹4,000. Stop-loss hit → booked at −₹2,000.
4. Whatever's still open at 3:00 PM IST is force-closed at the current
   price, no exceptions.

## Project structure

```
server/
  index.js       — Express app, webhook + API routes
  tradeEngine.js — position sizing, SL/target, 3pm square-off logic
  priceFeed.js   — live LTP fetch (Yahoo Finance, no API key needed)
  store.js       — simple JSON-file trade ledger (data/trades.json)
public/
  index.html / style.css / app.js — the dashboard (mobile-first)
```

No database server, no API keys, no paid services required.
