const API = '';
let selectedScanner = 'ALL';
let lastTrades = [];

function fmtMoney(n){
  const sign = n < 0 ? '-' : '';
  return sign + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
}
function fmtTime(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Asia/Kolkata' });
}

async function fetchJSON(url, opts){
  const res = await fetch(url, opts);
  return res.json();
}

function applyFilter(trades){
  if(selectedScanner === 'ALL') return trades;
  return trades.filter(t => t.scanName === selectedScanner);
}

function renderOpen(trades){
  const list = document.getElementById('openList');
  const open = applyFilter(trades.filter(t => t.status === 'OPEN'));
  const openTotal = trades.filter(t => t.status === 'OPEN').length;
  document.getElementById('openCount').textContent = selectedScanner === 'ALL' ? openTotal : `${open.length} / ${openTotal}`;
  document.getElementById('statOpen').textContent = openTotal;

  if(open.length === 0){
    list.innerHTML = `<div class="empty-state"><p>No open positions.</p><p class="empty-sub">They'll appear the instant a Chartink scan fires the webhook below.</p></div>`;
    return;
  }

  list.innerHTML = open.map(t => {
    const cls = t.pnl >= 0 ? 'profit' : 'loss';
    return `
    <div class="ticket ${cls}">
      <div class="ticket-top">
        <div>
          <span class="ticket-symbol">${t.symbol}</span>
          <span class="ticket-scan">${t.scanName} · ${fmtTime(t.openedAt)}</span>
        </div>
        <span class="ticket-pnl ${cls}">${fmtMoney(t.pnl)}</span>
      </div>
      <div class="ticket-grid-row">
        <div class="ticket-field"><span>Entry</span><span>₹${t.entryPrice}</span></div>
        <div class="ticket-field"><span>LTP</span><span>₹${t.ltp}</span></div>
        <div class="ticket-field"><span>Target</span><span style="color:var(--profit)">₹${t.targetPrice}</span></div>
        <div class="ticket-field"><span>SL</span><span style="color:var(--loss)">₹${t.slPrice}</span></div>
      </div>
      <div class="ticket-grid-row" style="border-top:none; padding-top:0; margin-top:6px;">
        <div class="ticket-field"><span>Qty</span><span>${t.qty}</span></div>
        <div class="ticket-field"><span>Exposure</span><span>${fmtMoney(t.exposure)}</span></div>
        <div class="ticket-field"><span>Margin (5x)</span><span>${fmtMoney(t.margin)}</span></div>
        <div class="ticket-field"><span>Side</span><span>${t.side}</span></div>
      </div>
      <button class="ticket-close" onclick="closeTrade(${t.id})">Close manually</button>
    </div>`;
  }).join('');
}

function renderClosed(trades){
  const box = document.getElementById('closedTable');
  const closed = applyFilter(trades.filter(t => t.status === 'CLOSED'));
  const closedTotal = trades.filter(t => t.status === 'CLOSED').length;
  document.getElementById('closedCount').textContent = selectedScanner === 'ALL' ? closedTotal : `${closed.length} / ${closedTotal}`;
  document.getElementById('statClosed').textContent = closedTotal;

  if(closed.length === 0){
    box.innerHTML = `<div class="empty-state"><p>No closed trades yet.</p></div>`;
    return;
  }

  const head = `<div class="closed-row head">
      <div>Symbol</div><div>Entry → Exit</div><div>Qty</div><div>P&amp;L</div><div>Reason</div>
    </div>`;

  const rows = closed.map(t => {
    const cls = t.pnl >= 0 ? 'profit' : 'loss';
    return `<div class="closed-row">
      <div class="sym">${t.symbol}<div class="detail">${t.scanName} · ${fmtTime(t.closedAt)}</div></div>
      <div class="mono">₹${t.entryPrice} → ₹${t.exitPrice}</div>
      <div class="mono">${t.qty}</div>
      <div class="mono ${cls} pnl-cell">${fmtMoney(t.pnl)}</div>
      <div class="reason-cell"><span class="reason-tag">${t.exitReason || '—'}</span></div>
    </div>`;
  }).join('');

  box.innerHTML = head + rows;
}

function populateScannerFilter(trades){
  const select = document.getElementById('scannerFilter');
  const scanners = [...new Set(trades.map(t => t.scanName).filter(Boolean))].sort();
  const current = select.value || 'ALL';

  select.innerHTML = `<option value="ALL">All scanners</option>` +
    scanners.map(s => `<option value="${s}">${s}</option>`).join('');

  // Keep the user's selection if that scanner still exists, else reset to ALL.
  if(scanners.includes(current) || current === 'ALL'){
    select.value = current;
    selectedScanner = current;
  } else {
    select.value = 'ALL';
    selectedScanner = 'ALL';
  }
  document.getElementById('resetScannerBtn').style.display = selectedScanner === 'ALL' ? 'none' : 'inline-block';
}

