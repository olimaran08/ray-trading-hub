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

// ---------------------------------------------------------------------
// Trading halt — a manual "I'm done for today, lock in the profit"
// switch. When set, no new trades open (existing ones aren't touched
// by this alone — pair it with exitAllOpenTrades to close everything
// too). Automatically clears at the next day's archive.
// ---------------------------------------------------------------------
function isHalted() {
  return !!read().halted;
}

function setHalted(value) {
  const data = read();
  data.halted = !!value;
  write(data);
}

function clearAllTrades() {
  const data = read();
  data.trades = [];
  write(data);
}

// Remove only the trades belonging to one scanner — used when testing
// a scanner and wanting a clean slate for just that one, without
// touching other scanners' trades or the rest of the day's board.
function clearTradesByScanner(scanName) {
  const data = read();
  const before = data.trades.length;
  data.trades = data.trades.filter(t => t.scanName !== scanName);
  write(data);
  return before - data.trades.length; // count removed
}

// ---------------------------------------------------------------------
// Day history — one summary line per trading day (date + net P&L),
// written when the day is archived. Individual trades are wiped after.
// ---------------------------------------------------------------------
const HISTORY_FILE = path.join(DATA_DIR, 'day-history.json');

if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify({ days: [], lastArchivedDate: null }, null, 2));
}

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (e) {
    return { days: [], lastArchivedDate: null };
  }
}

function writeHistory(data) {
  const tmp = HISTORY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, HISTORY_FILE);
}

function getDayHistory() {
  return readHistory().days;
}

function getLastArchivedDate() {
  return readHistory().lastArchivedDate;
}

// Summarize today's trades into one record, save it, then wipe the
// live trade list clean for the next day.
function archiveDay(dateStr) {
  const trades = getAllTrades();
  if (trades.length === 0) {
    // Nothing traded today — still mark the date so we don't re-check all day.
    const h = readHistory();
    h.lastArchivedDate = dateStr;
    writeHistory(h);
    setHalted(false); // fresh day, fresh start
    clearPnlSnapshots();
    return null;
  }

  const netPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const wins = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl <= 0).length;

  const h = readHistory();
  const record = {
    dayNumber: h.days.length + 1,
    date: dateStr,
    netPnl: Math.round(netPnl * 100) / 100,
    tradeCount: trades.length,
    wins,
    losses,
    archivedAt: new Date().toISOString(),
  };
  h.days.push(record);
  h.lastArchivedDate = dateStr;
  writeHistory(h);

  clearAllTrades();
  setHalted(false); // fresh day, fresh start
  clearPnlSnapshots(); // fresh graph for the new day
  return record;
}

// ---------------------------------------------------------------------
// P&L snapshots — a running log of "what was my total P&L at this
// moment" through the day, cumulative and broken down per scanner.
// This is what powers the equity-curve graph so you can see the peak
// it reached and where it actually landed, not just the end number.
// ---------------------------------------------------------------------
const PNL_FILE = path.join(DATA_DIR, 'pnl-history.json');

if (!fs.existsSync(PNL_FILE)) {
  fs.writeFileSync(PNL_FILE, JSON.stringify({ snapshots: [] }, null, 2));
}

function readPnl() {
  try {
    return JSON.parse(fs.readFileSync(PNL_FILE, 'utf8'));
  } catch (e) {
    return { snapshots: [] };
  }
}

function writePnl(data) {
  const tmp = PNL_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, PNL_FILE);
}

function addPnlSnapshot(snapshot) {
  const data = readPnl();
  data.snapshots.push(snapshot);
  writePnl(data);
}

function getPnlSnapshots() {
  return readPnl().snapshots;
}

function clearPnlSnapshots() {
  writePnl({ snapshots: [] });
}

module.exports = {
  getAllTrades, addTrade, updateTrade, getOpenTrades, clearAllTrades, clearTradesByScanner,
  getDayHistory, getLastArchivedDate, archiveDay, isHalted, setHalted,
  addPnlSnapshot, getPnlSnapshots, clearPnlSnapshots,
};
