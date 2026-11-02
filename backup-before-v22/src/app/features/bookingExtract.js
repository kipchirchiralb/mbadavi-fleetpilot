import { escapeHTML, fmt } from '../core/format.js';
import { db } from '../core/state.js';
import { setEditingRentalId } from './rentals.js';
import { setEditMode } from '../ui/forms.js';
import { scrollToForm } from '../ui/recordNavigation.js';
import { refreshRentalVehicleSelect } from '../ui/selects.js';

/* ---------- extract booking → rental ----------
   Pulls the fields a booking already has (vehicle, client, planned dates, deposit)
   into the rental form, leaves everything the office still needs to key in
   (contract/invoice/receipt numbers, times, mileage, fuel) blank for the admin,
   and remembers the source booking's deposit so it's applied as a payment —
   reducing the balance owed — the moment the rental is actually saved. */
export let pendingExtractedBooking = null;
export function selectRentalVehicle(vehicleId){
  const sel = document.getElementById('r_vehicle');
  const opt = sel.querySelector(`option[value="${vehicleId}"]`);
  if(opt) opt.disabled = false; // this booking already reserves the vehicle for these dates
  sel.value = vehicleId;
  sel.dispatchEvent(new Event('change')); // triggers the existing listener that fills the daily rate
}
export function extractBookingToRental(bk){
  const v = db.vehicles.find(v=>v.id==bk.vehicleId);
  const c = db.clients.find(c=>c.id==bk.clientId);
  document.querySelector('.nav button[data-panel="rentals"]')?.click();
  setEditingRentalId(null);
  setEditMode('btnAddRental', false);
  refreshRentalVehicleSelect();
  ['r_contract','r_invoice','r_receipt','r_pickuptime','r_returntime','r_mileage','r_fuel','r_fuel_charge']
    .forEach(id=>document.getElementById(id).value='');
  document.getElementById('r_client').value = bk.clientId;
  document.getElementById('r_pickup').value = bk.pickup;
  document.getElementById('r_return').value = bk.return;
  document.getElementById('r_status').value = 'Active';
  selectRentalVehicle(bk.vehicleId);
  const deposit = Number(bk.deposit)||0;
  pendingExtractedBooking = { bookingId: bk.id, vehicleId: bk.vehicleId, clientId: bk.clientId, deposit };
  const hint = document.getElementById('extractDepositHint');
  if(hint){
    hint.style.display = deposit>0 ? '' : 'none';
    hint.textContent = deposit>0
      ? `Deposit of ${fmt(deposit)} from this booking will be deducted automatically and the balance shown as owed once you save this rental.`
      : '';
  }
  scrollToForm('rentalForm');
  showExtractNotice(bk, v, c, deposit);
}
export function showExtractNotice(bk, v, c, deposit){
  const body = document.getElementById('extractNoticeBody'); if(!body) return;
  body.innerHTML = `
    <p>Vehicle, client and dates have been filled in from the booking for <b>${escapeHTML(v?v.reg:'—')}</b> — <b>${escapeHTML(c?c.name:'—')}</b>.</p>
    <p>Fill in the Contract No, Invoice No, Receipt No, pickup/return times and mileage, and double-check the daily rate before saving.</p>
    <p>🛢️ Don't forget: if the office fronted fuel for this pickup, add it in the Fuel field below so it's tracked and billed to the client correctly.</p>
    ${deposit>0?`<p>💰 A deposit of <b>${fmt(deposit)}</b> was recorded on this booking — it'll be applied automatically as a payment when you save, and the remaining balance will show as owed on the rental.</p>`:''}
  `;
  const ov = document.getElementById('extractNoticeOverlay');
  ov.classList.add('show'); ov.setAttribute('aria-hidden','false');
}
export function closeExtractNotice(){
  const ov = document.getElementById('extractNoticeOverlay');
  ov.classList.remove('show'); ov.setAttribute('aria-hidden','true');
}
export function setPendingExtractedBooking(value){ pendingExtractedBooking = value; }