function renderScannerPerf(trades){
  const box = document.getElementById('scannerPerf');
  const byScanner = {};
  trades.forEach(t => {
    const name = t.scanName || 'Unknown';
    if(!byScanner[name]) byScanner[name] = { name, trades: 0, wins: 0, losses: 0, pnl: 0 };
    byScanner[name].trades++;
    byScanner[name].pnl += (t.pnl || 0);
    if(t.status === 'CLOSED'){
      if(t.pnl > 0) byScanner[name].wins++;
      else byScanner[name].losses++;
    }
  });

  const rows = Object.values(byScanner).sort((a,b) => b.pnl - a.pnl);
  document.getElementById('scannerCount').textContent = rows.length;

  if(rows.length === 0){
    box.innerHTML = `<div class="empty-state"><p>No trades yet today.</p></div>`;
    return;
  }

  const maxAbsPnl = Math.max(...rows.map(r => Math.abs(r.pnl)), 1);

  box.innerHTML = rows.map((r, i) => {
    const cls = r.pnl >= 0 ? 'profit' : 'loss';
    const decided = r.wins + r.losses;
    const winRate = decided ? Math.round((r.wins / decided) * 100) : 0;
    const barWidth = Math.round((Math.abs(r.pnl) / maxAbsPnl) * 100);
    return `<div class="scanner-row">
      <span class="scanner-rank">#${i+1}</span>
      <div class="scanner-name-col">
        <div class="scanner-name">${r.name}</div>
        <div class="scanner-sub">${r.trades} trades · ${winRate}% win rate (${r.wins}W/${r.losses}L)</div>
        <div class="scanner-bar-track"><div class="scanner-bar-fill ${cls}" style="width:${barWidth}%"></div></div>
      </div>
      <span class="scanner-pnl ${cls}">${fmtMoney(r.pnl)}</span>
    </div>`;
  }).join('');
}

function renderStats(stats, marketOpen, haltedForToday){
  const hero = document.getElementById('heroPnl');
  const netVal = document.getElementById('netPnlValue');
  netVal.textContent = fmtMoney(stats.netPnl);
  netVal.className = 'hero-pnl-value ' + (stats.netPnl >= 0 ? 'profit' : 'loss');

  document.getElementById('realizedPnl').textContent = fmtMoney(stats.realizedPnl);
  document.getElementById('unrealizedPnl').textContent = fmtMoney(stats.unrealizedPnl);
  document.getElementById('statWinRate').textContent = stats.winRate + '%';
  document.getElementById('statWL').textContent = `${stats.wins} / ${stats.losses}`;

  const pill = document.getElementById('marketPill');
  if(marketOpen){
    pill.textContent = 'Market open';
    pill.className = 'pill pill-open';
  } else {
    pill.textContent = 'Market closed';
    pill.className = 'pill pill-closed';
  }

  document.getElementById('closeForTodayBtn').style.display = haltedForToday ? 'none' : 'block';
  document.getElementById('haltedBanner').style.display = haltedForToday ? 'flex' : 'none';
}

async function closeTrade(id){
  await fetchJSON(`/api/trades/${id}/close`, { method:'POST' });
  refresh();
}

async function exitAll(){
  const btn = document.getElementById('exitAllBtn');
  btn.disabled = true;
  btn.textContent = 'Exiting…';
  try{
    const r = await fetchJSON('/api/trades/exit-all', { method:'POST' });
    if(r.ok){
      btn.textContent = `Closed ${r.closedCount}`;
      setTimeout(() => { btn.textContent = 'Exit all'; btn.disabled = false; }, 1500);
    }
  }catch(e){
    btn.textContent = 'Exit all';
    btn.disabled = false;
  }
  refresh();
}

async function closeForToday(){
  const confirmed = confirm('Close for today? This exits every open position right now and stops all new trades — from any scanner — for the rest of today. You can undo this with "Resume trading" if you change your mind.');
  if(!confirmed) return;

  const btn = document.getElementById('closeForTodayBtn');
  btn.disabled = true;
  btn.textContent = 'Closing…';
  try{
    const r = await fetchJSON('/api/trades/close-for-today', { method:'POST' });
    if(r.ok){
      btn.textContent = `Closed ${r.closedCount} · Halted`;
    }
  }catch(e){
    btn.disabled = false;
    btn.textContent = 'Close for today — lock in this profit';
  }
  refresh();
}

async function resumeTrading(){
  await fetchJSON('/api/trades/resume-trading', { method:'POST' });
  const btn = document.getElementById('closeForTodayBtn');
  btn.disabled = false;
  btn.textContent = 'Close for today — lock in this profit';
  refresh();
}

