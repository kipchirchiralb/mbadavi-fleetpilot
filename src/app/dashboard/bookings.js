import { escapeHTML } from '../core/format.js';
import { db } from '../core/state.js';

/* ---------- dashboard: available (not-yet-cancelled) bookings ---------- */
export function renderDashBookings(){
  const tb = document.querySelector('#dashBookingsTable tbody'); tb.innerHTML='';
  const available = db.bookings.filter(bk=>bk.status!=='Cancelled');
  if(!available.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="6">No available bookings right now.</td></tr>'; return; }
  available.forEach(bk=>{
    const v = db.vehicles.find(v=>v.id==bk.vehicleId), c = db.clients.find(c=>c.id==bk.clientId);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(v?v.reg+' — '+v.make+' '+v.model:'—')}</td><td>${escapeHTML(c?c.name:'—')}</td>
      <td>${bk.bookedOn||'—'}</td><td>${bk.pickup||'—'}</td><td>${bk.return||'—'}</td>
      <td><span class="tag ${bk.status}">${bk.status}</span></td>`;
    tb.appendChild(tr);
  });
}
