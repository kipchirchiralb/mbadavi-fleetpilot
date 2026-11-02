import { guardClosedMonth, lockBadge, monthOfDate } from '../core/closedMonths.js';
import { fmt, escapeHTML } from '../core/format.js';
import { db, markDirty, uid } from '../core/state.js';
import { isReasonableDate, isValidMoney } from '../core/validation.js';
import { renderDashboard } from '../dashboard/cards.js';
import { monthDividerRow } from '../excel/dataSheets.js';
import { checkAdminPin } from './adminPin.js';
import { toast } from '../ui/dialogs.js';
import { clearFields, setEditMode } from '../ui/forms.js';
import { scrollToForm } from '../ui/recordNavigation.js';

export let editingExpenseId = null;
/* ---------- expenses ---------- */
export function syncBillableRow(){
  const isFuel = document.getElementById('e_cat').value === 'Fuel';
  document.getElementById('e_billable_row').style.display = isFuel ? '' : 'none';
  if(!isFuel){
    document.getElementById('e_billable').checked = false;
  }
  toggleBillableFields();
}
export function toggleBillableFields(){
  const on = document.getElementById('e_cat').value === 'Fuel' && document.getElementById('e_billable').checked;
  document.getElementById('e_billable_fields').style.display = on ? '' : 'none';
}
export function billedCell(x){
  if(!x.billable) return '<span style="color:var(--ink-faint);">—</span>';
  const c = db.clients.find(c=>c.id==x.billClientId);
  return `<span class="tag Confirmed" title="Office spent ${fmt(x.amount)}">${escapeHTML(c?c.name:'Client')} · ${fmt(x.chargeAmount||0)}</span>`;
}
export function renderExpenses(){
  const tb = document.querySelector('#expenseTable tbody'); tb.innerHTML='';
  const scopeFilter = document.getElementById('e_scope_filter').value;
  let visible = db.expenses;
  if(scopeFilter==='vehicle') visible = visible.filter(x=>x.vehicleId);
  if(scopeFilter==='office') visible = visible.filter(x=>!x.vehicleId);
  if(!visible.length){
    tb.innerHTML = '<tr class="empty-row"><td colspan="8">'+(db.expenses.length ? 'No expenses match this filter.' : 'No expenses logged yet.')+'</td></tr>';
    return;
  }
  let lastMonth = null;
  [...visible].sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(x=>{
    const rowMonth = monthOfDate(x.date);
    if(rowMonth !== lastMonth){ tb.appendChild(monthDividerRow(8, rowMonth)); lastMonth = rowMonth; }
    const v = db.vehicles.find(v=>v.id==x.vehicleId);
    const tr = document.createElement('tr');
    const actions = x.source==='rental'
      ? `<span class="tag" style="color:var(--ink-faint);" title="Linked to a rental — edit the Fuel amount on that rental instead">via rental</span>`
      : `<button class="row-edit" title="Edit" aria-label="Edit" data-id="${x.id}">✎</button><button class="row-del" title="Delete" aria-label="Delete" data-id="${x.id}">✕</button>`;
    const vehicleCell = v ? v.reg : '<span class="tag" style="color:var(--ink-dim);border-color:var(--line);">Office</span>';
    tr.innerHTML = `<td>${vehicleCell}</td><td>${x.date}${lockBadge(x.date)}</td><td>${escapeHTML(x.category)}</td><td>${escapeHTML(x.desc||'—')}</td>
      <td class="num">${x.qty||1}</td><td class="num">${fmt(x.amount)}</td>
      <td>${billedCell(x)}</td>
      <td>${actions}</td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.row-edit').forEach(b=>b.addEventListener('click',()=>{
    const x = db.expenses.find(x=>x.id==b.dataset.id); if(!x) return;
    guardClosedMonth(x.date, 'edit this expense', ()=>{
      checkAdminPin('edit this expense', ()=>{
        editingExpenseId = x.id;
        document.getElementById('e_vehicle').value = x.vehicleId;
        document.getElementById('e_date').value = x.date;
        document.getElementById('e_cat').value = x.category;
        document.getElementById('e_desc').value = x.desc||'';
        document.getElementById('e_qty').value = x.qty||1;
        document.getElementById('e_amount').value = x.amount;
        syncBillableRow();
        document.getElementById('e_billable').checked = !!x.billable;
        document.getElementById('e_billable_client').value = x.billClientId || '';
        document.getElementById('e_billable_amount').value = x.chargeAmount || '';
        toggleBillableFields();
        setEditMode('btnAddExpense', true, ()=>{ editingExpenseId = null; clearFields(['e_date','e_desc','e_amount','e_billable_amount']); });
        scrollToForm('expenseForm');
        toast('Editing expense — update the fields and click Update expense');
      });
    });
  }));
  tb.querySelectorAll('.row-del').forEach(b=>b.addEventListener('click',()=>{
    const x = db.expenses.find(x=>x.id==b.dataset.id); if(!x) return;
    guardClosedMonth(x.date, 'delete this expense', ()=>{
      checkAdminPin('delete this expense', ()=>{
        db.expenses = db.expenses.filter(e=>e.id!=x.id);
        markDirty(); renderExpenses(); renderDashboard();
        toast('Expense deleted', 'success');
      });
    });
  }));
}

export function initExpenses(){
  document.getElementById('e_cat').addEventListener('change', syncBillableRow);
  document.getElementById('e_billable').addEventListener('change', toggleBillableFields);
  syncBillableRow();
  document.getElementById('btnAddExpense').addEventListener('click', ()=>{
    const vid = document.getElementById('e_vehicle').value, date = document.getElementById('e_date').value;
    const amountRaw = document.getElementById('e_amount').value;
    const amount = parseFloat(amountRaw)||0;
    if(!date||!amountRaw){ toast('Date and amount are required', 'error'); return; }
    if(!isReasonableDate(date)){ toast('That date doesn\'t look right — check it and try again', 'error'); return; }
    if(!isValidMoney(amount)){ toast('Amount must be a positive number', 'error'); return; }
    const category = document.getElementById('e_cat').value;
    const billable = category === 'Fuel' && document.getElementById('e_billable').checked;
    let billClientId = null, chargeAmount = 0;
    if(billable){
      billClientId = document.getElementById('e_billable_client').value;
      chargeAmount = parseFloat(document.getElementById('e_billable_amount').value)||0;
      if(!billClientId){ toast('Select a client to bill this fuel to', 'error'); return; }
      if(!isValidMoney(chargeAmount, {allowZero:true})){ toast('Amount to charge client must be zero or a positive number', 'error'); return; }
    }
    const fields = {
      vehicleId: vid, date, category,
      desc: document.getElementById('e_desc').value.trim(),
      qty: parseFloat(document.getElementById('e_qty').value)||1,
      amount, billable, billClientId, chargeAmount, source: 'manual', rentalId: null
    };
    const finish = ()=>{
      const wasEditing = !!editingExpenseId;
      if(editingExpenseId){
        const x = db.expenses.find(x=>x.id==editingExpenseId);
        if(!x){ editingExpenseId = null; setEditMode('btnAddExpense', false); toast('That record no longer exists — it may have been deleted', 'error'); return; }
        Object.assign(x, fields);
        editingExpenseId = null;
        setEditMode('btnAddExpense', false);
      } else {
        db.expenses.push({ id: uid(), ...fields });
      }
      ['e_date','e_desc','e_amount','e_billable_amount'].forEach(id=>document.getElementById(id).value='');
      document.getElementById('e_qty').value = 1;
      document.getElementById('e_billable').checked = false;
      toggleBillableFields();
      markDirty(); renderExpenses(); renderDashboard();
      toast(wasEditing ? 'Expense updated' : 'Expense added', 'success');
    };
    if(editingExpenseId){ checkAdminPin('save changes to this expense', finish); }
    else { finish(); }
  });
  document.getElementById('e_scope_filter').addEventListener('change', renderExpenses);
}
