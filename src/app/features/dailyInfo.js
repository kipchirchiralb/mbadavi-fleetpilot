import { escapeHTML, fmt } from '../core/format.js';
import { owedForRental } from '../core/paymentMath.js';
import { toLocalISO } from '../core/period.js';
import { db, markDirty } from '../core/state.js';
import { closeExtractNotice } from './bookingExtract.js';

export let dailyInfoDate = toLocalISO(new Date());
/* ---------- daily information + alerts ---------- */
export function getDailySummary(date){
  const rentals = db.rentals.filter(r=>r.status!=='Cancelled' && r.pickup===date);
  const revenue = rentals.reduce((s,r)=>s+(Number(r.amount)||0),0);
  const payments = db.payments.filter(p=>p.date===date).reduce((s,p)=>s+(Number(p.amount)||0),0);
  const expenses = db.expenses.filter(x=>x.date===date).reduce((s,x)=>s+(Number(x.amount)||0),0);
  const activeOnDate = db.rentals.filter(r=>r.status!=='Cancelled' && r.pickup<=date && r.return>=date);
  const dueBack = db.rentals.filter(r=>r.status==='Active' && r.return===date);
  const overdue = db.rentals.filter(r=>r.status==='Active' && r.return<date);
  const unavailable = db.vehicles.filter(v=>v.status==='Maintenance' || v.status==='Inactive').length;
  const available = db.vehicles.filter(v=>v.status==='Available').length;
  const bookings = db.bookings.filter(b=>b.bookedOn===date).length;
  const outstanding = rentals.reduce((s,r)=>s+owedForRental(r),0);
  return {rentals,revenue,payments,expenses,net:revenue-expenses,activeOnDate,dueBack,overdue,unavailable,available,bookings,outstanding};
}
export function renderDailyInfo(){
  const date=document.getElementById('dailyInfoDate').value || toLocalISO(new Date()); dailyInfoDate=date;
  const x=getDailySummary(date), k=document.getElementById('dailyInfoKpis');
  const card=(label,value)=>`<div class="daily-kpi"><div class="k-label">${label}</div><div class="k-value">${value}</div></div>`;
  k.innerHTML=[card('Rental revenue',fmt(x.revenue)),card('Payments received',fmt(x.payments)),card('Outstanding',fmt(x.outstanding)),card('Expenses',fmt(x.expenses)),card('Net position',fmt(x.net)),card('Vehicles rented',x.activeOnDate.length),card('Vehicles available',x.available),card('Vehicles due back',x.dueBack.length),card('Overdue rentals',x.overdue.length),card('New bookings',x.bookings)].join('');
  const tb=document.querySelector('#dailyInfoRentalTable tbody'); tb.innerHTML='';
  if(!x.rentals.length){tb.innerHTML='<tr class="empty-row"><td colspan="8">No rentals picked up on this date.</td></tr>';return;}
  x.rentals.forEach(r=>{const v=db.vehicles.find(v=>v.id==r.vehicleId),c=db.clients.find(c=>c.id==r.clientId);const tr=document.createElement('tr');tr.innerHTML=`<td>${escapeHTML(v?v.reg:'—')}</td><td>${escapeHTML(c?c.name:'—')}</td><td>${escapeHTML(r.contract||'—')}</td><td>${escapeHTML(r.pickup||'—')}</td><td>${escapeHTML(r.return||'—')}</td><td>${escapeHTML(r.status||'—')}</td><td class="num">${fmt(r.amount)}</td><td class="num">${fmt(owedForRental(r))}</td>`;tb.appendChild(tr);});
}
/* Autonomous vehicle-status conflict guard.
   Active rental = Rented; no active rental = Available for operational vehicles.
   Maintenance/Inactive statuses are preserved. */
