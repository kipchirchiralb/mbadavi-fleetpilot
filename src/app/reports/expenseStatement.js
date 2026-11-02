import { fmt, escapeHTML } from '../core/format.js';
import { ensurePeriod, toLocalISO } from '../core/period.js';
import { db } from '../core/state.js';
import { effectivePeriodEnd } from '../excel/dataSheets.js';
import { computePeriodRange, inRange } from './periodRange.js';

/* ---------- expense statement modal ---------- */
export const EXP_CATEGORIES = ['Fuel','Maintenance','Garage','Insurance','Cleaning','Airport','Parking',
  'Driver allowance','Owner payout','Leased car','Other'];
export let expPeriodType = 'monthly';
export function populateExpVehiclePick(){
  const sel = document.getElementById('exp_vehicle_pick');
  const current = sel.value;
  const vOpts = db.vehicles.map(v=>`<option value="${v.id}">${escapeHTML(v.reg)} — ${escapeHTML(v.make)} ${escapeHTML(v.model)}</option>`).join('');
  sel.innerHTML = '<option value="">All expenses (fleet-wide + office)</option>' + vOpts +
    '<option value="OFFICE">— Office / General only —</option>';
  sel.value = current;
}
export function showCategoryView(){
  document.querySelector('#expCatTable').closest('.table-wrap').style.display = '';
  document.getElementById('expDetailWrap').style.display = 'none';
}
/* Falls back to the ledger's own working period (db.period) rather than the
   browser's real-world "today" when the Expense Statement view has never been
   opened this session. Without this, ticking only the sidebar "Fuel report
   sheet" / "Expense report sheet" checkboxes and saving — without ever visiting
   the Expense Statement screen — silently exported fuel/expense totals for
   whatever the actual calendar date happened to be, not the month the file is
   actually working in. That's the bug behind wrong/empty Fuel sheet exports:
   the fuel expenses were always in the ledger, the report was just looking at
   the wrong date range. */
