import { toLocalISO } from '../core/period.js';
import { renderDashboard } from '../dashboard/cards.js';
import { renderReports } from './reports.js';

/* ---------- reports ---------- */
export let periodType = 'monthly';
/* Dashboard cards can either follow the Reports/Dashboard period selector (like the
   rest of this file always did) or show all-time totals straight off the whole data
   file, independent of any period. All-time is the default on open — matching the
   "Restore cards to default" button, which flips back to it. Picking any period
   control (Daily/Weekly/Monthly/Yearly/Custom segment, or a reference/custom date)
   switches the cards to follow that period instead, until Restore is pressed again.
   Reports itself always shows the selected period's figures regardless of this flag —
   only the Dashboard summary cards read it. */
export let dashCardsAllTime = true;
export function setCardsFollowPeriod(){
  dashCardsAllTime = false;
}
/* The period picker is duplicated on the Dashboard (dashPeriodSeg/dash_rep_*) and on
   Reports (periodSeg/rep_*) so either panel can drive it. Both sets of controls are
   kept mirrored and both renderReports()+renderDashboard() run on every change, so
   the two panels always agree on the same numbers for the same period. */
export function setPeriodType(type){
  periodType = type;
  document.querySelectorAll('#periodSeg button').forEach(b=>b.classList.toggle('active', b.dataset.p===type));
  document.querySelectorAll('#dashPeriodSeg button').forEach(b=>b.classList.toggle('active', b.dataset.p===type));
  const showCustom = type==='custom';
  document.getElementById('rep_ref').style.display = showCustom ? 'none' : 'inline-block';
  document.getElementById('customRange').style.display = showCustom ? 'inline-flex' : 'none';
  document.getElementById('dash_rep_ref').style.display = showCustom ? 'none' : 'inline-block';
  document.getElementById('dashCustomRange').style.display = showCustom ? 'inline-flex' : 'none';
}
export function syncPeriodDate(sourceId, targetId){
  const src = document.getElementById(sourceId), tgt = document.getElementById(targetId);
  if(src && tgt) tgt.value = src.value;
}
export function computePeriodRange(type, refStr, startStr, endStr){
  const ref = refStr ? new Date(refStr) : new Date();
  let start, end;
  if(type==='daily'){ start = new Date(ref); end = new Date(ref); }
  else if(type==='weekly'){
    const day = ref.getDay(); const diffToMon = (day===0?-6:1-day);
    start = new Date(ref); start.setDate(ref.getDate()+diffToMon);
    end = new Date(start); end.setDate(start.getDate()+6);
  } else if(type==='monthly'){
    start = new Date(ref.getFullYear(), ref.getMonth(), 1);
    end = new Date(ref.getFullYear(), ref.getMonth()+1, 0);
  } else if(type==='yearly'){
    start = new Date(ref.getFullYear(),0,1); end = new Date(ref.getFullYear(),11,31);
  } else {
    start = startStr? new Date(startStr) : new Date(0); end = endStr? new Date(endStr) : new Date();
  }
  start.setHours(0,0,0,0); end.setHours(23,59,59,999);
  return {start,end};
}
export function periodRange(){
  return computePeriodRange(periodType,
    document.getElementById('rep_ref').value,
    document.getElementById('rep_start').value,
    document.getElementById('rep_end').value);
}
/* The equivalent prior period for whichever period type is currently selected —
   previous day for Daily, previous week for Weekly, previous calendar month for
   Monthly, previous year for Yearly, and an equal-length window right before the
   current range for Custom. Used to build the dashboard's "vs previous period" deltas. */
export function previousPeriodRange(){
  const refStr = document.getElementById('rep_ref').value;
  const ref = refStr ? new Date(refStr) : new Date();
  if(periodType==='daily'){
    const d = new Date(ref); d.setDate(d.getDate()-1);
    return computePeriodRange('daily', toLocalISO(d));
  }
  if(periodType==='weekly'){
    const d = new Date(ref); d.setDate(d.getDate()-7);
    return computePeriodRange('weekly', toLocalISO(d));
  }
  if(periodType==='yearly'){
    const d = new Date(ref.getFullYear()-1, 0, 1);
    return computePeriodRange('yearly', toLocalISO(d));
  }
  if(periodType==='custom'){
    const {start,end} = periodRange();
    const durMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 24*60*60*1000);
    const prevStart = new Date(prevEnd.getTime() - durMs);
    return {start:prevStart, end:prevEnd};
  }
  // monthly (default)
  const d = new Date(ref.getFullYear(), ref.getMonth()-1, 1);
  return computePeriodRange('monthly', toLocalISO(d));
}
export function previousPeriodLabel(){
  return { daily:'previous day', weekly:'previous week', monthly:'previous month', yearly:'previous year', custom:'previous period' }[periodType] || 'previous period';
}
export function inRange(dateStr, start, end){
  const d = new Date(dateStr); return d>=start && d<=end;
}
export function setDashCardsAllTime(value){ dashCardsAllTime = value; }

export function initPeriodControls(){
  document.getElementById('periodSeg').addEventListener('click', e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    setPeriodType(btn.dataset.p);
    setCardsFollowPeriod();
    renderReports(); renderDashboard();
  });
  document.getElementById('dashPeriodSeg').addEventListener('click', e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    setPeriodType(btn.dataset.p);
    setCardsFollowPeriod();
    renderReports(); renderDashboard();
  });
  document.getElementById('rep_ref').addEventListener('change', ()=>{ syncPeriodDate('rep_ref','dash_rep_ref'); setCardsFollowPeriod(); renderReports(); renderDashboard(); });
  document.getElementById('dash_rep_ref').addEventListener('change', ()=>{ syncPeriodDate('dash_rep_ref','rep_ref'); setCardsFollowPeriod(); renderReports(); renderDashboard(); });
  document.getElementById('rep_start').addEventListener('change', ()=>{ syncPeriodDate('rep_start','dash_rep_start'); setCardsFollowPeriod(); renderReports(); renderDashboard(); });
  document.getElementById('dash_rep_start').addEventListener('change', ()=>{ syncPeriodDate('dash_rep_start','rep_start'); setCardsFollowPeriod(); renderReports(); renderDashboard(); });
  document.getElementById('rep_end').addEventListener('change', ()=>{ syncPeriodDate('rep_end','dash_rep_end'); setCardsFollowPeriod(); renderReports(); renderDashboard(); });
  document.getElementById('dash_rep_end').addEventListener('change', ()=>{ syncPeriodDate('dash_rep_end','rep_end'); setCardsFollowPeriod(); renderReports(); renderDashboard(); });
  document.getElementById('btnPrint').addEventListener('click', ()=> window.print());
  document.getElementById('btnRestoreCardsDefault').addEventListener('click', ()=>{
    dashCardsAllTime = true;
    renderDashboard();
  });
}
