import { guardClosedMonth, lockBadge, monthOfDate } from '../core/closedMonths.js';
import { fmt, escapeHTML } from '../core/format.js';
import { owedForRental, paidForRental, paymentStatus, paymentTotalExcluding } from '../core/paymentMath.js';
import { db, markDirty, uid } from '../core/state.js';
import { isReasonableDate, isValidMoney } from '../core/validation.js';
import { monthDividerRow } from '../excel/dataSheets.js';
import { checkAdminPin } from './adminPin.js';
import { renderRentals } from './rentals.js';
import { renderReports } from '../reports/reports.js';
import { toast } from '../ui/dialogs.js';
import { clearFields, setEditMode } from '../ui/forms.js';
import { scrollToForm } from '../ui/recordNavigation.js';

export let editingPaymentId = null;
/* ---------- payments ---------- */
export function populatePaymentRentals(){
  const sel = document.getElementById('p_rental');
  const current = sel.value;
  const candidates = [...db.rentals].filter(r=>r.status!=='Cancelled').sort((a,b)=>new Date(b.pickup)-new Date(a.pickup));
  sel.innerHTML = candidates.map(r=>{
    const v = db.vehicles.find(v=>v.id==r.vehicleId), c = db.clients.find(c=>c.id==r.clientId);
    const owed = owedForRental(r);
    const label = `${v?v.reg:'—'} — ${c?c.name:'—'}${r.contract?' ('+r.contract+')':''} — owed ${fmt(owed)}`;
    return `<option value="${r.id}">${label}</option>`;
  }).join('') || '<option value="">Add a rental first</option>';
  if(current) sel.value = current;
  updatePaymentFormHint();
}
export function updatePaymentFormHint(){
  const rid = document.getElementById('p_rental').value;
  const hint = document.getElementById('p_hint');
  const r = db.rentals.find(r=>r.id==rid);
  if(!r){ hint.textContent = ''; return; }
  hint.textContent = `Charged ${fmt(r.amount)} · paid so far ${fmt(paidForRental(r.id))} · owed ${fmt(owedForRental(r))}`;
}
export function renderPayments(){
  populatePaymentRentals();
  const tb = document.querySelector('#paymentTable tbody'); tb.innerHTML='';
  if(!db.payments.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="11">No payments logged yet.</td></tr>'; return; }
  let lastMonth = null;
  [...db.payments].sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(p=>{
    const rowMonth = monthOfDate(p.date);
    if(rowMonth !== lastMonth){ tb.appendChild(monthDividerRow(8, rowMonth)); lastMonth = rowMonth; }
    const r = db.rentals.find(r=>r.id==p.rentalId);
    const v = r ? db.vehicles.find(v=>v.id==r.vehicleId) : null;
    const c = r ? db.clients.find(c=>c.id==r.clientId) : null;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.date}${lockBadge(p.date)}</td><td>${escapeHTML(v?v.reg:'—')}</td><td>${escapeHTML(c?c.name:'—')}</td><td>${escapeHTML(r&&r.contract?r.contract:'—')}</td>
      <td class="num"><span class="green">+${fmt(p.amount)}</span></td><td class="num">${fmt(paidForRental(r.id))}</td><td class="num">${fmt(owedForRental(r))}</td>
      <td>${paymentStatus(r)}</td><td>${escapeHTML(p.method||'—')}</td><td>${escapeHTML(p.note||'—')}</td>
      <td><button class="row-edit" title="Edit" aria-label="Edit" data-id="${p.id}">✎</button><button class="row-del" title="Delete" aria-label="Delete" data-id="${p.id}">✕</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.row-edit').forEach(b=>b.addEventListener('click',()=>{
    const p = db.payments.find(p=>p.id==b.dataset.id); if(!p) return;
    guardClosedMonth(p.date, 'edit this payment', ()=>{
      checkAdminPin('edit this payment', ()=>{
        editingPaymentId = p.id;
        populatePaymentRentals();
        document.getElementById('p_rental').value = p.rentalId;
        document.getElementById('p_date').value = p.date;
        document.getElementById('p_amount').value = p.amount;
        document.getElementById('p_method').value = p.method || 'Cash';
        document.getElementById('p_note').value = p.note || '';
        updatePaymentFormHint();
        setEditMode('btnAddPayment', true, ()=>{ editingPaymentId = null; clearFields(['p_date','p_amount','p_note']); });
        scrollToForm('paymentForm');
        toast('Editing payment — update the fields and click Update payment');
      });
    });
  }));
  tb.querySelectorAll('.row-del').forEach(b=>b.addEventListener('click',()=>{
    const p = db.payments.find(p=>p.id==b.dataset.id); if(!p) return;
    guardClosedMonth(p.date, 'delete this payment', ()=>{
      checkAdminPin('delete this payment', ()=>{
        db.payments = db.payments.filter(x=>x.id!=p.id);
        markDirty(); renderPayments(); renderRentals(); renderReports();
        toast('Payment deleted', 'success');
      });
    });
  }));
}

export function initPayments(){
  document.getElementById('p_rental').addEventListener('change', updatePaymentFormHint);
  document.getElementById('btnAddPayment').addEventListener('click', ()=>{
    const rentalId = document.getElementById('p_rental').value;
    const date = document.getElementById('p_date').value;
    const amountRaw = document.getElementById('p_amount').value;
    const amount = parseFloat(amountRaw)||0;
    if(!rentalId){ toast('Select the rental this payment is for', 'error'); return; }
    if(!date||!amountRaw){ toast('Date and amount are required', 'error'); return; }
    if(!isReasonableDate(date)){ toast('That date doesn\'t look right — check it and try again', 'error'); return; }
    if(!isValidMoney(amount)){ toast('Payment amount must be a positive number', 'error'); return; }
    const rental = db.rentals.find(r=>r.id==rentalId);
    if(!rental){ toast('The selected rental could not be found', 'error'); return; }
    const alreadyPaid = paymentTotalExcluding(editingPaymentId, rentalId);
    const outstandingBefore = Math.max(0,(Number(rental.amount)||0)-alreadyPaid);
    if(amount > outstandingBefore){ toast(`Payment blocked: maximum allowed is ${fmt(outstandingBefore)} for this rental`, 'error'); return; }
    const fields = {
      rentalId, date, amount,
      method: document.getElementById('p_method').value,
      note: document.getElementById('p_note').value.trim()
    };
    const finish = ()=>{
      const wasEditing = !!editingPaymentId;
      if(editingPaymentId){
        const p = db.payments.find(p=>p.id==editingPaymentId);
        if(!p){ editingPaymentId = null; setEditMode('btnAddPayment', false); toast('That record no longer exists — it may have been deleted', 'error'); return; }
        Object.assign(p, fields);
        editingPaymentId = null;
        setEditMode('btnAddPayment', false);
      } else {
        db.payments.push({ id: uid(), ...fields });
      }
      ['p_date','p_amount','p_note'].forEach(id=>document.getElementById(id).value='');
      markDirty(); renderPayments(); renderRentals(); renderReports();
      toast(wasEditing ? 'Payment updated' : 'Payment added', 'success');
    };
    if(editingPaymentId){ checkAdminPin('save changes to this payment', finish); }
    else { finish(); }
  });
}