export function expPeriodRangeVals(){
  const refEl = document.getElementById('exp_ref');
  const startEl = document.getElementById('exp_start');
  const endEl = document.getElementById('exp_end');
  const refVal = refEl ? refEl.value : '';
  const startVal = startEl ? startEl.value : '';
  if(!refVal && !startVal){
    ensurePeriod();
    return { start: new Date(db.period.start+'T00:00:00'), end: effectivePeriodEnd(db.period) };
  }
  return computePeriodRange(expPeriodType, refVal, startVal, endEl ? endEl.value : '');
}
export function renderExpenseStatement(){
  const {start,end} = expPeriodRangeVals();
  document.getElementById('expPeriodLabel').textContent =
    'Showing: ' + start.toDateString() + '  →  ' + end.toDateString();

  const vid = document.getElementById('exp_vehicle_pick').value;
  const v = (vid && vid!=='OFFICE') ? db.vehicles.find(v=>v.id==vid) : null;
  let rows = db.expenses.filter(x=>inRange(x.date,start,end));
  if(vid==='OFFICE') rows = rows.filter(x=>!x.vehicleId);
  else if(vid) rows = rows.filter(x=>x.vehicleId==vid);
  const total = rows.reduce((s,x)=>s+x.amount,0);

  const scopeLabel = v ? v.reg+' — '+v.make+' '+v.model : (vid==='OFFICE' ? 'Office / General only' : 'Whole fleet (vehicles + office)');
  document.getElementById('expTotalCards').innerHTML = `
    <div class="card"><div class="label">Scope</div><div class="value" style="font-size:16px;">${scopeLabel}</div></div>
    <div class="card"><div class="label">Transactions</div><div class="value">${rows.length}</div></div>
    <div class="card"><div class="label">Total expenses</div><div class="value red">${fmt(total)}</div></div>`;

  const byCat = {};
  EXP_CATEGORIES.forEach(c=>byCat[c]={count:0,amount:0});
  rows.forEach(x=>{
    const cat = byCat[x.category] ? x.category : 'Other';
    byCat[cat].count++; byCat[cat].amount += x.amount;
  });
  document.getElementById('expCatHeading').textContent = (v ? v.reg+' — ' : (vid==='OFFICE' ? 'Office / General — ' : 'Fleet-wide — ')) + 'expense by category';

  const tb = document.querySelector('#expCatTable tbody'); tb.innerHTML = '';
  const cats = EXP_CATEGORIES.filter(c=>byCat[c].count>0).sort((a,b)=>byCat[b].amount-byCat[a].amount);
  if(!cats.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="4">No expenses in this period.</td></tr>'; return; }
  cats.forEach(cat=>{
    const d = byCat[cat];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${cat}</td><td class="num">${d.count}</td><td class="num">${fmt(d.amount)}</td>
      <td class="num">${total ? (d.amount/total*100).toFixed(1) : '0.0'}%</td>`;
    tr.addEventListener('click', ()=> showCategoryDetail(cat));
    tb.appendChild(tr);
  });
  renderFuelRecovery(start,end,vid);
}
export function renderFuelRecovery(start,end,vid){
  let rows = db.expenses.filter(x=>x.category==='Fuel' && x.billable && inRange(x.date,start,end));
  if(vid) rows = rows.filter(x=>x.vehicleId==vid);
  const officeCost = rows.reduce((s,x)=>s+x.amount,0);
  const charged = rows.reduce((s,x)=>s+(x.chargeAmount||0),0);
  const net = charged - officeCost;
  document.getElementById('fuelRecoveryCards').innerHTML = `
    <div class="card"><div class="label">Fuel fronted for clients</div><div class="value">${fmt(officeCost)}</div></div>
    <div class="card"><div class="label">Charged to clients</div><div class="value amber">${fmt(charged)}</div></div>
    <div class="card"><div class="label">Net to office</div><div class="value ${net>=0?'green':'red'}">${fmt(net)}</div></div>`;

  const byClient = {};
  rows.forEach(x=>{
    const cid = x.billClientId;
    if(!byClient[cid]) byClient[cid] = {count:0, cost:0, charged:0};
    byClient[cid].count++; byClient[cid].cost += x.amount; byClient[cid].charged += (x.chargeAmount||0);
  });
  const tb = document.querySelector('#fuelRecoveryTable tbody'); tb.innerHTML = '';
  const cids = Object.keys(byClient);
  if(!cids.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="5">No client-billed fuel in this period.</td></tr>'; }
  else {
    cids.sort((a,b)=>byClient[b].charged-byClient[a].charged).forEach(cid=>{
      const c = db.clients.find(c=>c.id==cid);
      const d = byClient[cid];
      const n = d.charged - d.cost;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHTML(c?c.name:'—')}</td><td class="num">${d.count}</td><td class="num">${fmt(d.cost)}</td>
        <td class="num">${fmt(d.charged)}</td><td class="num" style="color:${n>=0?'var(--green)':'var(--red)'}">${fmt(n)}</td>`;
      tb.appendChild(tr);
    });
  }

  const bySource = { rental:{count:0,cost:0,charged:0}, manual:{count:0,cost:0,charged:0} };
  rows.forEach(x=>{
    const key = x.source==='rental' ? 'rental' : 'manual';
    bySource[key].count++; bySource[key].cost += x.amount; bySource[key].charged += (x.chargeAmount||0);
  });
  const tb2 = document.querySelector('#fuelSourceTable tbody'); tb2.innerHTML = '';
  const srcRows = [['rental','Rental-linked (auto)'],['manual','Manual entry']].filter(([key])=>bySource[key].count>0);
  if(!srcRows.length){ tb2.innerHTML = '<tr class="empty-row"><td colspan="5">No client-billed fuel in this period.</td></tr>'; return; }
  srcRows.forEach(([key,label])=>{
    const d = bySource[key];
    const n = d.charged - d.cost;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${label}</td><td class="num">${d.count}</td><td class="num">${fmt(d.cost)}</td>
      <td class="num">${fmt(d.charged)}</td><td class="num" style="color:${n>=0?'var(--green)':'var(--red)'}">${fmt(n)}</td>`;
    tb2.appendChild(tr);
  });
}
export function showCategoryDetail(cat){
  const {start,end} = expPeriodRangeVals();
  const vid = document.getElementById('exp_vehicle_pick').value;
  let rows = db.expenses.filter(x=>inRange(x.date,start,end) && (byCatMatch(x.category)===cat));
  if(vid==='OFFICE') rows = rows.filter(x=>!x.vehicleId);
  else if(vid) rows = rows.filter(x=>x.vehicleId==vid);
  rows.sort((a,b)=> a.date<b.date?-1:(a.date>b.date?1:0));

  document.querySelector('#expCatTable').closest('.table-wrap').style.display = 'none';
  document.getElementById('expDetailWrap').style.display = '';
  document.getElementById('expDetailHeading').textContent = cat + ' — ' + rows.length + ' transaction' + (rows.length!==1?'s':'') +
    (rows.length ? ' — total ' + fmt(rows.reduce((s,x)=>s+x.amount,0)) : '');

  const isFuel = cat === 'Fuel';
  document.querySelector('#expDetailTable thead tr').innerHTML =
    '<th>Date</th><th>Vehicle</th><th>Description</th><th class="num">Qty</th><th class="num">Amount</th>' +
    (isFuel ? '<th>Billed to</th><th class="num">Charged</th><th class="num">Net</th><th>Source</th>' : '');

  const tb = document.querySelector('#expDetailTable tbody'); tb.innerHTML = '';
  if(!rows.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="'+(isFuel?9:5)+'">No transactions.</td></tr>'; return; }
  rows.forEach(x=>{
    const veh = db.vehicles.find(v=>v.id==x.vehicleId);
    let extra = '';
    if(isFuel){
      const rental = x.rentalId ? db.rentals.find(rr=>rr.id==x.rentalId) : null;
      const srcLabel = x.source==='rental' ? ('Rental' + (rental && rental.contract ? ' ('+rental.contract+')' : '')) : 'Manual';
      if(x.billable){
        const c = db.clients.find(c=>c.id==x.billClientId);
        const n = (x.chargeAmount||0) - x.amount;
        extra = `<td>${escapeHTML(c?c.name:'—')}</td><td class="num">${fmt(x.chargeAmount||0)}</td>
          <td class="num" style="color:${n>=0?'var(--green)':'var(--red)'}">${fmt(n)}</td><td>${srcLabel}</td>`;
      } else {
        extra = `<td>—</td><td class="num">—</td><td class="num">—</td><td>${srcLabel}</td>`;
      }
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${x.date}</td><td>${escapeHTML(veh?veh.reg:'—')}</td><td>${escapeHTML(x.desc||'—')}</td>
      <td class="num">${x.qty||1}</td><td class="num">${fmt(x.amount)}</td>${extra}`;
    tb.appendChild(tr);
  });
}
export function byCatMatch(rawCat){
  return EXP_CATEGORIES.includes(rawCat) ? rawCat : 'Other';
}

