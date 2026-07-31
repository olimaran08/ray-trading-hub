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

let lastSnapshots = [];
let lastChartSvgMarkup = ''; // used by the "Save as image" button

function shortTime(iso){
  return new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Asia/Kolkata' });
}

// Builds a self-contained SVG line chart — no external chart library,
// so it can never fail to load from a blocked/slow network. Returns
// the SVG markup string; also draws it into the given container.
function buildPnlSvg(labels, values, width, height){
  const padX = CHART_PAD_X, padY = CHART_PAD_Y;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const yMin = Math.min(...values, 0);
  const yMax = Math.max(...values, 0);
  const range = (yMax - yMin) || 1;

  const xFor = i => values.length > 1 ? padX + (i * plotW) / (values.length - 1) : padX;
  const yFor = v => padY + plotH - ((v - yMin) / range) * plotH;

  const current = values[values.length - 1];
  const lineColor = current >= 0 ? '#2FB170' : '#E5484D';

  let peak = values[0], peakIdx = 0, low = values[0], lowIdx = 0;
  values.forEach((v, i) => {
    if(v > peak){ peak = v; peakIdx = i; }
    if(v < low){ low = v; lowIdx = i; }
  });

  const points = values.map((v, i) => [xFor(i), yFor(v)]);
  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const baselineY = yFor(0);
  const areaPath = linePath +
    ` L${points[points.length - 1][0].toFixed(1)},${baselineY.toFixed(1)}` +
    ` L${points[0][0].toFixed(1)},${baselineY.toFixed(1)} Z`;

  const zeroLine = (yMin < 0 && yMax > 0)
    ? `<line x1="${padX}" y1="${baselineY.toFixed(1)}" x2="${width - padX}" y2="${baselineY.toFixed(1)}" stroke="#3A4250" stroke-width="1" stroke-dasharray="3,3"/>`
    : '';

  const midIdx = Math.floor((labels.length - 1) / 2);
  const timeLabels = labels.length > 1
    ? `<text x="${padX}" y="${height - 3}" fill="#8B93A1" font-size="9" font-family="sans-serif" text-anchor="start">${labels[0]}</text>
       <text x="${width / 2}" y="${height - 3}" fill="#8B93A1" font-size="9" font-family="sans-serif" text-anchor="middle">${labels[midIdx]}</text>
       <text x="${width - padX}" y="${height - 3}" fill="#8B93A1" font-size="9" font-family="sans-serif" text-anchor="end">${labels[labels.length - 1]}</text>`
    : '';

  const peakDot = `<circle cx="${points[peakIdx][0].toFixed(1)}" cy="${points[peakIdx][1].toFixed(1)}" r="3.5" fill="#2FB170" stroke="#141920" stroke-width="1.5"/>`;
  const lowDot = `<circle cx="${points[lowIdx][0].toFixed(1)}" cy="${points[lowIdx][1].toFixed(1)}" r="3.5" fill="#E5484D" stroke="#141920" stroke-width="1.5"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#141920"/>
    ${zeroLine}
    <path d="${areaPath}" fill="${lineColor}" fill-opacity="0.12" stroke="none"/>
    <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${peakIdx !== lowIdx ? peakDot + lowDot : peakDot}
    ${timeLabels}
  </svg>`;
}

const CHART_PAD_X = 12, CHART_PAD_Y = 16;
let lastChartMeta = null; // used by the tap-to-inspect handler

