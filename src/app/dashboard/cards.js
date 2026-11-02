import { fmt, escapeHTML } from '../core/format.js';
import { paidForRental } from '../core/paymentMath.js';
import { db, markDirty } from '../core/state.js';
import { renderDashBookings } from './bookings.js';
import { renderDashChart } from './fleetChart.js';
import { renderTrendCharts } from './trendCharts.js';
import { compareDb, summarizeDbForPeriod } from '../features/compare.js';
import { renderAlerts } from '../features/dailyInfo.js';
import { dashCardsAllTime, inRange, periodRange, previousPeriodLabel, previousPeriodRange } from '../reports/periodRange.js';

/* ---------- dashboard ---------- */
export const DASH_ICONS = {
  car: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`,
  cash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v4M18 10v4"/></svg>`,
  receipt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>`,
  trend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>`,
  key: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.8 12.2 8.2-8.2"/><path d="m16 6 2 2M13.5 8.5l2 2"/></svg>`,
  fuel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18"/><path d="M3 10h10"/><path d="M14 8h2l3 3v7a1 1 0 0 1-1 1h-1"/><circle cx="17.5" cy="17.5" r="1.5"/><path d="M3 22h12"/></svg>`
};
export function dashCard(icon,label,valueHtml,footHtml,tint){
  return `<div class="card${tint?' tint-'+tint:''}"><div class="card-top"><div class="label">${label}</div>
    <div style="display:flex;align-items:center;gap:7px;"><button class="dash-privacy-btn" type="button" title="Show or blur dashboard value">👁</button><div class="card-icon">${DASH_ICONS[icon]}</div></div></div>
    <div class="value dash-sensitive">${valueHtml}</div>
    <div class="card-foot">${footHtml}</div></div>`;
}
export function deltaFoot(cur,prev,invert,label){
  if(label==='__ALLTIME__'){
    return `<span class="delta">All-time total</span><span class="badge">every record in file</span>`;
  }
  let deltaHtml;
  if(!prev){
    deltaHtml = cur ? '<span class="delta up">New activity</span>' : '<span class="delta">No activity</span>';
  } else {
    const pct = ((cur-prev)/Math.abs(prev))*100;
    let dir = pct>=0 ? 'up' : 'down';
    if(invert) dir = dir==='up' ? 'down' : 'up';
    deltaHtml = `<span class="delta ${dir}">${pct>=0?'▲':'▼'} ${Math.abs(pct).toFixed(0)}%</span>`;
  }
  return `${deltaHtml}<span class="badge">vs ${label || 'last month'}</span>`;
}
/* ---------- customizable dashboard widgets ----------
   Each widget is a small self-contained card. The registry maps an id to a label
   (for the customize tray) and a build(ctx) function returning the card's inner
   HTML via dashCard(). Layout (order, size, visibility) lives in
   db.settings.dashboardWidgets and round-trips through the Settings sheet, same
   as any other setting — so it's saved with the file, not just this browser tab. */