export function initExpenseStatement(){
  document.getElementById('btnExpenseStatement').addEventListener('click', ()=>{
    populateExpVehiclePick();
    if(!document.getElementById('exp_ref').value) document.getElementById('exp_ref').value = toLocalISO(new Date());
    document.getElementById('expModalOverlay').classList.add('show');
    showCategoryView();
    renderExpenseStatement();
  });
  document.getElementById('expModalClose').addEventListener('click', ()=>{
    document.getElementById('expModalOverlay').classList.remove('show');
  });
  document.getElementById('expModalOverlay').addEventListener('click', e=>{
    if(e.target.id==='expModalOverlay') document.getElementById('expModalOverlay').classList.remove('show');
  });
  document.getElementById('expPeriodSeg').addEventListener('click', e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    document.querySelectorAll('#expPeriodSeg button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    expPeriodType = btn.dataset.p;
    document.getElementById('exp_ref').style.display = expPeriodType==='custom' ? 'none' : 'inline-block';
    document.getElementById('expCustomRange').style.display = expPeriodType==='custom' ? 'inline-flex' : 'none';
    renderExpenseStatement();
  });
  document.getElementById('exp_ref').addEventListener('change', renderExpenseStatement);
  document.getElementById('exp_start').addEventListener('change', renderExpenseStatement);
  document.getElementById('exp_end').addEventListener('change', renderExpenseStatement);
  document.getElementById('exp_vehicle_pick').addEventListener('change', ()=>{ showCategoryView(); renderExpenseStatement(); });
  document.getElementById('btnPrintExpense').addEventListener('click', ()=> window.print());
  document.getElementById('btnExpDetailBack').addEventListener('click', showCategoryView);
}
