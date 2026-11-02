import { escapeHTML, fmt } from '../core/format.js';
import { monthLabel, pad2 } from '../core/period.js';
import { db } from '../core/state.js';

/* ---------- statistical analysis (fuel, other expense categories, revenue, etc.) ----------
   Works off the currently open file (db), not the multi-month loader above, so it's
   useful immediately with just one file open. "Metric" = a list of individual dated,
   per-vehicle amounts (e.g. every Fuel expense line) that count/total/average/median/
   min/max/spread get computed over, plus a per-vehicle and per-month breakdown.
   Recalculated fresh every time the Analysis tab is opened (renderAnalysis calls this),
   so it always reflects whatever is in the file at that moment. */
export function statMean(vals){ return vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0; }
export function statMedian(vals){
  if(!vals.length) return 0;
  const s = [...vals].sort((a,b)=>a-b), mid = Math.floor(s.length/2);
  return s.length%2 ? s[mid] : (s[mid-1]+s[mid])/2;
}
export function statStdDev(vals){
  if(vals.length<2) return 0;
  const m = statMean(vals);
  return Math.sqrt(vals.reduce((s,v)=>s+(v-m)**2,0)/vals.length);
}
/* Base (non-category) metrics available regardless of what expense categories exist
   in this file. Expense-category metrics (Fuel, Maintenance, whatever the user has
   actually logged) are appended dynamically in buildStatMetrics() below. */
export const STAT_BASE_METRICS = {
  allExpenses: { label:'All expenses (every category)', rows: () => db.expenses.map(x=>({amount:Number(x.amount)||0, vehicleId:x.vehicleId, date:x.date})) },
  revenue: { label:'Rental revenue', rows: () => db.rentals.filter(r=>r.status!=='Cancelled').map(r=>({amount:Number(r.amount)||0, vehicleId:r.vehicleId, date:r.pickup})) },
  rentalDays: { label:'Rental duration (days)', rows: () => db.rentals.filter(r=>r.status!=='Cancelled').map(r=>({amount:Number(r.days)||0, vehicleId:r.vehicleId, date:r.pickup})) },
  payments: { label:'Payments received', rows: () => db.payments.map(p=>{ const r=db.rentals.find(r=>r.id==p.rentalId); return {amount:Number(p.amount)||0, vehicleId: r?r.vehicleId:null, date:p.date}; }) }
};
/* Builds the full metric list for this file: the base metrics above, plus one metric
   per distinct expense category actually present in db.expenses — Fuel included, but
   also Maintenance, Repairs, or whatever categories this fleet actually logs, so the
   same tool works for any of them, not just fuel. */
export function buildStatMetrics(){
  const metrics = {...STAT_BASE_METRICS};
  const categories = [...new Set(db.expenses.map(x=>x.category).filter(Boolean))].sort();
  categories.forEach(cat=>{
    metrics['cat:'+cat] = {
      label: cat + ' expenses',
      rows: () => db.expenses.filter(x=>x.category===cat).map(x=>({amount:Number(x.amount)||0, vehicleId:x.vehicleId, date:x.date}))
    };
  });
  return metrics;
}
export function populateStatMetricSelect(){
  const sel = document.getElementById('statMetricSelect');
  const metrics = buildStatMetrics();
  const prevValue = sel.value;
  // Default to Fuel the first time there's fuel data to show, since it's the flagship
  // use case — otherwise fall back to the first metric in the list.
  const fallback = metrics['cat:Fuel'] ? 'cat:Fuel' : Object.keys(metrics)[0];
  sel.innerHTML = Object.entries(metrics).map(([key,m])=>`<option value="${escapeHTML(key)}">${escapeHTML(m.label)}</option>`).join('');
  sel.value = (prevValue && metrics[prevValue]) ? prevValue : fallback;
  return metrics;
}
export function renderStatAnalysis(){
  const cardsEl = document.getElementById('statCards');
  const vtb = document.querySelector('#statVehicleTable tbody');
  const monthBarsEl = document.getElementById('statMonthBars');
  if(!cardsEl || !vtb || !monthBarsEl) return;

  const metrics = populateStatMetricSelect();
  const sel = document.getElementById('statMetricSelect');
  const metric = metrics[sel.value];
  const rows = metric ? metric.rows().filter(r=>r.date) : [];
  const vals = rows.map(r=>r.amount);

  const count = vals.length;
  const total = vals.reduce((s,v)=>s+v,0);
  const mean = statMean(vals);
  const median = statMedian(vals);
  const min = count ? Math.min(...vals) : 0;
  const max = count ? Math.max(...vals) : 0;
  const stdDev = statStdDev(vals);

  cardsEl.innerHTML = `
    <div class="card"><div class="label">Entries</div><div class="value">${count}</div></div>
    <div class="card"><div class="label">Total</div><div class="value amber">${fmt(total)}</div></div>
    <div class="card"><div class="label">Average</div><div class="value">${fmt(mean)}</div></div>
    <div class="card"><div class="label">Median</div><div class="value">${fmt(median)}</div></div>
    <div class="card"><div class="label">Lowest</div><div class="value">${fmt(min)}</div></div>
    <div class="card"><div class="label">Highest</div><div class="value">${fmt(max)}</div></div>
    <div class="card"><div class="label">Spread (std. dev.)</div><div class="value">${fmt(stdDev)}</div></div>`;

  // Per vehicle
  const byVehicle = new Map();
  rows.forEach(r=>{
    const key = r.vehicleId!=null ? r.vehicleId : '—';
    if(!byVehicle.has(key)) byVehicle.set(key, []);
    byVehicle.get(key).push(r.amount);
  });
  const vehicleRows = [...byVehicle.entries()].map(([vehicleId,amts])=>{
    const v = db.vehicles.find(v=>v.id==vehicleId);
    return { label: v ? `${v.reg} — ${v.make} ${v.model}` : 'Office / unassigned', count: amts.length, total: amts.reduce((s,a)=>s+a,0), avg: statMean(amts) };
  }).sort((a,b)=>b.total-a.total);
  vtb.innerHTML = vehicleRows.length ? vehicleRows.map(r=>`
    <tr><td>${escapeHTML(r.label)}</td><td class="num">${r.count}</td><td class="num">${fmt(r.total)}</td><td class="num">${fmt(r.avg)}</td></tr>
  `).join('') : '<tr class="empty-row"><td colspan="4">No entries for this metric yet.</td></tr>';

  // By month
  const byMonth = new Map();
  rows.forEach(r=>{
    const d = new Date(r.date+'T00:00:00');
    if(isNaN(d)) return;
    const key = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
    if(!byMonth.has(key)) byMonth.set(key, 0);
    byMonth.set(key, byMonth.get(key)+r.amount);
  });
  const monthRows = [...byMonth.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([key,sum])=>{ const [y,m] = key.split('-').map(Number); return { label: monthLabel(y,m-1), sum }; });
  const maxMonth = Math.max(1, ...monthRows.map(r=>r.sum));
  monthBarsEl.innerHTML = monthRows.length ? monthRows.map(row=>`
    <div class="bar-row">
      <div class="bname" style="width:120px;">${escapeHTML(row.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(row.sum/maxMonth*100)}%"></div></div>
      <div class="bar-amt">${fmt(row.sum)}</div>
    </div>`).join('') : '<div class="hint" style="margin:0;">Nothing to chart for this metric yet.</div>';
}

export function initStatistics(){
  document.getElementById('statMetricSelect').addEventListener('change', renderStatAnalysis);
}
