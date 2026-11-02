import { guardClosedMonth, lockBadge, monthOfDate } from '../core/closedMonths.js';
import { fmt, escapeHTML } from '../core/format.js';
import { toLocalISO } from '../core/period.js';
import { db, markDirty, uid } from '../core/state.js';
import { isReasonableDate, isValidMoney } from '../core/validation.js';
import { renderDashBookings } from '../dashboard/bookings.js';
import { monthDividerRow } from '../excel/dataSheets.js';
import { checkAdminPin } from './adminPin.js';
import { findVehicleConflicts } from './bookingConflicts.js';
import { extractBookingToRental } from './bookingExtract.js';
import { renderWatchlist } from './watchlist.js';
import { appConfirm, toast } from '../ui/dialogs.js';
import { clearFields, setEditMode } from '../ui/forms.js';
import { scrollToForm } from '../ui/recordNavigation.js';

export let editingBookingId = null;
/* ---------- bookings ---------- */
/* ---------- booking pickup reminders ---------- */
export function isDueSoon(bk){
  if(bk.status==='Cancelled' || bk.reminderAck) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  const p = new Date(bk.pickup+'T00:00:00');
  return p.getTime()===today.getTime() || p.getTime()===tomorrow.getTime();
}
export function getDueSoonBookings(){ return db.bookings.filter(isDueSoon); }
export function renderBookingReminders(){
  const due = getDueSoonBookings();
  const wrap = document.getElementById('bookingReminderWrap');
  const list = document.getElementById('bookingReminderList');
  const badge = document.getElementById('navBookingsBadge');
  if(!due.length){ wrap.style.display='none'; list.innerHTML=''; badge.style.display='none'; return; }
  wrap.style.display=''; badge.style.display='';
  const today = new Date(); today.setHours(0,0,0,0);
  list.innerHTML = due.map(bk=>{
    const v = db.vehicles.find(v=>v.id==bk.vehicleId), c = db.clients.find(c=>c.id==bk.clientId);
    const p = new Date(bk.pickup+'T00:00:00');
    const when = p.getTime()===today.getTime() ? 'Today' : 'Tomorrow';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);">
      <div style="font-size:13px;"><span class="row-reminder-dot" style="cursor:default;"></span>
        <b>${when}</b> — ${escapeHTML(v?v.reg:'—')} for ${escapeHTML(c?c.name:'—')} <span style="color:var(--ink-faint);">(pickup ${bk.pickup})</span></div>
      <button class="row-action" data-id="${bk.id}">Got it</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.row-action').forEach(b=>b.addEventListener('click',()=>{
    const bk = db.bookings.find(bk=>bk.id==b.dataset.id);
    if(bk){ bk.reminderAck = true; markDirty(); renderBookings(); }
  }));
  renderWatchlist();
}
export function renderBookings(){
  const tb = document.querySelector('#bookingTable tbody'); tb.innerHTML='';
  if(!db.bookings.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="8">No bookings yet.</td></tr>'; renderBookingReminders(); return; }
  let lastMonth = null;
  [...db.bookings].sort((a,b)=>new Date(b.pickup)-new Date(a.pickup)).forEach(bk=>{
    const rowMonth = monthOfDate(bk.pickup);
    if(rowMonth !== lastMonth){ tb.appendChild(monthDividerRow(11, rowMonth)); lastMonth = rowMonth; }
    const v = db.vehicles.find(v=>v.id==bk.vehicleId), c = db.clients.find(c=>c.id==bk.clientId);
    const canCancel = bk.status==='Pending' || bk.status==='Confirmed';
    const dueSoon = isDueSoon(bk);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${dueSoon?`<span class="row-reminder-dot" data-id="${bk.id}" title="Pickup ${bk.pickup} — click to dismiss reminder"></span>`:''}${escapeHTML(v?v.reg:'—')}</td><td>${escapeHTML(c?c.name:'—')}</td><td>${bk.bookedOn||'—'}</td>
      <td>${bk.pickup}${lockBadge(bk.pickup)}</td><td>${bk.return}</td>
      <td class="num">${bk.deposit?fmt(bk.deposit):'—'}</td>
      <td><span class="tag ${bk.status}">${bk.status}</span></td>
      <td>${bk.status!=='Cancelled'?`<button class="row-extract" data-id="${bk.id}" title="Start a rental pre-filled from this booking">⇥ Extract</button>`:''}${canCancel?`<button class="row-cancel" data-id="${bk.id}">Cancel</button>`:''}<button class="row-edit" title="Edit" aria-label="Edit" data-id="${bk.id}">✎</button><button class="row-del" title="Delete" aria-label="Delete" data-id="${bk.id}">✕</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.row-reminder-dot').forEach(d=>d.addEventListener('click', e=>{
    e.stopPropagation();
    const bk = db.bookings.find(bk=>bk.id==d.dataset.id);
    if(bk){ bk.reminderAck = true; markDirty(); renderBookings(); }
  }));
  tb.querySelectorAll('.row-extract').forEach(b=>b.addEventListener('click',()=>{
    const bk = db.bookings.find(bk=>bk.id==b.dataset.id); if(!bk) return;
    extractBookingToRental(bk);
  }));
  tb.querySelectorAll('.row-cancel').forEach(b=>b.addEventListener('click',()=>{
    const bk = db.bookings.find(bk=>bk.id==b.dataset.id); if(!bk) return;
    guardClosedMonth(bk.pickup, 'cancel this booking', ()=>{
      checkAdminPin('cancel this booking', ()=>{
        bk.status = 'Cancelled';
        markDirty(); renderBookings(); renderDashBookings();
        toast('Booking cancelled', 'success');
      });
    });
  }));
  tb.querySelectorAll('.row-edit').forEach(b=>b.addEventListener('click',()=>{
    const bk = db.bookings.find(bk=>bk.id==b.dataset.id); if(!bk) return;
    guardClosedMonth(bk.pickup, 'edit this booking', ()=>{
      checkAdminPin('edit this booking', ()=>{
        editingBookingId = bk.id;
        document.getElementById('bk_vehicle').value = bk.vehicleId;
        document.getElementById('bk_client').value = bk.clientId;
        document.getElementById('bk_date').value = bk.bookedOn||'';
        document.getElementById('bk_pickup').value = bk.pickup;
        document.getElementById('bk_return').value = bk.return;
        document.getElementById('bk_deposit').value = bk.deposit||'';
        document.getElementById('bk_status').value = bk.status;
        setEditMode('btnAddBooking', true, ()=>{ editingBookingId = null; clearFields(['bk_date','bk_pickup','bk_return','bk_deposit']); });
        scrollToForm('bookingForm');
        toast('Editing booking — update the fields and click Update booking');
      });
    });
  }));
  tb.querySelectorAll('.row-del').forEach(b=>b.addEventListener('click',()=>{
    const bk = db.bookings.find(bk=>bk.id==b.dataset.id); if(!bk) return;
    guardClosedMonth(bk.pickup, 'delete this booking', ()=>{
      checkAdminPin('delete this booking', ()=>{
        db.bookings = db.bookings.filter(x=>x.id!=bk.id);
        markDirty(); renderBookings(); renderDashBookings();
        toast('Booking deleted', 'success');
      });
    });
  }));
  renderBookingReminders();
}