function renderPnlChart(snapshots){
  const container = document.getElementById('pnlChartContainer');
  const emptyState = document.getElementById('chartEmpty');
  const summaryBox = document.getElementById('chartSummary');
  const subtitle = document.getElementById('graphSubtitle');
  const tapHint = document.getElementById('chartTapHint');

  subtitle.textContent = selectedScanner === 'ALL'
    ? 'Shows the "All scanners" running total — pick a scanner above to see its own curve.'
    : `Showing "${selectedScanner}" only.`;

  if(!snapshots || snapshots.length === 0){
    container.style.display = 'none';
    emptyState.style.display = 'block';
    summaryBox.innerHTML = '';
    lastChartSvgMarkup = '';
    lastChartMeta = null;
    tapHint.style.display = 'none';
    hideTouchOverlay();
    return;
  }
  container.style.display = 'block';
  emptyState.style.display = 'none';
  tapHint.style.display = 'block';

  const labels = snapshots.map(s => shortTime(s.time));
  const values = snapshots.map(s => selectedScanner === 'ALL' ? s.totalPnl : (s.byScanner[selectedScanner] || 0));

  let peak = values[0], peakIdx = 0, low = values[0], lowIdx = 0;
  values.forEach((v, i) => {
    if(v > peak){ peak = v; peakIdx = i; }
    if(v < low){ low = v; lowIdx = i; }
  });
  const current = values[values.length - 1];

  summaryBox.innerHTML = `
    <div class="chart-stat">
      <span class="chart-stat-label">Peak</span>
      <span class="chart-stat-value profit">${fmtMoney(peak)}</span>
      <span class="chart-stat-time">${labels[peakIdx]}</span>
    </div>
    <div class="chart-stat">
      <span class="chart-stat-label">Lowest</span>
      <span class="chart-stat-value ${low >= 0 ? 'profit' : 'loss'}">${fmtMoney(low)}</span>
      <span class="chart-stat-time">${labels[lowIdx]}</span>
    </div>
    <div class="chart-stat">
      <span class="chart-stat-label">Right now</span>
      <span class="chart-stat-value ${current >= 0 ? 'profit' : 'loss'}">${fmtMoney(current)}</span>
      <span class="chart-stat-time">${labels[labels.length - 1]}</span>
    </div>
  `;

  const width = 600, height = 200;
  const yMin = Math.min(...values, 0);
  const yMax = Math.max(...values, 0);

  // Small SVG for on-screen display, larger one cached for a crisper download.
  container.innerHTML = buildPnlSvg(labels, values, width, height);
  lastChartSvgMarkup = buildPnlSvg(labels, values, 1000, 400);
  lastChartMeta = { labels, values, width, height, yMin, yMax };
  hideTouchOverlay();
}

async function refreshPnlChart(){
  try{
    const r = await fetchJSON('/api/pnl-history');
    if(r.ok){
      lastSnapshots = r.snapshots;
      renderPnlChart(lastSnapshots);
    }
  }catch(e){
    console.error('pnl chart refresh failed', e);
  }
}

function hideTouchOverlay(){
  document.getElementById('chartTouchLine').style.display = 'none';
  document.getElementById('chartTouchDot').style.display = 'none';
  document.getElementById('chartTouchLabel').style.display = 'none';
}

// Tap-to-inspect: find the nearest recorded point to wherever the
// person tapped/clicked on the chart, and show its exact time + P&L.
function inspectChartAt(clientX){
  if(!lastChartMeta) return;
  const container = document.getElementById('pnlChartContainer');
  const rect = container.getBoundingClientRect();
  if(rect.width === 0) return;

  const { labels, values, width, height, yMin, yMax } = lastChartMeta;
  const relX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const svgX = relX * width;

  const plotW = width - CHART_PAD_X * 2;
  const n = values.length;
  let idx = n > 1 ? Math.round(((svgX - CHART_PAD_X) / plotW) * (n - 1)) : 0;
  idx = Math.min(n - 1, Math.max(0, idx));

  const value = values[idx];
  const label = labels[idx];

  const plotH = height - CHART_PAD_Y * 2;
  const range = (yMax - yMin) || 1;
  const pointX = n > 1 ? CHART_PAD_X + (idx * plotW) / (n - 1) : CHART_PAD_X;
  const pointY = CHART_PAD_Y + plotH - ((value - yMin) / range) * plotH;

  const leftPct = (pointX / width) * 100;
  const topPct = (pointY / height) * 100;

  const line = document.getElementById('chartTouchLine');
  const dot = document.getElementById('chartTouchDot');
  const labelEl = document.getElementById('chartTouchLabel');

  line.style.left = leftPct + '%';
  line.style.display = 'block';

  dot.style.left = leftPct + '%';
  dot.style.top = topPct + '%';
  dot.style.display = 'block';

  const cls = value >= 0 ? 'profit' : 'loss';
  labelEl.innerHTML = `${label} · <span class="${cls}">${fmtMoney(value)}</span>`;
  labelEl.style.left = Math.min(88, Math.max(12, leftPct)) + '%';
  labelEl.style.top = Math.max(12, topPct) + '%';
  labelEl.style.display = 'block';
}

