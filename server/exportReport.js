// Builds a downloadable Excel (.xlsx) report of trades, with each row
// highlighted green (profit) or red (loss) — the trading-journal view
// Oli asked for, per scanner or across all scanners at once.
const ExcelJS = require('exceljs');

function formatIST(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

const GREEN_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
const GREEN_FONT = { color: { argb: 'FF006100' } };
const RED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
const RED_FONT = { color: { argb: 'FF9C0006' } };
const NEUTRAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

async function buildTradeReport(trades, scannerLabel) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RAY Trading Hub';
  wb.created = new Date();

  const sheet = wb.addWorksheet(scannerLabel || 'All Scanners', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Symbol', key: 'symbol', width: 14 },
    { header: 'Scanner', key: 'scanName', width: 20 },
    { header: 'Side', key: 'side', width: 8 },
    { header: 'Entry Time', key: 'entryTime', width: 22 },
    { header: 'Exit Time', key: 'exitTime', width: 22 },
    { header: 'Entry Price', key: 'entryPrice', width: 13 },
    { header: 'Exit Price', key: 'exitPrice', width: 13 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'P&L (₹)', key: 'pnl', width: 13 },
    { header: 'Result', key: 'result', width: 10 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Exit Reason', key: 'exitReason', width: 22 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC1440E' } };
  sheet.getRow(1).alignment = { vertical: 'middle' };

  // Oldest first, so the day reads top-to-bottom like a real journal.
  const sorted = [...trades].sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt));

  sorted.forEach(t => {
    const row = sheet.addRow({
      symbol: t.symbol,
      scanName: t.scanName,
      side: t.side,
      entryTime: formatIST(t.openedAt),
      exitTime: t.status === 'CLOSED' ? formatIST(t.closedAt) : 'Still open',
      entryPrice: t.entryPrice,
      exitPrice: t.status === 'CLOSED' ? t.exitPrice : t.ltp,
      qty: t.qty,
      pnl: t.pnl,
      result: t.pnl > 0 ? 'PROFIT' : (t.pnl < 0 ? 'LOSS' : 'FLAT'),
      status: t.status,
      exitReason: t.exitReason || '',
    });

    let fill, font;
    if (t.status !== 'CLOSED') {
      fill = NEUTRAL_FILL;
    } else if (t.pnl > 0) {
      fill = GREEN_FILL; font = GREEN_FONT;
    } else {
      fill = RED_FILL; font = RED_FONT;
    }
    row.eachCell(cell => {
      cell.fill = fill;
      if (font) cell.font = font;
    });
  });

  // Summary row at the bottom.
  const totalPnl = sorted.reduce((s, t) => s + (t.pnl || 0), 0);
  sheet.addRow({});
  const summaryRow = sheet.addRow({ symbol: 'TOTAL', pnl: round2(totalPnl) });
  summaryRow.font = { bold: true };
  summaryRow.getCell('pnl').fill = totalPnl >= 0 ? GREEN_FILL : RED_FILL;
  summaryRow.getCell('pnl').font = { bold: true, color: (totalPnl >= 0 ? GREEN_FONT : RED_FONT).color };

  return wb.xlsx.writeBuffer();
}

function round2(n) { return Math.round(n * 100) / 100; }

module.exports = { buildTradeReport };
