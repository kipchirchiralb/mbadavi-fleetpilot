import { fmt, escapeHTML } from '../core/format.js';
import { paidForRental } from '../core/paymentMath.js';
import { toLocalISO } from '../core/period.js';
import { db } from '../core/state.js';
import { renderLeasedCars } from './leasedCars.js';
import { inRange, periodRange } from './periodRange.js';
import { renderVehicleStatement } from './vehicleStatement.js';

export function renderReports(){
  if(!document.getElementById('rep_ref').value){
    document.getElementById('rep_ref').value = toLocalISO(new Date());
    document.getElementById('dash_rep_ref').value = document.getElementById('rep_ref').value;
  }
  const {start,end} = periodRange();
  document.getElementById('periodLabel').textContent =
    'Showing: ' + start.toDateString() + '  →  ' + end.toDateString();

  const rentalsIn = db.rentals.filter(r=>r.status!=='Cancelled' && inRange(r.pickup,start,end));
  const expensesIn = db.expenses.filter(x=>inRange(x.date,start,end));

  const totalRevenue = rentalsIn.reduce((s,r)=>s+r.amount,0);
  const totalExpenses = expensesIn.reduce((s,x)=>s+x.amount,0);
  const totalFuel = expensesIn.filter(x=>x.category==='Fuel').reduce((s,x)=>s+x.amount,0);
  const totalDays = rentalsIn.reduce((s,r)=>s+r.days,0);
  /* Collected/Outstanding are tracked per rental (via linked "Payment received" entries),
     not per period — a rental invoiced this period can still be paid off later, and that
     later payment should still count against it here. */
  const totalCollected = rentalsIn.reduce((s,r)=>s+paidForRental(r.id),0);
  const totalOutstanding = totalRevenue - totalCollected;

  const perVehicle = db.vehicles.map(v=>{
    const vr = rentalsIn.filter(r=>r.vehicleId==v.id);
    const ve = expensesIn.filter(x=>x.vehicleId==v.id);
    const revenue = vr.reduce((s,r)=>s+r.amount,0);
    const collected = vr.reduce((s,r)=>s+paidForRental(r.id),0);
    const outstanding = revenue - collected;
    const days = vr.reduce((s,r)=>s+r.days,0);
    const exp = ve.reduce((s,x)=>s+x.amount,0);
    const net = revenue - exp;
    return {v,revenue,collected,outstanding,days,exp,net};
  }).filter(row=>row.revenue>0 || row.exp>0);

  document.getElementById('repCards').innerHTML = `
    <div class="card"><div class="label">Rental days</div><div class="value">${totalDays}</div></div>
    <div class="card"><div class="label">Revenue (invoiced)</div><div class="value amber">${fmt(totalRevenue)}</div></div>
    <div class="card"><div class="label">Collected</div><div class="value green">${fmt(totalCollected)}</div></div>
    <div class="card"><div class="label">Outstanding</div><div class="value ${totalOutstanding>0?'red':'green'}">${fmt(totalOutstanding)}</div></div>
    <div class="card"><div class="label">Expenses</div><div class="value red">${fmt(totalExpenses)}</div></div>
    <div class="card"><div class="label">Fuel</div><div class="value fuel">${fmt(totalFuel)}</div></div>
    <div class="card"><div class="label">Net to company</div><div class="value ${totalRevenue-totalExpenses>=0?'green':'red'}">${fmt(totalRevenue-totalExpenses)}</div></div>`;

  const tb = document.querySelector('#repTable tbody'); tb.innerHTML='';
  if(!perVehicle.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="8">No activity in this period.</td></tr>'; }
  perVehicle.forEach(row=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(row.v.reg)}</td><td>${escapeHTML(row.v.make)} ${escapeHTML(row.v.model)}</td><td class="num">${row.days}</td>
      <td class="num">${fmt(row.revenue)}</td>
      <td class="num" style="color:var(--green);">${fmt(row.collected)}</td>
      <td class="num" style="color:${row.outstanding>0?'var(--red)':'var(--ink-faint)'};">${fmt(row.outstanding)}</td>
      <td class="num">${fmt(row.exp)}</td>
      <td class="num">${fmt(row.net)}</td>`;
    tb.appendChild(tr);
  });

  const maxRev = Math.max(1, ...perVehicle.map(r=>r.revenue));
  document.getElementById('repBars').innerHTML = perVehicle.length ? perVehicle.map(row=>`
    <div class="bar-row">
      <div class="bname">${escapeHTML(row.v.reg)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(row.revenue/maxRev*100)}%"></div></div>
      <div class="bar-amt">${fmt(row.revenue)}</div>
    </div>`).join('') : '<div class="hint" style="margin:0;">Nothing to chart for this period yet.</div>';

  renderLeasedCars();
  renderVehicleStatement();
}