function setupChartTouch(){
  const card = document.getElementById('chartCard');
  card.addEventListener('click', (e) => inspectChartAt(e.clientX));
  card.addEventListener('touchstart', (e) => {
    if(e.touches && e.touches[0]) inspectChartAt(e.touches[0].clientX);
  }, { passive: true });
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
setupChartTouch();
document.getElementById('exitAllBtn').addEventListener('click', exitAll);
document.getElementById('closeForTodayBtn').addEventListener('click', closeForToday);
document.getElementById('resumeTradingBtn').addEventListener('click', resumeTrading);
document.getElementById('resetScannerBtn').addEventListener('click', resetSelectedScanner);
document.getElementById('downloadReportBtn').addEventListener('click', () => {
  const scanner = encodeURIComponent(selectedScanner);
  window.location.href = `/api/export?scanner=${scanner}`;
});
document.getElementById('downloadChartBtn').addEventListener('click', () => {
  if(!lastChartSvgMarkup || lastSnapshots.length === 0){
    alert('No chart data yet today — nothing to download.');
    return;
  }
  const today = new Date().toLocaleDateString('en-IN', { timeZone:'Asia/Kolkata' }).replace(/\//g, '-');
  const label = selectedScanner === 'ALL' ? 'All-Scanners' : selectedScanner.replace(/[^a-z0-9]+/gi, '-');
  const filename = `RAY-Trading-Hub_${label}_${today}.png`;
  const DOWNLOAD_W = 1000, DOWNLOAD_H = 400; // must match the size buildPnlSvg was called with

  // Rasterize our own SVG to a PNG via an offscreen canvas — no
  // external library, so this can't fail from a blocked network.
  const svgBlob = new Blob([lastChartSvgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    // Use the known size we generated the SVG at — img.width/height
    // from an SVG-sourced Image is unreliable on iOS Safari.
    canvas.width = DOWNLOAD_W;
    canvas.height = DOWNLOAD_H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, DOWNLOAD_W, DOWNLOAD_H);
    URL.revokeObjectURL(url);

    const pngUrl = canvas.toDataURL('image/png');

    // iOS Safari mostly ignores the `download` attribute on links, so
    // the reliable cross-device pattern is to open the image itself —
    // the person then taps-and-holds to save it to Photos.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if(isIOS){
      const win = window.open();
      if(win){
        win.document.write(`<title>${filename}</title><body style="margin:0;background:#141920;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${pngUrl}" style="max-width:100%;height:auto;" /></body>`);
      } else {
        window.location.href = pngUrl;
      }
      alert('Your P&L graph opened in a new tab — press and hold the image, then choose "Save to Photos".');
    } else {
      const link = document.createElement('a');
      link.download = filename;
      link.href = pngUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Could not generate the image — try again.');
  };
  img.src = url;
});
document.getElementById('scannerFilter').addEventListener('change', (e) => {
  selectedScanner = e.target.value;
  document.getElementById('resetScannerBtn').style.display = selectedScanner === 'ALL' ? 'none' : 'inline-block';
  renderOpen(lastTrades);
  renderClosed(lastTrades);
  renderPnlChart(lastSnapshots);
});
tickClock();
setInterval(tickClock, 1000);
refresh();
refreshDayHistory();
refreshPnlChart();
setInterval(refresh, 5000);
setInterval(refreshDayHistory, 30000);
setInterval(refreshPnlChart, 15000);
