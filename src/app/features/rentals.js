import { guardClosedMonth, lockBadge, monthOfDate } from '../core/closedMonths.js';
import { fmt, escapeHTML } from '../core/format.js';
import { owedForRental, paidForRental, paymentStatus } from '../core/paymentMath.js';
import { db, markDirty, uid } from '../core/state.js';
import { isReasonableDate, isValidMoney } from '../core/validation.js';
import { renderDashboard } from '../dashboard/cards.js';
import { monthDividerRow } from '../excel/dataSheets.js';
import { checkAdminPin } from './adminPin.js';
import { findVehicleConflicts } from './bookingConflicts.js';
import { pendingExtractedBooking, setPendingExtractedBooking } from './bookingExtract.js';
import { renderBookings } from './bookings.js';
import { renderExpenses } from './expenses.js';
import { renderPayments } from './payments.js';
import { renderVehicles } from './vehicles.js';
import { appConfirm, toast } from '../ui/dialogs.js';
import { clearFields, setEditMode } from '../ui/forms.js';
import { scrollToForm } from '../ui/recordNavigation.js';
import { fillRentalRateFromVehicle, refreshRentalVehicleSelect } from '../ui/selects.js';

export let editingRentalId = null;
/* ---------- rentals ---------- */
export function daysBetween(a,b){
  const d1=new Date(a), d2=new Date(b);
  const diff = Math.round((d2-d1)/(1000*60*60*24));
  return Math.max(diff,1);
}
/* Keep a rental's fronted fuel in sync with a linked, billable Fuel expense —
   charged to client in full, tagged so reports can tell it apart from manually logged fuel. */
