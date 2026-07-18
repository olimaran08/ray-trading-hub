const express = require('express');
const cors = require('cors');
const path = require('path');
const store = require('./store');
const engine = require('./tradeEngine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Chartink posts form-encoded by default
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------------
// Chartink webhook — paste this URL (+ /webhook/chartink) into each of
// your two Chartink scanner alerts. Works whether Chartink sends JSON
// or form-encoded, and whether it sends one stock or a comma list.
// ---------------------------------------------------------------------
app.post('/webhook/chartink', (req, res) => {
  try {
    const body = req.body || {};
    const stocksRaw = body.stocks || body.stock || '';
    const pricesRaw = body.trigger_prices || body.trigger_price || '';
    const scanName = body.scan_name || body.alert_name || 'Chartink Alert';
    const alertName = body.alert_name || '';

    const symbols = String(stocksRaw).split(',').map(s => s.trim()).filter(Boolean);
    const prices = String(pricesRaw).split(',').map(p => parseFloat(p.trim()));

    if (symbols.length === 0) {
      return res.status(400).json({ ok: false, error: 'No stocks found in payload' });
    }

    const created = symbols.map((symbol, i) => {
      const price = Number.isFinite(prices[i]) ? prices[i] : prices[0];
      if (!Number.isFinite(price) || price <= 0) return null;
      return engine.openTradeFromAlert({ symbol, price, scanName, alertName });
    }).filter(Boolean);

    const skipped = symbols.length - created.length;
    console.log(`[webhook] ${scanName}: opened ${created.length} paper trade(s), skipped ${skipped} (duplicate stock or past 1:00 PM cutoff)`);
    res.json({ ok: true, opened: created.length, skipped, trades: created });
  } catch (err) {
    console.error('[webhook] error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Manual trade entry (handy for testing without Chartink)
app.post('/api/trades/manual', (req, res) => {
  const { symbol, price, scanName } = req.body;
  if (!symbol || !price) return res.status(400).json({ ok: false, error: 'symbol and price required' });
  const trade = engine.openTradeFromAlert({ symbol, price: parseFloat(price), scanName: scanName || 'Manual' });
  if (!trade) {
    const reason = engine.pastEntryCutoff()
      ? 'past 1:00 PM entry cutoff — no new trades taken after this time.'
      : `${symbol.toUpperCase()} already has a trade today — skipped duplicate.`;
    return res.json({ ok: false, error: reason });
  }
  res.json({ ok: true, trade });
});

app.get('/api/trades', (req, res) => {
  res.json({ ok: true, trades: store.getAllTrades() });
});

app.post('/api/trades/:id/close', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const trade = store.getAllTrades().find(t => t.id === id);
  if (!trade || trade.status !== 'OPEN') return res.status(404).json({ ok: false, error: 'Open trade not found' });
  const closed = engine.closeTrade(trade, trade.ltp, 'MANUAL CLOSE');
  res.json({ ok: true, trade: closed });
});

// Exit every open position right now, at current LTP.
app.post('/api/trades/exit-all', async (req, res) => {
  try {
    const closed = await engine.exitAllOpenTrades();
    res.json({ ok: true, closedCount: closed.length, trades: closed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Day-by-day P&L history (Day 1, Day 2, ...).
app.get('/api/day-history', (req, res) => {
  res.json({ ok: true, days: store.getDayHistory() });
});

// Wipe only one scanner's trades — for when a scanner's still being
// tuned and its test trades have piled up. Other scanners untouched.
app.post('/api/trades/reset-scanner', (req, res) => {
  const { scanName } = req.body;
  if (!scanName) return res.status(400).json({ ok: false, error: 'scanName required' });
  const removed = store.clearTradesByScanner(scanName);
  res.json({ ok: true, removed, scanName });
});

// Manually archive + clear today's board right now, instead of waiting for 8 PM.
app.post('/api/day-history/archive-now', (req, res) => {
  try {
    const today = engine.istDateStr();
    const record = store.archiveDay(today);
    res.json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/stats', (req, res) => {
  const trades = store.getAllTrades();
  const open = trades.filter(t => t.status === 'OPEN');
  const closed = trades.filter(t => t.status === 'CLOSED');
  const wins = closed.filter(t => t.pnl > 0);
  const losses = closed.filter(t => t.pnl <= 0);
  const realizedPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const unrealizedPnl = open.reduce((s, t) => s + t.pnl, 0);
  res.json({
    ok: true,
    stats: {
      totalTrades: trades.length,
      openCount: open.length,
      closedCount: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length ? round2((wins.length / closed.length) * 100) : 0,
      realizedPnl: round2(realizedPnl),
      unrealizedPnl: round2(unrealizedPnl),
      netPnl: round2(realizedPnl + unrealizedPnl),
    },
    rules: engine.RULES,
    marketOpen: engine.isMarketHours(),
  });
});

function round2(n) { return Math.round(n * 100) / 100; }

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'RAY TRADING HUB', time: engine.istNow().toISOString() });
});

app.listen(PORT, () => {
  console.log(`RAY TRADING HUB running on port ${PORT}`);
  engine.startMonitorLoop(15000);
});