function fmtDate(dateStr){
  if(!dateStr) return '—';
  const [y,m,d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[parseInt(m,10)-1]} ${y}`;
}

function renderDayHistory(days){
  const box = document.getElementById('dayHistoryList');
  document.getElementById('dayCount').textContent = days.length;

  if(days.length === 0){
    box.innerHTML = `<div class="empty-state"><p>No days recorded yet.</p></div>`;
    return;
  }

  box.innerHTML = days.slice().reverse().map(d => {
    const cls = d.netPnl >= 0 ? 'profit' : 'loss';
    return `<div class="day-row">
      <div class="day-row-left">
        <span class="day-num">Day ${d.dayNumber}</span>
        <span class="day-date">${fmtDate(d.date)}</span>
      </div>
      <div style="text-align:right;">
        <div class="day-pnl ${cls}">${fmtMoney(d.netPnl)}</div>
        <div class="day-meta">${d.tradeCount} trades · ${d.wins}W / ${d.losses}L</div>
      </div>
    </div>`;
  }).join('');
}

async function refreshDayHistory(){
  try{
    const r = await fetchJSON('/api/day-history');
    if(r.ok) renderDayHistory(r.days);
  }catch(e){
    console.error('day history refresh failed', e);
  }
}

async function refresh(){
  try{
    const [tradesRes, statsRes] = await Promise.all([
      fetchJSON('/api/trades'),
      fetchJSON('/api/stats'),
    ]);
    if(tradesRes.ok){
      lastTrades = tradesRes.trades;
      populateScannerFilter(lastTrades);
      renderOpen(lastTrades);
      renderClosed(lastTrades);
      renderScannerPerf(lastTrades);
    }
    if(statsRes.ok){
      renderStats(statsRes.stats, statsRes.marketOpen, statsRes.haltedForToday);
    }
  }catch(e){
    console.error('refresh failed', e);
  }
}

function tickClock(){
  const el = document.getElementById('clock');
  const now = new Date();
  el.textContent = now.toLocaleTimeString('en-IN', { hour12:true, timeZone:'Asia/Kolkata' }) + ' IST';
}

function setupWebhookBox(){
  const url = `${window.location.origin}/webhook/chartink`;
  document.getElementById('webhookUrl').textContent = url;
  document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('copyBtn');
      const old = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => btn.textContent = old, 1500);
    });
  });

  document.getElementById('testBtn').addEventListener('click', async () => {
    const symbol = document.getElementById('testSymbol').value.trim();
    const price = document.getElementById('testPrice').value.trim();
    const msg = document.getElementById('testMsg');
    if(!symbol || !price){
      msg.textContent = 'Enter both a symbol and a price.';
      msg.className = 'test-msg err';
      return;
    }
    try{
      const r = await fetchJSON('/api/trades/manual', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ symbol, price, scanName:'Manual test' })
      });
      if(r.ok){
        msg.textContent = `Opened paper position in ${symbol.toUpperCase()} at ₹${price}.`;
        msg.className = 'test-msg ok';
        document.getElementById('testSymbol').value = '';
        document.getElementById('testPrice').value = '';
        refresh();
      } else {
        msg.textContent = r.error || 'Something went wrong.';
        msg.className = 'test-msg err';
      }
    }catch(e){
      msg.textContent = 'Could not reach server.';
      msg.className = 'test-msg err';
    }
  });
}

async function resetSelectedScanner(){
  if(selectedScanner === 'ALL') return;
  const confirmed = confirm(`Reset "${selectedScanner}"? This deletes all of its trades today — open and closed. Other scanners are untouched. This can't be undone.`);
  if(!confirmed) return;

  const btn = document.getElementById('resetScannerBtn');
  btn.disabled = true;
  btn.textContent = 'Resetting…';
  try{
    const r = await fetchJSON('/api/trades/reset-scanner', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ scanName: selectedScanner })
    });
    if(r.ok){
      btn.textContent = `Removed ${r.removed}`;
      selectedScanner = 'ALL';
      setTimeout(() => { btn.textContent = 'Reset this scanner'; btn.disabled = false; }, 1500);
    }
  }catch(e){
    btn.textContent = 'Reset this scanner';
    btn.disabled = false;
  }
  refresh();
}

setupWebhookBox();
document.getElementById('exitAllBtn').addEventListener('click', exitAll);
document.getElementById('closeForTodayBtn').addEventListener('click', closeForToday);
document.getElementById('resumeTradingBtn').addEventListener('click', resumeTrading);
document.getElementById('resetScannerBtn').addEventListener('click', resetSelectedScanner);
document.getElementById('downloadReportBtn').addEventListener('click', () => {
  const scanner = encodeURIComponent(selectedScanner);
  window.location.href = `/api/export?scanner=${scanner}`;
});
document.getElementById('scannerFilter').addEventListener('change', (e) => {
  selectedScanner = e.target.value;
  document.getElementById('resetScannerBtn').style.display = selectedScanner === 'ALL' ? 'none' : 'inline-block';
  renderOpen(lastTrades);
  renderClosed(lastTrades);
});
tickClock();
setInterval(tickClock, 1000);
refresh();
refreshDayHistory();
setInterval(refresh, 5000);
setInterval(refreshDayHistory, 30000);
