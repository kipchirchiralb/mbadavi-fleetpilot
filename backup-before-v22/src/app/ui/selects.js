import { escapeHTML } from '../core/format.js';
import { db } from '../core/state.js';
import { editingRentalId } from '../features/rentals.js';
import { renderVehicleStatement } from '../reports/vehicleStatement.js';

/* ---------- shared selects ---------- */
/* Rentals vehicle dropdown shows each vehicle's current status and blocks picking
   one that's already Rented or in Maintenance — the one exception being the vehicle
   already tied to the rental currently being edited, which is only "Rented" because
   of this very record. */
export function buildRentalVehicleOptions(){
  const exceptId = editingRentalId ? (db.rentals.find(r=>r.id==editingRentalId)||{}).vehicleId : null;
  return db.vehicles.map(v=>{
    const status = v.status||'Available';
    const blocked = (status==='Rented' || status==='Maintenance') && v.id!=exceptId;
    return `<option value="${v.id}" ${blocked?'disabled':''}>${escapeHTML(v.reg)} — ${escapeHTML(v.make)} ${escapeHTML(v.model)} · ${status}</option>`;
  }).join('');
}
export function refreshRentalVehicleSelect(){
  const sel = document.getElementById('r_vehicle'); if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = buildRentalVehicleOptions() || '<option value="">Add a vehicle first</option>';
  if(prev) sel.value = prev;
  fillRentalRateFromVehicle();
}
/* The daily rate follows the selected vehicle. A 'change' event alone missed the
   vehicle that's preselected when the form first shows (or after a save), which
   left the rate blank. force=true overwrites a typed rate (vehicle was changed);
   otherwise it only fills an empty rate and never touches a rental being edited. */
export function fillRentalRateFromVehicle(force){
  const rateEl = document.getElementById('r_rate'); if(!rateEl) return;
  if(!force && (editingRentalId || rateEl.value)) return;
  const v = db.vehicles.find(v=>v.id==document.getElementById('r_vehicle').value);
  rateEl.value = v ? (v.rate||'') : '';
}
export function renderSelects(){
  const vOpts = db.vehicles.map(v=>`<option value="${v.id}">${escapeHTML(v.reg)} — ${escapeHTML(v.make)} ${escapeHTML(v.model)}</option>`).join('');
  const cOpts = db.clients.map(c=>`<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
  refreshRentalVehicleSelect();
  document.getElementById('e_vehicle').innerHTML = '<option value="">— Office / General (not vehicle-specific) —</option>' + vOpts;
  document.getElementById('bk_vehicle').innerHTML = vOpts || '<option value="">Add a vehicle first</option>';
  document.getElementById('d_vehicle').innerHTML = '<option value="">Unassigned</option>' + vOpts;
  const dOpts = db.drivers.map(d=>`<option value="${d.id}">${escapeHTML(d.name)}</option>`).join('');
  document.getElementById('al_driver').innerHTML = dOpts || '<option value="">Add a driver first</option>';
  document.getElementById('r_client').innerHTML = cOpts || '<option value="">Add a client first</option>';
  document.getElementById('bk_client').innerHTML = cOpts || '<option value="">Add a client first</option>';
  document.getElementById('e_billable_client').innerHTML = cOpts || '<option value="">Add a client first</option>';
  const repPick = document.getElementById('rep_vehicle_pick');
  const prevPick = repPick.value;
  repPick.innerHTML = '<option value="">Select a vehicle…</option>' + vOpts;
  if(prevPick) repPick.value = prevPick;
}

export function initSelects(){
  document.getElementById('r_vehicle').addEventListener('change', ()=>{
    fillRentalRateFromVehicle(true);
  });
  document.getElementById('rep_vehicle_pick').addEventListener('change', renderVehicleStatement);
}
