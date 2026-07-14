const store = require('./store');
const { getLTP } = require('./priceFeed');

// ---- RAY TRADING HUB — house rules ----------------------------------
const RULES = {
  MAX_INVESTMENT_PER_STOCK: 125000, // ceiling exposure (with leverage) per position
  LEVERAGE: 5,                       // intraday MIS-style leverage assumed
  MAX_PROFIT_PER_TRADE: 4000,        // booked automatically if hit
  MAX_LOSS_PER_TRADE: 2000,          // stopped out automatically if hit
  RISK_REWARD: 2,                    // 1:2 — implied by 2000 / 4000 above
  SQUARE_OFF_HOUR: 15,               // 3:00 PM IST — force-close everything open
  SQUARE_OFF_MINUTE: 0,
  MARKET_OPEN: { h: 9, m: 15 },
  MARKET_CLOSE: { h: 15, m: 30 },
};

function istNow() {
  // Convert server time to IST (UTC+5:30) regardless of host timezone.
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 60 * 60000);
}

function isMarketHours(d = istNow()) {
  const mins = d.getHours() * 60 + d.getMinutes();
  const open = RULES.MARKET_OPEN.h * 60 + RULES.MARKET_OPEN.m;
  const close = RULES.MARKET_CLOSE.h * 60 + RULES.MARKET_CLOSE.m;
  const day = d.getDay();
  return day >= 1 && day <= 5 && mins >= open && mins <= close;
}

function pastSquareOff(d = istNow()) {
  const mins = d.getHours() * 60 + d.getMinutes();
  const cutoff = RULES.SQUARE_OFF_HOUR * 60 + RULES.SQUARE_OFF_MINUTE;
  return mins >= cutoff;
}

// Build a new paper position from a Chartink alert for a single symbol.
function openTradeFromAlert({ symbol, price, scanName, alertName }) {
  const qty = Math.max(1, Math.floor(RULES.MAX_INVESTMENT_PER_STOCK / price));
  const exposure = qty * price;
  const margin = exposure / RULES.LEVERAGE;

  const slPerShare = RULES.MAX_LOSS_PER_TRADE / qty;
  const targetPerShare = RULES.MAX_PROFIT_PER_TRADE / qty;

  const trade = {
    symbol: symbol.toUpperCase(),
    side: 'BUY',
    status: 'OPEN',
    scanName: scanName || 'Manual',
    alertName: alertName || '',
    entryPrice: price,
    qty,
    exposure: round2(exposure),
    margin: round2(margin),
    slPrice: round2(price - slPerShare),
    targetPrice: round2(price + targetPerShare),
    maxLoss: RULES.MAX_LOSS_PER_TRADE,
    maxProfit: RULES.MAX_PROFIT_PER_TRADE,
    ltp: price,
    pnl: 0,
    openedAt: new Date().toISOString(),
    closedAt: null,
    exitPrice: null,
    exitReason: null,
  };
  return store.addTrade(trade);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function closeTrade(trade, exitPrice, reason) {
  const pnl = round2((exitPrice - trade.entryPrice) * trade.qty);
  return store.updateTrade(trade.id, {
    status: 'CLOSED',
    exitPrice: round2(exitPrice),
    ltp: round2(exitPrice),
    pnl,
    exitReason: reason,
    closedAt: new Date().toISOString(),
  });
}

// Poll all open positions: update LTP, auto-book target/SL, force
// square-off at 3:00 PM IST.
async function monitorOpenTrades() {
  const open = store.getOpenTrades();
  if (open.length === 0) return;

  const now = istNow();
  const forceClose = pastSquareOff(now);

  for (const trade of open) {
    const ltp = await getLTP(trade.symbol);
    if (ltp == null) continue;

    if (forceClose) {
      closeTrade(trade, ltp, 'AUTO SQUARE-OFF 3:00 PM');
      continue;
    }

    if (ltp >= trade.targetPrice) {
      closeTrade(trade, trade.targetPrice, 'TARGET HIT');
    } else if (ltp <= trade.slPrice) {
      closeTrade(trade, trade.slPrice, 'STOP-LOSS HIT');
    } else {
      const pnl = round2((ltp - trade.entryPrice) * trade.qty);
      store.updateTrade(trade.id, { ltp: round2(ltp), pnl });
    }
  }
}

function startMonitorLoop(intervalMs = 15000) {
  setInterval(() => {
    monitorOpenTrades().catch(err => console.error('[tradeEngine] monitor error:', err.message));
  }, intervalMs);
}

module.exports = {
  RULES,
  istNow,
  isMarketHours,
  pastSquareOff,
  openTradeFromAlert,
  closeTrade,
  monitorOpenTrades,
  startMonitorLoop,
};
