import { fmt, escapeHTML } from '../core/format.js';
import { owedForRental } from '../core/paymentMath.js';
import { db } from '../core/state.js';
import { getDueSoonBookings } from './bookings.js';
import { navigateToRecord } from '../ui/recordNavigation.js';

/* ---------- watchlist ---------- */
export function buildWatchlist(){
  const items=[];
  const due = getDueSoonBookings();
  due.forEach(bk=>{
    const v=db.vehicles.find(v=>v.id==bk.vehicleId), c=db.clients.find(c=>c.id==bk.clientId);
    const today=new Date(); today.setHours(0,0,0,0);
    const p=new Date(bk.pickup+'T00:00:00');
    const when=p.getTime()===today.getTime()?'Today':'Tomorrow';
    items.push({type:'red',icon:'🔔',title:`${when} pickup — ${v?v.reg:'Vehicle'}`,sub:`${c?c.name:'Client'} · pickup ${bk.pickup}`,
      nav:{panel:'bookings', id:bk.id}});
  });
  db.vehicles.filter(v=>v.status==='Maintenance').forEach(v=>items.push({type:'gold',icon:'🔧',title:`Vehicle in service — ${v.reg}`,sub:`${v.make||''} ${v.model||''}`.trim()||'Maintenance required',
    nav:{panel:'vehicles', id:v.id}}));
  db.rentals.filter(r=>r.status!=='Cancelled' && owedForRental(r)>0).forEach(r=>{
    const v=db.vehicles.find(v=>v.id==r.vehicleId), c=db.clients.find(c=>c.id==r.clientId), owed=owedForRental(r);
    // Money owed on a rental is a payments task, not a rentals-table lookup — send
    // the user straight to the Payments form with this rental already selected.
    items.push({type:'red',icon:'💰',title:`Outstanding rental — ${v?v.reg:'Vehicle'}`,sub:`${c?c.name:'Client'} · ${fmt(owed)} still owed`,
      nav:{panel:'payments', selectId:'p_rental', value:r.id, formId:'paymentForm'}});
  });
  db.rentals.filter(r=>r.status==='Active').forEach(r=>{
    const v=db.vehicles.find(v=>v.id==r.vehicleId), c=db.clients.find(c=>c.id==r.clientId);
    const due=new Date(r.return+'T23:59:59');
    if(due.getTime()<Date.now()) items.push({type:'red',icon:'⏰',title:`Overdue return — ${v?v.reg:'Vehicle'}`,sub:`${c?c.name:'Client'} · due ${r.return}`,
      nav:{panel:'rentals', id:r.id}});
  });
  return items;
}
export function renderWatchlist(){
  const items=buildWatchlist();
  const count=document.getElementById('watchlistCount'); if(count) count.textContent=items.length;
  const body=document.getElementById('watchlistBody'); if(!body) return;
  if(!items.length){ body.innerHTML='<div class="watch-empty">✓ Nothing needs attention right now.</div>'; return; }
  body.innerHTML=items.map((x,i)=>`<div class="watch-item" data-i="${i}" style="cursor:pointer;"><div class="watch-icon ${x.type}">${x.icon}</div><div class="watch-main"><div class="watch-title">${escapeHTML(x.title)}</div><div class="watch-sub">${escapeHTML(x.sub)}</div></div></div>`).join('');
  body.querySelectorAll('.watch-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const item = items[Number(el.dataset.i)];
      if(item && item.nav) navigateToRecord(item.nav.panel, item.nav);
    });
  });
}

export function initWatchlist(){
  (function(){
    const btn=document.getElementById('btnWatchlist'), overlay=document.getElementById('watchlistOverlay'), close=document.getElementById('watchlistClose');
    if(!btn||!overlay) return;
    const open=()=>{renderWatchlist();overlay.classList.add('show');overlay.setAttribute('aria-hidden','false');};
    const hide=()=>{overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true');};
    btn.addEventListener('click',open); if(close) close.addEventListener('click',hide);
    overlay.addEventListener('click',e=>{if(e.target===overlay) hide();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape') hide();});
  })();
}