export function initBookings(){
  document.getElementById('btnAddBooking').addEventListener('click', async ()=>{
    const vid = document.getElementById('bk_vehicle').value, cid = document.getElementById('bk_client').value;
    const pickup = document.getElementById('bk_pickup').value, ret = document.getElementById('bk_return').value;
    if(!vid||!cid||!pickup||!ret){ toast('Vehicle, client, planned pickup and return are required', 'error'); return; }
    if(!isReasonableDate(pickup)||!isReasonableDate(ret)){ toast('Please enter valid planned pickup and return dates', 'error'); return; }
    const bookingDate = document.getElementById('bk_date').value || toLocalISO(new Date());
    const deposit = parseFloat(document.getElementById('bk_deposit').value)||0;
    if(!isReasonableDate(bookingDate)){ toast('Booking date is invalid', 'error'); return; }
    if(!isValidMoney(deposit,{allowZero:true})){ toast('Deposit cannot be negative', 'error'); return; }
    if(new Date(ret) < new Date(pickup)){ toast('Planned return can\'t be before planned pickup', 'error'); return; }
    if(document.getElementById('bk_status').value !== 'Cancelled'){
      const conflicts = findVehicleConflicts(vid, pickup, ret, {excludeBookingId: editingBookingId});
      if(conflicts.length){
        const ok = await appConfirm('Overlapping dates', 'This vehicle already has overlapping dates:\n\n' + conflicts.join('\n') +
          '\n\nSave this booking anyway?', 'Save anyway');
        if(!ok) return;
      }
    }
    const fields = {
      vehicleId: vid, clientId: cid,
      bookedOn: bookingDate,
      pickup, return: ret,
      deposit,
      status: document.getElementById('bk_status').value
    };
    const finish = ()=>{
      const wasEditing = !!editingBookingId;
      if(editingBookingId){
        const bk = db.bookings.find(bk=>bk.id==editingBookingId);
        if(!bk){ editingBookingId = null; setEditMode('btnAddBooking', false); toast('That record no longer exists — it may have been deleted', 'error'); return; }
        if(fields.pickup !== bk.pickup) bk.reminderAck = false; // pickup date changed — reminder should fire again
        Object.assign(bk, fields);
        editingBookingId = null;
        setEditMode('btnAddBooking', false);
      } else {
        db.bookings.push({ id: uid(), reminderAck: false, ...fields });
      }
      ['bk_date','bk_pickup','bk_return','bk_deposit'].forEach(id=>document.getElementById(id).value='');
      markDirty(); renderBookings(); renderDashBookings();
      toast(wasEditing ? 'Booking updated' : 'Booking added', 'success');
    };
    if(editingBookingId){ checkAdminPin('save changes to this booking', finish); }
    else { finish(); }
  });
}
