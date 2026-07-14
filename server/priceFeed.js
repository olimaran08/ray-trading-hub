// Fetches live/delayed LTP for NSE symbols using Yahoo Finance's public
// (unauthenticated) chart endpoint. No API key required.
const fetch = require('node-fetch');

const cache = new Map(); // symbol -> { price, ts }
const CACHE_MS = 8000;

function toYahooSymbol(sym) {
  const s = sym.trim().toUpperCase();
  if (s.endsWith('.NS') || s.endsWith('.BO')) return s;
  return `${s}.NS`;
}

async function getLTP(symbol) {
  const ySym = toYahooSymbol(symbol);
  const cached = cache.get(ySym);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.price;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=1m&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (RayTradingHub/1.0)' },
      timeout: 8000
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const price =
      result?.meta?.regularMarketPrice ??
      result?.indicators?.quote?.[0]?.close?.filter(Boolean).pop();
    if (typeof price !== 'number') throw new Error('no price in response');
    cache.set(ySym, { price, ts: Date.now() });
    return price;
  } catch (err) {
    console.error(`[priceFeed] failed for ${ySym}:`, err.message);
    return cached ? cached.price : null;
  }
}

module.exports = { getLTP };
