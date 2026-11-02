export const THIN = { style:'thin' };
/* App accent colours (matching the on-screen CSS variables), used to tint total/summary
   figures in the exported Excel so revenue, expenses, fuel and net figures are visually
   distinguishable at a glance, the same way the dashboard cards are colour-coded. */
export const XLSX_CLR = { green:'FF4F9E6E', red:'FFD9695F', amber:'FFE8A33D', fuel:'FFE0793B' };
export function tintCell(ws, r, c, colorKey, bold){
  const cell = ws.getCell(r,c);
  const existing = cell.font || {};
  cell.font = Object.assign({}, existing, { color:{argb:XLSX_CLR[colorKey]}, bold: bold!==undefined ? bold : !!existing.bold });
}
/* Green when the figure is favourable (profit/surplus), red when it isn't — for net-style
   figures whose sign determines whether they're good or bad news. */
export function tintNet(ws, r, c, value, bold){
  tintCell(ws, r, c, (Number(value)||0) >= 0 ? 'green' : 'red', bold);
}
/* A file's tracked period always spans a full calendar month (1st to last day) — but if
   that period is the month still in progress right now, only days up to today actually
   have data. Capping here stops the report from silently implying totals for days that
   haven't happened yet; a past, closed-out month (opened later) still gets its full range. */
export function effectivePeriodEnd(period){
  const fullEnd = new Date(period.end+'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return today < fullEnd ? today : fullEnd;
}
export function periodRangeLabel(period){
  const label = period.label.toUpperCase();
  const fullEnd = new Date(period.end+'T00:00:00');
  const effEnd = effectivePeriodEnd(period);
  if(effEnd < fullEnd){
    const shown = effEnd.toLocaleDateString('default',{month:'short',day:'numeric'}).toUpperCase();
    return `${label} — THROUGH ${shown} (MONTH IN PROGRESS)`;
  }
  return label;
}
/* Money columns to total, and which (non-money) column carries the "TOTAL" label,
   for the raw data sheets that hold amounts. */
export const DATA_SHEET_TOTALS = {
  Rentals:  { labelCol: 'contract', sumCols: ['days','amount','fuel','fuelCharge'], colColors: { amount:'green', fuel:'fuel', fuelCharge:'fuel' } },
  Expenses: { labelCol: 'desc',     sumCols: ['amount','chargeAmount'], colColors: { amount:'red', chargeAmount:'fuel' } },
  Payments: { labelCol: 'note',     sumCols: ['amount'], colColors: { amount:'green' } }
};
export function addDataSheet(wb, name, rows, cols){
  const ws = wb.addWorksheet(name);
  ws.addRow(cols);
  ws.getRow(1).font = { bold:true };
  (rows && rows.length ? rows : []).forEach(r=> ws.addRow(cols.map(c=> (r[c]===undefined||r[c]===null) ? '' : r[c])));
  cols.forEach((c,i)=> ws.getColumn(i+1).width = Math.max(11, c.length+2));
  const totalsSpec = DATA_SHEET_TOTALS[name];
  if(totalsSpec && rows && rows.length){
    const totalRow = cols.map(c=>{
      if(c===totalsSpec.labelCol) return 'TOTAL';
      if(totalsSpec.sumCols.includes(c)) return rows.reduce((s,r)=> s+(Number(r[c])||0), 0);
      return '';
    });
    const rowNum = ws.addRow(totalRow).number;
    ws.getRow(rowNum).font = { bold:true };
    if(totalsSpec.colColors){
      cols.forEach((c,i)=>{
        const colorKey = totalsSpec.colColors[c];
        if(colorKey) tintCell(ws, rowNum, i+1, colorKey, true);
      });
    }
  }
  return ws;
}
/* Since the ledger now accumulates every month's records in one continuous table
   (see startNewMonth), a thin divider row is inserted wherever consecutive rows
   cross a month boundary — so scrolling down through the history still reads as
   distinct months, the way separate monthly files used to. */
export function monthDividerRow(colspan, label){
  const tr = document.createElement('tr');
  tr.className = 'month-divider-row';
  tr.innerHTML = `<td colspan="${colspan}" style="background:var(--panel-2);color:var(--ink-dim);font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:6px 10px;">${label}</td>`;
  return tr;
}
export function readDataSheet(wb, name, cols){
  const ws = wb.getWorksheet(name);
  if(!ws) return [];
  const rows = [];
  ws.eachRow((row, rowNumber)=>{
    if(rowNumber===1) return; // header row
    const obj = {}; let hasValue = false;
    cols.forEach((c,i)=>{
      let val = row.getCell(i+1).value;
      if(val && typeof val==='object' && 'text' in val) val = val.text; // rich text guard
      if(val instanceof Date) val = val.toISOString().slice(0,10);
      if(val!==null && val!==undefined && val!=='') hasValue = true;
      obj[c] = (val===null||val===undefined) ? '' : val;
    });
    if(!hasValue) return;
    // A summary/total row appended for reporting has no id — a real record on an id-keyed
    // sheet always has a positive numeric id, so this keeps totals rows from round-tripping
    // back in as fake records. Sheets with no id column (e.g. Settings, Meta) skip this check.
    if(cols.includes('id')){
      const idNum = Number(obj.id);
      if(!Number.isFinite(idNum) || idNum<=0) return;
    }
    rows.push(obj);
  });
  return rows;
}
