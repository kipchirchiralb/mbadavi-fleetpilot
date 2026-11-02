import { fmt, escapeHTML } from '../core/format.js';
import { db } from '../core/state.js';

/* ---------- leased cars report ---------- */
export function renderLeasedCars(){
  const tb = document.querySelector('#repLeasedTable tbody'); tb.innerHTML='';
  const active = db.rentals.filter(r=>r.status==='Active');
  if(!active.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="7">No vehicles currently leased out.</td></tr>'; return; }
  active.forEach(r=>{
    const v = db.vehicles.find(v=>v.id==r.vehicleId), c = db.clients.find(c=>c.id==r.clientId);
    const pickupCell = r.pickup + (r.pickupTime?(' '+r.pickupTime):'');
    const dueBack = r.return + (r.returnTime?(' '+r.returnTime):'');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(v?v.reg:'—')}</td><td>${escapeHTML(v?v.make+' '+v.model:'—')}</td><td>${escapeHTML(c?c.name:'—')}</td>
      <td>${escapeHTML(r.contract||'—')}</td><td>${pickupCell}</td><td>${dueBack}</td><td class="num">${fmt(r.rate)}</td>`;
    tb.appendChild(tr);
  });
}