export function syncRentalFuelExpense(rental){
  const existing = db.expenses.find(x=>x.source==='rental' && x.rentalId==rental.id);
  const amt = Number(rental.fuel)||0;
  const chargeAmt = rental.fuelCharge!=null ? Number(rental.fuelCharge)||0 : amt;
  if(amt > 0){
    const data = {
      vehicleId: rental.vehicleId, date: rental.pickup, category: 'Fuel',
      desc: 'Fuel — rental' + (rental.contract ? ' ' + rental.contract : ''),
      qty: 1, amount: amt,
      billable: true, billClientId: rental.clientId, chargeAmount: chargeAmt,
      source: 'rental', rentalId: rental.id
    };
    if(existing){ Object.assign(existing, data); }
    else { db.expenses.push({ id: uid(), ...data }); }
  } else if(existing){
    db.expenses = db.expenses.filter(x=>x.id!==existing.id);
  }
}
export function renderRentals(){
  const tb = document.querySelector('#rentalTable tbody'); tb.innerHTML='';
  if(!db.rentals.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="17">No rentals recorded yet.</td></tr>'; return; }
  let lastMonth = null;
  [...db.rentals].sort((a,b)=>new Date(b.pickup)-new Date(a.pickup)).forEach(r=>{
    const rowMonth = monthOfDate(r.pickup);
    if(rowMonth !== lastMonth){ tb.appendChild(monthDividerRow(17, rowMonth)); lastMonth = rowMonth; }
    const v = db.vehicles.find(v=>v.id==r.vehicleId), c = db.clients.find(c=>c.id==r.clientId);
    const pickupCell = r.pickup + (r.pickupTime?(' '+r.pickupTime):'');
    const returnCell = r.return + (r.returnTime?(' '+r.returnTime):'');
    const paid = paidForRental(r.id), owed = owedForRental(r);
    const cancelled = r.status === 'Cancelled';
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;
    if(cancelled) tr.classList.add('rental-cancelled');
    tr.innerHTML = `<td>${escapeHTML(v?v.reg:'—')}</td><td>${escapeHTML(c?c.name:'—')}</td>
      <td>${escapeHTML(r.contract||'—')}</td><td>${escapeHTML(r.invoice||'—')}</td><td>${escapeHTML(r.receipt||'—')}</td>
      <td>${pickupCell}${lockBadge(r.pickup)}</td><td>${returnCell}</td>
      <td class="num">${r.days}</td><td class="num">${r.mileage ? r.mileage.toLocaleString() : '—'}</td>
      <td class="num" style="color:${cancelled?'var(--red)':'inherit'};" title="${cancelled?'Cancelled — not counted in totals':''}">${fmt(r.amount)}</td>
      <td class="num" style="color:${cancelled?'var(--red)':'var(--green)'};">${paid ? fmt(paid) : '—'}</td>
      <td class="num" style="color:${cancelled?'var(--red)':(owed>0?'var(--red)':'var(--ink-faint)')};">${owed ? fmt(owed) : '—'}</td><td>${cancelled ? '<span class="status-unpaid">Cancelled</span>' : paymentStatus(r)}</td>
      <td class="num" style="color:${cancelled&&r.fuel?'var(--red)':'inherit'};">${r.fuel ? fmt(r.fuel) : '—'}</td>
      <td class="num" style="color:${cancelled&&r.fuel?'var(--red)':'inherit'};" title="${r.fuel && r.fuelCharge!==r.fuel ? 'Office-set amount, differs from fronted' : ''}">${r.fuel ? fmt(r.fuelCharge!=null?r.fuelCharge:r.fuel) : '—'}</td>
      <td><span class="tag ${r.status}">${r.status}</span></td>
      <td>${r.status==='Active'?`<button class="row-action" data-id="${r.id}">Check-in</button>`:''}<button class="row-edit" title="Edit" aria-label="Edit" data-id="${r.id}">✎</button><button class="row-del" title="Delete" aria-label="Delete" data-id="${r.id}">✕</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.row-action').forEach(b=>b.addEventListener('click',()=>{
    const r = db.rentals.find(r=>r.id==b.dataset.id);
    if(!r) return;
    guardClosedMonth(r.pickup, 'check in this rental', ()=>{
      r.status = 'Completed';
      const v = db.vehicles.find(v=>v.id==r.vehicleId);
      if(v) v.status = 'Available';
      markDirty(); renderRentals(); renderVehicles(); renderDashboard();
      toast('Vehicle checked in and marked Available', 'success');
    });
  }));
  tb.querySelectorAll('.row-edit').forEach(b=>b.addEventListener('click',()=>{
    const r = db.rentals.find(r=>r.id==b.dataset.id); if(!r) return;
    guardClosedMonth(r.pickup, 'edit this rental', ()=>{
      checkAdminPin('edit this rental', ()=>{
        editingRentalId = r.id;
        refreshRentalVehicleSelect();
        document.getElementById('r_vehicle').value = r.vehicleId;
        document.getElementById('r_client').value = r.clientId;
        document.getElementById('r_contract').value = r.contract||'';
        document.getElementById('r_invoice').value = r.invoice||'';
        document.getElementById('r_receipt').value = r.receipt||'';
        document.getElementById('r_pickup').value = r.pickup;
        document.getElementById('r_pickuptime').value = r.pickupTime||'';
        document.getElementById('r_return').value = r.return;
        document.getElementById('r_returntime').value = r.returnTime||'';
        document.getElementById('r_rate').value = r.rate;
        document.getElementById('r_mileage').value = r.mileage||'';
        document.getElementById('r_fuel').value = r.fuel||'';
        document.getElementById('r_fuel_charge').value = (r.fuelCharge!=null && r.fuelCharge!==r.fuel) ? r.fuelCharge : '';
        document.getElementById('r_status').value = r.status;
        setEditMode('btnAddRental', true, ()=>{ editingRentalId = null; clearFields(['r_contract','r_invoice','r_receipt','r_pickup','r_pickuptime','r_return','r_returntime','r_rate','r_mileage','r_fuel','r_fuel_charge']); fillRentalRateFromVehicle(); });
        scrollToForm('rentalForm');
        toast('Editing rental — update the fields and click Update rental');
      });
    });
  }));
  tb.querySelectorAll('.row-del').forEach(b=>b.addEventListener('click',()=>{
    const r = db.rentals.find(r=>r.id==b.dataset.id); if(!r) return;
    guardClosedMonth(r.pickup, 'delete this rental', ()=>{
      checkAdminPin('delete this rental', ()=>{
        db.rentals = db.rentals.filter(x=>x.id!=r.id);
        db.expenses = db.expenses.filter(x=>!(x.source==='rental' && x.rentalId==r.id));
        db.payments = db.payments.filter(p=>p.rentalId!=r.id);
        markDirty(); renderRentals(); renderExpenses(); renderPayments(); renderDashboard();
        toast('Rental deleted', 'success');
      });
    });
  }));
}
export function setEditingRentalId(value){ editingRentalId = value; }

export function initRentals(){
  document.getElementById('btnAddRental').addEventListener('click', async ()=>{
    const vid = document.getElementById('r_vehicle').value, cid = document.getElementById('r_client').value;
    const pickup = document.getElementById('r_pickup').value, ret = document.getElementById('r_return').value;
    const pickupTime = document.getElementById('r_pickuptime').value, returnTime = document.getElementById('r_returntime').value;
    if(!vid||!cid||!pickup||!ret){ toast('Vehicle, client, pickup and return dates are required', 'error'); return; }
    if(!isReasonableDate(pickup)||!isReasonableDate(ret)){ toast('Please enter valid pickup and return dates', 'error'); return; }
    if(new Date(ret) < new Date(pickup)){ toast('Return date can\'t be before pickup date', 'error'); return; }
    if(pickup===ret && returnTime && pickupTime && returnTime < pickupTime){ toast('Return time can\'t be before pickup time on the same day', 'error'); return; }
    if(document.getElementById('r_status').value !== 'Cancelled'){
      const conflicts = findVehicleConflicts(vid, pickup, ret, {excludeRentalId: editingRentalId});
      if(conflicts.length){
        const ok = await appConfirm('Overlapping dates', 'This vehicle already has overlapping dates:\n\n' + conflicts.join('\n') +
          '\n\nSave this rental anyway?', 'Save anyway');
        if(!ok) return;
      }
    }
    const rate = parseFloat(document.getElementById('r_rate').value)||0;
    const days = daysBetween(pickup,ret);
    const status = document.getElementById('r_status').value;
    const fuel = parseFloat(document.getElementById('r_fuel').value)||0;
    const fuelChargeRaw = document.getElementById('r_fuel_charge').value;
    const fuelCharge = fuelChargeRaw==='' ? fuel : (parseFloat(fuelChargeRaw)||0);
    const mileage = parseFloat(document.getElementById('r_mileage').value)||0;
    if(!isValidMoney(rate)){ toast('Daily rate must be a positive number', 'error'); return; }
    if(!isValidMoney(fuel, {allowZero:true}) || !isValidMoney(fuelCharge, {allowZero:true})){ toast('Fuel amounts can\'t be negative', 'error'); return; }
    if(mileage < 0){ toast('Mileage can\'t be negative', 'error'); return; }
    const fields = {
      vehicleId: vid, clientId: cid,
      contract: document.getElementById('r_contract').value.trim(),
      invoice: document.getElementById('r_invoice').value.trim(),
      receipt: document.getElementById('r_receipt').value.trim(),
      pickup, pickupTime, return: ret, returnTime,
      rate, days, mileage, amount: rate*days, status, fuel, fuelCharge
    };
    const finish = ()=>{
      const wasEditing = !!editingRentalId;
      let rental;
      if(editingRentalId){
        rental = db.rentals.find(r=>r.id==editingRentalId);
        if(!rental){ editingRentalId = null; setEditMode('btnAddRental', false); toast('That record no longer exists — it may have been deleted', 'error'); return; }
        Object.assign(rental, fields);
        editingRentalId = null;
        setEditMode('btnAddRental', false);
      } else {
        rental = { id: uid(), ...fields };
        db.rentals.push(rental);
        if(pendingExtractedBooking && pendingExtractedBooking.vehicleId==vid && pendingExtractedBooking.clientId==cid){
          if(pendingExtractedBooking.deposit>0){
            db.payments.push({ id: uid(), rentalId: rental.id, date: pickup, amount: pendingExtractedBooking.deposit,
              method: 'Deposit', note: 'Deposit carried over from booking' });
          }
          const srcBk = db.bookings.find(x=>x.id==pendingExtractedBooking.bookingId);
          if(srcBk) srcBk.status = 'Confirmed';
        }
      }
      if(pendingExtractedBooking){
        setPendingExtractedBooking(null);
        const hint = document.getElementById('extractDepositHint');
        if(hint){ hint.style.display='none'; hint.textContent=''; }
      }
      const v = db.vehicles.find(v=>v.id==vid);
      if(v && status==='Active') v.status = 'Rented';
      syncRentalFuelExpense(rental);
      ['r_contract','r_invoice','r_receipt','r_pickup','r_pickuptime','r_return','r_returntime','r_rate','r_mileage','r_fuel','r_fuel_charge'].forEach(id=>document.getElementById(id).value='');
      markDirty(); renderRentals(); renderVehicles(); renderDashboard(); renderExpenses(); renderPayments(); renderBookings();
      toast(wasEditing ? 'Rental updated' : 'Rental added', 'success');
    };
    if(editingRentalId){ checkAdminPin('save changes to this rental', finish); }
    else { finish(); }
  });
}
