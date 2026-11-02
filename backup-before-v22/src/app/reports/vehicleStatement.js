import { fmt, escapeHTML } from '../core/format.js';
import { owedForRental, paidForRental } from '../core/paymentMath.js';
import { db } from '../core/state.js';
import { inRange, periodRange } from './periodRange.js';

/* ---------- individual vehicle statement ---------- */
export function renderVehicleStatement(){
  const vid = document.getElementById('rep_vehicle_pick').value;
  const cardsEl = document.getElementById('repVehicleCards');
  const rentalTb = document.querySelector('#repVehicleRentalTable tbody');
  const expenseTb = document.querySelector('#repVehicleExpenseTable tbody');
  if(!vid){
    cardsEl.innerHTML = '<div class="hint" style="margin:0;">Pick a vehicle above to see its statement for the selected period.</div>';
    rentalTb.innerHTML = ''; expenseTb.innerHTML = '';
    return;
  }
  const {start,end} = periodRange();
  const v = db.vehicles.find(v=>v.id==vid);
  const vr = db.rentals.filter(r=>r.vehicleId==vid && r.status!=='Cancelled' && inRange(r.pickup,start,end));
  const ve = db.expenses.filter(x=>x.vehicleId==vid && inRange(x.date,start,end));
  const revenue = vr.reduce((s,r)=>s+r.amount,0);
  const collected = vr.reduce((s,r)=>s+paidForRental(r.id),0);
  const outstanding = revenue - collected;
  const days = vr.reduce((s,r)=>s+r.days,0);
  const exp = ve.reduce((s,x)=>s+x.amount,0);
  cardsEl.innerHTML = `
    <div class="card"><div class="label">Days rented</div><div class="value">${days}</div></div>
    <div class="card"><div class="label">Revenue</div><div class="value amber">${fmt(revenue)}</div></div>
    <div class="card"><div class="label">Collected</div><div class="value green">${fmt(collected)}</div></div>
    <div class="card"><div class="label">Outstanding</div><div class="value ${outstanding>0?'red':'green'}">${fmt(outstanding)}</div></div>
    <div class="card"><div class="label">Expenses</div><div class="value red">${fmt(exp)}</div></div>
    <div class="card"><div class="label">Net</div><div class="value ${revenue-exp>=0?'green':'red'}">${fmt(revenue-exp)}</div></div>`;
  rentalTb.innerHTML = vr.length ? vr.map(r=>{
    const c = db.clients.find(c=>c.id==r.clientId);
    const paid = paidForRental(r.id), owed = owedForRental(r);
    return `<tr><td>${escapeHTML(c?c.name:'—')}</td><td>${escapeHTML(r.contract||'—')}</td><td>${r.pickup}</td><td>${r.return}</td>
      <td class="num">${r.days}</td><td class="num">${r.mileage ? r.mileage.toLocaleString() : '—'}</td><td class="num">${fmt(r.amount)}</td>
      <td class="num" style="color:var(--green);">${fmt(paid)}</td>
      <td class="num" style="color:${owed>0?'var(--red)':'var(--ink-faint)'};">${fmt(owed)}</td>
      <td><span class="tag ${r.status}">${r.status}</span></td></tr>`;
  }).join('') : '<tr class="empty-row"><td colspan="9">No rentals for '+(v?v.reg:'this vehicle')+' in this period.</td></tr>';
  expenseTb.innerHTML = ve.length ? ve.map(x=>
    `<tr><td>${x.date}</td><td>${escapeHTML(x.category)}</td><td>${escapeHTML(x.desc||'—')}</td><td class="num">${x.qty||1}</td><td class="num">${fmt(x.amount)}</td></tr>`
  ).join('') : '<tr class="empty-row"><td colspan="5">No expenses for '+(v?v.reg:'this vehicle')+' in this period.</td></tr>';
}
