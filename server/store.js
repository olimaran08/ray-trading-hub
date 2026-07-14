// Lightweight JSON-file data store — no native deps, so it deploys anywhere.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'trades.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ trades: [], nextId: 1 }, null, 2));
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { trades: [], nextId: 1 };
  }
}

function write(data) {
  // atomic-ish write
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function getAllTrades() {
  return read().trades;
}

function addTrade(trade) {
  const data = read();
  trade.id = data.nextId++;
  data.trades.unshift(trade);
  write(data);
  return trade;
}

function updateTrade(id, patch) {
  const data = read();
  const idx = data.trades.findIndex(t => t.id === id);
  if (idx === -1) return null;
  data.trades[idx] = { ...data.trades[idx], ...patch };
  write(data);
  return data.trades[idx];
}

function getOpenTrades() {
  return getAllTrades().filter(t => t.status === 'OPEN');
}

module.exports = { getAllTrades, addTrade, updateTrade, getOpenTrades };
