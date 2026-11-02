import { db } from './state.js';

/* ---------- payments (own table — money actually received against a rental) ---------- */
export function paidForRental(rentalId){
  return db.payments.filter(p=>p.rentalId==rentalId).reduce((s,p)=>s+(Number(p.amount)||0),0);
}
export function owedForRental(rental){
  return Math.max(0, (Number(rental.amount)||0) - paidForRental(rental.id));
}
export function paymentStatus(rental){
  if(!rental) return '<span class="status-unpaid">Unpaid</span>';
  const amount = Number(rental.amount)||0, owed = owedForRental(rental), paid = paidForRental(rental.id);
  if(paid<=0) return '<span class="status-unpaid">Unpaid</span>';
  if(owed<=0) return '<span class="status-paid">Paid</span>';
  return '<span class="status-partial">Partially Paid</span>';
}
export function paymentTotalExcluding(paymentId,rentalId){
  return db.payments.filter(p=>p.rentalId==rentalId && p.id!=paymentId).reduce((s,p)=>s+(Number(p.amount)||0),0);
}
