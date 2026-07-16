const API = '';

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

function renderOpen(trades){
  const list = document.getElementById('openList');
  const open = trades.filter(t => t.status === 'OPEN');
  document.getElementById('openCount').textContent = open.length;
  document.getElementById('statOpen').textContent = open.length;

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
  const closed = trades.filter(t => t.status === 'CLOSED').slice(0, 40);
  document.getElementById('closedCount').textContent = closed.length;
  document.getElementById('statClosed').textContent = closed.length;

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

function renderStats(stats, marketOpen){
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
      renderOpen(tradesRes.trades);
      renderClosed(tradesRes.trades);
    }
    if(statsRes.ok){
      renderStats(statsRes.stats, statsRes.marketOpen);
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

setupWebhookBox();
document.getElementById('exitAllBtn').addEventListener('click', exitAll);
tickClock();
setInterval(tickClock, 1000);
refresh();
refreshDayHistory();
setInterval(refresh, 5000);
setInterval(refreshDayHistory, 30000);
