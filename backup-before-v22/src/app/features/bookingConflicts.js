import { db } from '../core/state.js';

/* ---------- double-booking prevention ---------- */
/* Two date ranges (inclusive, 'YYYY-MM-DD' strings) overlap if each starts on/before
   the other's end. A booking/rental whose return date equals another's pickup date
   (same-day turnover) is flagged too, since the outgoing vehicle may come back late —
   the user can still confirm and save anyway. */
export function rangesOverlap(startA, endA, startB, endB){
  return startA <= endB && endA >= startB;
}
/* Checks a vehicle+date range against every other non-cancelled booking and rental
   for that vehicle. Pass excludeBookingId/excludeRentalId when editing an existing
   record so it doesn't conflict with itself. Returns a list of human-readable
   conflict descriptions (empty if the vehicle is free). */
export function findVehicleConflicts(vehicleId, pickup, ret, opts){
  opts = opts || {};
  const conflicts = [];
  db.bookings.forEach(bk=>{
    if(bk.vehicleId!=vehicleId || bk.status==='Cancelled') return;
    if(opts.excludeBookingId && bk.id==opts.excludeBookingId) return;
    if(rangesOverlap(pickup, ret, bk.pickup, bk.return)){
      const c = db.clients.find(c=>c.id==bk.clientId);
      conflicts.push(`Booking (${bk.status}) for ${c?c.name:'—'}: ${bk.pickup} → ${bk.return}`);
    }
  });
  db.rentals.forEach(r=>{
    if(r.vehicleId!=vehicleId || r.status==='Cancelled') return;
    if(opts.excludeRentalId && r.id==opts.excludeRentalId) return;
    if(rangesOverlap(pickup, ret, r.pickup, r.return)){
      const c = db.clients.find(c=>c.id==r.clientId);
      conflicts.push(`Rental (${r.status}) for ${c?c.name:'—'}: ${r.pickup} → ${r.return}`);
    }
  });
  return conflicts;
}