export const DASH_WIDGET_DEFS = {
  vehicles: { title:'Vehicles', build: ctx => dashCard('car','Vehicles', db.vehicles.length,
    `<span class="delta">Fleet size</span><span class="badge">Live</span>`) },
  revenue: { title:'Revenue', build: ctx => dashCard('cash','Revenue', `<span class="amber">${fmt(ctx.revThis)}</span>`, deltaFoot(ctx.revThis,ctx.revLast,false,ctx.compareLabel), 'amber') },
  expenses: { title:'Expenses', build: ctx => dashCard('receipt','Expenses', `<span class="red">${fmt(ctx.expThis)}</span>`, deltaFoot(ctx.expThis,ctx.expLast,true,ctx.compareLabel), 'red') },
  fuel: { title:'Fuel', build: ctx => dashCard('fuel','Fuel', `<span class="fuel">${fmt(ctx.fuelThis)}</span>`, deltaFoot(ctx.fuelThis,ctx.fuelLast,true,ctx.compareLabel), 'fuel') },
  net: { title:'Net income', build: ctx => dashCard('trend','Net income', `<span class="${ctx.netThis>=0?'green':'red'}">${fmt(ctx.netThis)}</span>`, deltaFoot(ctx.netThis,ctx.netLast,false,ctx.compareLabel), ctx.netThis>=0?'green':'red') },
  outstanding: { title:'Outstanding payments', build: ctx => dashCard('receipt','Outstanding payments', `<span class="${ctx.outstandingThis>0?'red':'green'}">${fmt(ctx.outstandingThis)}</span>`, `<span class="delta">${ctx.outstandingCount} rental${ctx.outstandingCount===1?'':'s'} with balance</span>`, ctx.outstandingThis>0?'red':'green') },
  onrent: { title:'Currently on rent', build: ctx => dashCard('key','Currently on rent', ctx.activeRentals.length,
    `<span class="delta">of ${db.vehicles.length} vehicles</span><span class="badge">Live</span>`) }
};
export const DEFAULT_DASH_SIZES = ['md','md','md','lg','sm','sm','sm'];
export const DEFAULT_DASH_LAYOUT = Object.keys(DASH_WIDGET_DEFS).map((id,i)=>({id, visible:true, size:DEFAULT_DASH_SIZES[i]||'md'}));
export let dashEditMode = false;
export let dashPrivacyRevealed = false;
export function getDashLayout(){
  const saved = db.settings && db.settings.dashboardWidgets;
  if(!Array.isArray(saved) || !saved.length) return DEFAULT_DASH_LAYOUT.map(w=>({...w}));
  const known = saved.filter(w=>w && DASH_WIDGET_DEFS[w.id]).map(w=>({id:w.id, visible: w.visible!==false, size: ['sm','md','lg'].includes(w.size)?w.size:'md'}));
  // Any widget added to the registry after this layout was saved (future update) still shows up.
  Object.keys(DASH_WIDGET_DEFS).forEach(id=>{ if(!known.some(w=>w.id===id)) known.push({id, visible:true, size:'md'}); });
  return known;
}
export function saveDashLayout(layout){
  if(!db.settings) db.settings = { adminPin: null };
  db.settings.dashboardWidgets = layout;
  markDirty();
}
export function renderDashCards(ctx){
  const layout = getDashLayout();
  const container = document.getElementById('dashCards');
  container.classList.toggle('dash-editing', dashEditMode);
  container.innerHTML = layout.filter(w=>w.visible).map(w=>{
    const def = DASH_WIDGET_DEFS[w.id];
    if(!def) return '';
    const html = def.build(ctx);
    // Splice widget id, size class and (in edit mode) the drag/resize/remove tools onto
    // the card dashCard() already built, rather than changing dashCard's own signature.
    const tools = `<div class="card-tools">
        <button class="size-btn" data-size="sm" title="Small">S</button>
        <button class="size-btn" data-size="md" title="Medium">M</button>
        <button class="size-btn" data-size="lg" title="Large">L</button>
        <button class="remove-btn" title="Remove from dashboard">✕</button>
      </div>`;
    return html.replace('<div class="card-top">', tools + '<div class="card-top">')
      .replace('<div class="card', `<div data-widget-id="${w.id}" draggable="${dashEditMode}" class="card size-${w.size}`);
  }).join('');
  wireDashCardControls(layout);
  container.classList.toggle('dash-privacy-revealed', !!dashPrivacyRevealed);
  container.querySelectorAll('.dash-privacy-btn').forEach(btn=>btn.addEventListener('click',()=>{
    dashPrivacyRevealed = !dashPrivacyRevealed;
    container.classList.toggle('dash-privacy-revealed', dashPrivacyRevealed);
    container.querySelectorAll('.dash-privacy-btn').forEach(b=>b.textContent = dashPrivacyRevealed ? '🙈' : '👁');
  }));
  container.querySelectorAll('.dash-privacy-btn').forEach(b=>b.textContent = dashPrivacyRevealed ? '🙈' : '👁');
  renderHiddenWidgetsTray(layout);
}
export function renderHiddenWidgetsTray(layout){
  const tray = document.getElementById('hiddenWidgetsTray');
  const hidden = layout.filter(w=>!w.visible);
  tray.classList.toggle('show', dashEditMode && hidden.length>0);
  if(!hidden.length){ tray.innerHTML=''; return; }
  tray.innerHTML = hidden.map(w=>`<button class="btn" data-add="${w.id}">+ ${escapeHTML(DASH_WIDGET_DEFS[w.id] ? DASH_WIDGET_DEFS[w.id].title : w.id)}</button>`).join('');
  tray.querySelectorAll('[data-add]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const layout2 = getDashLayout();
      const w = layout2.find(w=>w.id===btn.dataset.add);
      if(w){ w.visible = true; saveDashLayout(layout2); renderDashboard(); }
    });
  });
}
export function wireDashCardControls(layout){
  const container = document.getElementById('dashCards');
  container.querySelectorAll('.card').forEach(card=>{
    const id = card.dataset.widgetId;
    card.querySelectorAll('.size-btn').forEach(btn=>{
      btn.classList.toggle('active', card.classList.contains('size-'+btn.dataset.size));
      btn.addEventListener('click', ()=>{
        const layout2 = getDashLayout();
        const w = layout2.find(w=>w.id===id);
        if(w){ w.size = btn.dataset.size; saveDashLayout(layout2); renderDashboard(); }
      });
    });
    const removeBtn = card.querySelector('.remove-btn');
    if(removeBtn) removeBtn.addEventListener('click', ()=>{
      const layout2 = getDashLayout();
      const w = layout2.find(w=>w.id===id);
      if(w){ w.visible = false; saveDashLayout(layout2); renderDashboard(); }
    });
    if(!dashEditMode) return;
    card.addEventListener('dragstart', ()=>{ card.classList.add('dragging'); });
    card.addEventListener('dragend', ()=>{
      card.classList.remove('dragging');
      container.querySelectorAll('.card').forEach(c=>c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', e=>{
      e.preventDefault();
      if(!card.classList.contains('dragging')) card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', ()=> card.classList.remove('drag-over'));
    card.addEventListener('drop', e=>{
      e.preventDefault();
      card.classList.remove('drag-over');
      const draggingEl = container.querySelector('.card.dragging');
      if(!draggingEl || draggingEl===card) return;
      const fromId = draggingEl.dataset.widgetId, toId = card.dataset.widgetId;
      const layout2 = getDashLayout();
      const fromIdx = layout2.findIndex(w=>w.id===fromId), toIdx = layout2.findIndex(w=>w.id===toId);
      if(fromIdx<0 || toIdx<0) return;
      const [moved] = layout2.splice(fromIdx,1);
      layout2.splice(toIdx,0,moved);
      saveDashLayout(layout2);
      renderDashboard();
    });
  });
}
export function renderDashboard(){
  const liveLabel = document.getElementById('dashLivePeriodLabel');
  const modeLabel = document.getElementById('cardsModeLabel');
  const dashModeLabel = document.getElementById('dashCardsModeLabel');
  let rentalsIn, expensesIn, compareLabel;
  let revLast=null, expLast=null, fuelLast=null, netLast=null;

  if(dashCardsAllTime){
    // All-time mode: cards read straight off every record in the file, no date
    // filter at all — whether the data spans 2 days or 4 months, it all counts.
    rentalsIn = db.rentals.filter(r=>r.status!=='Cancelled');
    expensesIn = db.expenses.slice();
    compareLabel = '__ALLTIME__';
    if(liveLabel) liveLabel.textContent = `All-time totals — every record in this file`;
    const modeText = `Cards are on: All-time totals (default). Pick a period in Reports to make them follow it instead.`;
    if(modeLabel) modeLabel.textContent = modeText;
    if(dashModeLabel) dashModeLabel.textContent = modeText;
  } else {
    const {start,end} = periodRange();
    rentalsIn = db.rentals.filter(r=>r.status!=='Cancelled' && inRange(r.pickup,start,end));
    expensesIn = db.expenses.filter(x=>inRange(x.date,start,end));
    if(liveLabel) liveLabel.textContent = `${start.toDateString()} → ${end.toDateString()}`;
    const modeText = `Cards are following the period above. Press "Restore cards to default" in Reports for all-time totals.`;
    if(modeLabel) modeLabel.textContent = modeText;
    if(dashModeLabel) dashModeLabel.textContent = modeText;

    // Compare against an uploaded reference file's own period when one is loaded;
    // otherwise fall back to the equivalent prior period (previous week/month/year/etc.,
    // matching whichever period type is currently selected).
    if(compareDb){
      const cmp = summarizeDbForPeriod(compareDb);
      revLast = cmp.revenue; expLast = cmp.expenses; fuelLast = cmp.fuel; netLast = cmp.net;
      compareLabel = cmp.label;
    } else {
      const prev = previousPeriodRange();
      const rentalsPrev = db.rentals.filter(r=>r.status!=='Cancelled' && inRange(r.pickup,prev.start,prev.end));
      const expensesPrev = db.expenses.filter(x=>inRange(x.date,prev.start,prev.end));
      revLast = rentalsPrev.reduce((s,r)=>s+r.amount,0);
      expLast = expensesPrev.reduce((s,x)=>s+x.amount,0);
      fuelLast = expensesPrev.filter(x=>x.category==='Fuel').reduce((s,x)=>s+x.amount,0);
      netLast = revLast-expLast;
      compareLabel = previousPeriodLabel();
    }
  }

  const revThis = rentalsIn.reduce((s,r)=>s+r.amount,0);
  const expThis = expensesIn.reduce((s,x)=>s+x.amount,0);
  const fuelThis = expensesIn.filter(x=>x.category==='Fuel').reduce((s,x)=>s+x.amount,0);
  const netThis = revThis-expThis;
  const collectedThis = rentalsIn.reduce((s,r)=>s+paidForRental(r.id),0);
  const outstandingThis = revThis - collectedThis;
  const outstandingCount = rentalsIn.filter(r=>(r.amount-paidForRental(r.id))>0).length;

  const activeRentals = db.rentals.filter(r=>r.status==='Active');

  renderDashCards({ revThis, revLast, expThis, expLast, fuelThis, fuelLast, netThis, netLast, outstandingThis, outstandingCount, activeRentals, compareLabel });

  renderTrendCharts();
  const tb = document.querySelector('#dashActiveTable tbody'); tb.innerHTML='';
  if(!activeRentals.length){
    tb.innerHTML = '<tr class="empty-row"><td colspan="6">No cars are out on rent right now.</td></tr>';
  } else {
    activeRentals.forEach(r=>{
      const v = db.vehicles.find(v=>v.id==r.vehicleId), c = db.clients.find(c=>c.id==r.clientId);
      const dueBack = r.return + (r.returnTime?(' '+r.returnTime):'');
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHTML(v?v.reg:'—')}</td><td>${escapeHTML(v?v.make+' '+v.model:'—')}</td><td>${escapeHTML(c?c.name:'—')}</td>
        <td>${escapeHTML(r.contract||'—')}</td><td>${dueBack}</td><td class="num">${fmt(r.rate)}</td>`;
      tb.appendChild(tr);
    });
  }
  renderDashChart();
  renderDashBookings();
  renderAlerts();
}

export function initDashboardCards(){
  document.getElementById('btnCustomizeDash').addEventListener('click', ()=>{
    dashEditMode = !dashEditMode;
    const btn = document.getElementById('btnCustomizeDash');
    btn.textContent = dashEditMode ? '✓ Done customizing' : '🛠 Customize';
    btn.classList.toggle('primary', dashEditMode);
    document.getElementById('dashEditHint').style.display = dashEditMode ? '' : 'none';
    renderDashboard();
  });
}