export function reconcileVehicleRentalStatuses(){
  if(!db || !Array.isArray(db.vehicles) || !Array.isArray(db.rentals)) return [];
  const conflicts = [];
  db.vehicles.forEach(v=>{
    if(v.status==='Maintenance' || v.status==='Inactive') return;
    const active = db.rentals.find(r=>r.vehicleId==v.id && r.status==='Active');
    const shouldBe = active ? 'Rented' : 'Available';
    if(v.status !== shouldBe){
      conflicts.push({vehicleId:v.id, oldStatus:v.status, newStatus:shouldBe, rentalId:active?active.id:null});
      v.status = shouldBe;
    }
  });
  if(conflicts.length){
    markDirty();
  }
  return conflicts;
}
export function buildAlerts(){
  reconcileVehicleRentalStatuses();
  const today=toLocalISO(new Date()), alerts=[];
  db.rentals.filter(r=>r.status==='Active' && r.return<today).forEach(r=>{const v=db.vehicles.find(v=>v.id==r.vehicleId);alerts.push({type:'overdue',title:'Overdue rental',text:`${v?v.reg:'Vehicle'} was due back on ${r.return}.`,panel:'rentals',id:r.id,go:'Open Rentals'});});
  db.rentals.filter(r=>r.status==='Active' && r.return===today).forEach(r=>{const v=db.vehicles.find(v=>v.id==r.vehicleId);alerts.push({type:'due',title:'Vehicle due back today',text:`${v?v.reg:'Vehicle'} is scheduled for return today.`,panel:'rentals',id:r.id,go:'Open Rentals'});});
  const available=db.vehicles.filter(v=>v.status==='Available').length;
  const totalOperational=db.vehicles.filter(v=>v.status!=='Inactive').length;
  const lowThreshold=totalOperational<=3?1:Math.max(1,Math.ceil(totalOperational*0.2));
  if(totalOperational>0 && available<=lowThreshold) alerts.push({type:'low',title:'Low vehicle availability',text:`Only ${available} vehicle${available===1?' is':'s are'} currently available.`,panel:'vehicles',id:null,go:'Open Vehicles'});
  db.rentals.filter(r=>r.status!=='Cancelled' && owedForRental(r)>0).forEach(r=>{const v=db.vehicles.find(v=>v.id==r.vehicleId),c=db.clients.find(c=>c.id==r.clientId);alerts.push({type:'payment',title:'Missing or outstanding payment',text:`${c?c.name:'Client'} · ${v?v.reg:'Vehicle'} has ${fmt(owedForRental(r))} outstanding.`,panel:'rentals',id:r.id,go:'Open Rentals'});});
  return alerts;
}
export function jumpToAlertSource(a){
  const navBtn=document.querySelector(`.nav button[data-panel="${a.panel}"]`);
  if(navBtn) navBtn.click();
  const findTarget=()=>{
    let target=null;
    if(a.id!=null){
      target=document.querySelector(`#panel-${a.panel} [data-id="${a.id}"]`);
      if(target && target.tagName!=='TR') target=target.closest('tr') || target;
    }
    if(!target) target=document.querySelector(`#panel-${a.panel} table`);
    if(target){
      target.scrollIntoView({behavior:'smooth',block:'center'});
      const row=target.closest('tr') || target;
      const oldBg=row.style.background;
      const oldTransition=row.style.transition;
      row.style.transition='background .2s ease, box-shadow .2s ease';
      row.style.background='rgba(214,168,79,.16)';
      row.style.boxShadow='0 0 0 1px var(--amber), 0 0 22px rgba(214,168,79,.12)';
      setTimeout(()=>{row.style.background=oldBg;row.style.boxShadow='';row.style.transition=oldTransition;},2200);
    }
  };
  setTimeout(findTarget,80);
}
export function renderAlerts(){
  const alerts=buildAlerts(), count=document.getElementById('alertCount'); if(count) count.textContent=alerts.length;
  const body=document.getElementById('alertsBody'); if(!body)return;
  body.innerHTML=alerts.length?alerts.map((a,i)=>`<div class="alert-item alert-clickable" data-alert-index="${i}" tabindex="0" role="button">
    <strong>${a.type==='overdue'?'🔴':a.type==='due'?'🟠':a.type==='low'?'🟡':'🔵'} ${escapeHTML(a.title)}</strong>
    <small>${escapeHTML(a.text)}</small>
    <span class="alert-go">↗ ${escapeHTML(a.go||'Open source')}</span>
  </div>`).join(''):'<div class="success-callout" role="status">✓ No current alerts. Your fleet is clear for now.</div>';

  body.querySelectorAll('.alert-clickable').forEach(el=>{
    const activate=()=>{
      const a=alerts[Number(el.dataset.alertIndex)];
      if(!a) return;
      closeAlerts();
      jumpToAlertSource(a);
    };
    el.addEventListener('click',activate);
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter' || e.key===' '){e.preventDefault();activate();}
    });
  });
}
export function openDailyInfo(){const ov=document.getElementById('dailyInfoOverlay');ov.classList.add('show');ov.setAttribute('aria-hidden','false');document.getElementById('dailyInfoDate').value=dailyInfoDate;renderDailyInfo();}
export function closeDailyInfo(){const ov=document.getElementById('dailyInfoOverlay');ov.classList.remove('show');ov.setAttribute('aria-hidden','true');}
export function openAlerts(){const ov=document.getElementById('alertsOverlay');renderAlerts();ov.classList.add('show');ov.setAttribute('aria-hidden','false');}
export function closeAlerts(){const ov=document.getElementById('alertsOverlay');ov.classList.remove('show');ov.setAttribute('aria-hidden','true');}

export function initDailyInfo(){
  document.getElementById('btnDailyInfo').addEventListener('click',openDailyInfo);
  document.getElementById('dailyInfoClose').addEventListener('click',closeDailyInfo);
  document.getElementById('dailyInfoOverlay').addEventListener('click',e=>{if(e.target.id==='dailyInfoOverlay')closeDailyInfo();});
  document.getElementById('dailyInfoDate').addEventListener('change',renderDailyInfo);
  document.getElementById('dailyInfoToday').addEventListener('click',()=>{document.getElementById('dailyInfoDate').value=toLocalISO(new Date());renderDailyInfo();});
  document.getElementById('btnAlerts').addEventListener('click',openAlerts);
  document.getElementById('alertsClose').addEventListener('click',closeAlerts);
  document.getElementById('alertsOverlay').addEventListener('click',e=>{if(e.target.id==='alertsOverlay')closeAlerts();});
  document.getElementById('extractNoticeClose').addEventListener('click',closeExtractNotice);
  document.getElementById('extractNoticeGotIt').addEventListener('click',closeExtractNotice);
  document.getElementById('extractNoticeOverlay').addEventListener('click',e=>{if(e.target.id==='extractNoticeOverlay')closeExtractNotice();});
}
