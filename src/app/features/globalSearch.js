import { escapeHTML, fmt } from '../core/format.js';
import { db } from '../core/state.js';
import { navigateToRecord } from '../ui/recordNavigation.js';

/* ---------- global search ---------- */

/* Searches every record type by whatever text fields identify it (reg, names, phone,
   contract/invoice numbers, categories, notes...) and lists matches grouped loosely by
   kind. Clicking a result jumps to that record's panel and briefly highlights its row. */
export function runGlobalSearch(q){
  const out = document.getElementById('globalSearchResults');
  if(!q){ out.innerHTML = '<div class="hint" style="margin:4px 0;">Start typing to search across the whole database.</div>'; return; }
  const ql = q.toLowerCase();
  const hits = [];
  const matches = (...parts) => parts.filter(Boolean).join(' ').toLowerCase().includes(ql);

  db.vehicles.forEach(v=>{
    if(matches(v.reg, v.make, v.model, v.owner))
      hits.push({panel:'vehicles', id:v.id, label:`${v.reg||'—'} — ${v.make||''} ${v.model||''}`.trim(), sub:'Vehicle'+(v.owner?` · owner ${v.owner}`:'')});
  });
  db.drivers.forEach(d=>{
    if(matches(d.name, d.phone, d.license))
      hits.push({panel:'drivers', id:d.id, label:d.name||'—', sub:'Driver'+(d.phone?` · ${d.phone}`:'')});
  });
  db.clients.forEach(c=>{
    if(matches(c.name, c.phone, c.idnum, c.dl))
      hits.push({panel:'clients', id:c.id, label:c.name||'—', sub:'Client'+(c.phone?` · ${c.phone}`:'')});
  });
  db.bookings.forEach(bk=>{
    const v = db.vehicles.find(v=>v.id==bk.vehicleId), c = db.clients.find(c=>c.id==bk.clientId);
    if(matches(v&&v.reg, c&&c.name, bk.status, bk.pickup, bk.return))
      hits.push({panel:'bookings', id:bk.id, label:`${v?v.reg:'—'} → ${c?c.name:'—'}`, sub:`Booking · ${bk.pickup} → ${bk.return} · ${bk.status}`});
  });
  db.rentals.forEach(r=>{
    const v = db.vehicles.find(v=>v.id==r.vehicleId), c = db.clients.find(c=>c.id==r.clientId);
    if(matches(v&&v.reg, c&&c.name, r.contract, r.invoice, r.receipt, r.status))
      hits.push({panel:'rentals', id:r.id, label:`${v?v.reg:'—'} → ${c?c.name:'—'}`, sub:`Rental · ${r.contract||'no contract#'} · ${r.status}`});
  });
  db.expenses.forEach(x=>{
    const v = db.vehicles.find(v=>v.id==x.vehicleId);
    if(matches(v&&v.reg, x.category, x.desc))
      hits.push({panel:'expenses', id:x.id, label:`${x.category}${x.desc?' — '+x.desc:''}`, sub:`Expense · ${x.date} · ${v?v.reg:'Office'}`});
  });
  db.payments.forEach(p=>{
    const r = db.rentals.find(r=>r.id==p.rentalId);
    const v = r ? db.vehicles.find(v=>v.id==r.vehicleId) : null, c = r ? db.clients.find(c=>c.id==r.clientId) : null;
    if(matches(v&&v.reg, c&&c.name, p.method, p.note))
      hits.push({panel:'payments', id:p.id, label:`${c?c.name:'—'} · ${fmt(p.amount)}`, sub:`Payment · ${p.date}${p.method?' · '+p.method:''}`});
  });
  db.driverAllowances.forEach(a=>{
    const d = db.drivers.find(d=>d.id==a.driverId);
    if(matches(d&&d.name, a.note))
      hits.push({panel:'drivers', id:a.id, label:`${d?d.name:'—'} allowance`, sub:`Allowance · ${a.weekStart} · ${fmt(a.amount)}`});
  });

  if(!hits.length){ out.innerHTML = '<div class="hint" style="margin:4px 0;">No matches.</div>'; return; }
  out.innerHTML = hits.slice(0,50).map((h,i)=>`
    <div class="search-hit" data-i="${i}" role="button" tabindex="0" style="padding:8px 6px;border-bottom:1px solid var(--line);cursor:pointer;">
      <div style="font-size:13px;">${escapeHTML(h.label)}</div>
      <div style="font-size:11px;color:var(--ink-faint);">${escapeHTML(h.sub)}</div>
    </div>`).join('');
  out.querySelectorAll('.search-hit').forEach(el=>{
    const open = ()=>{
      const h = hits[Number(el.dataset.i)];
      navigateToRecord(h.panel, {id:h.id});
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); open(); } });
  });
}

export function initGlobalSearch(){
  document.getElementById('btnGlobalSearchToggle').addEventListener('click', ()=>{
    const box = document.getElementById('globalSearchBox');
    const opening = box.style.display === 'none';
    box.style.display = opening ? '' : 'none';
    if(opening) document.getElementById('globalSearchInput').focus();
  });
  document.addEventListener('click', e=>{
    const box = document.getElementById('globalSearchBox');
    const toggle = document.getElementById('btnGlobalSearchToggle');
    if(box.style.display!=='none' && !box.contains(e.target) && e.target!==toggle){
      box.style.display = 'none';
    }
  });
  document.getElementById('globalSearchInput').addEventListener('input', e=>{
    runGlobalSearch(e.target.value.trim());
  });
}
