import { guardClosedMonth, lockBadge, monthOfDate } from '../core/closedMonths.js';
import { fmt, escapeHTML } from '../core/format.js';
import { toLocalISO } from '../core/period.js';
import { db, markDirty, uid } from '../core/state.js';
import { isValidMoney } from '../core/validation.js';
import { monthDividerRow } from '../excel/dataSheets.js';
import { checkAdminPin } from './adminPin.js';
import { computePeriodRange, inRange } from '../reports/periodRange.js';
import { toast } from '../ui/dialogs.js';
import { clearFields, setEditMode } from '../ui/forms.js';
import { scrollToForm } from '../ui/recordNavigation.js';

/* ---------- driver allowances ---------- */

export let editingAllowanceId = null;
export function renderAllowances(){
  const tb = document.querySelector('#allowanceTable tbody'); tb.innerHTML='';
  if(!db.driverAllowances.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="5">No allowance payments logged yet.</td></tr>'; return; }
  let lastMonth = null;
  [...db.driverAllowances].sort((a,b)=> b.weekStart<a.weekStart?-1:(b.weekStart>a.weekStart?1:0)).forEach(a=>{
    const rowMonth = monthOfDate(a.weekStart);
    if(rowMonth !== lastMonth){ tb.appendChild(monthDividerRow(5, rowMonth)); lastMonth = rowMonth; }
    const d = db.drivers.find(d=>d.id==a.driverId);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(d?d.name:'—')}</td><td>${a.weekStart}${lockBadge(a.weekStart)}</td><td class="num">${fmt(a.amount)}</td>
      <td>${escapeHTML(a.note||'—')}</td><td><button class="row-edit" title="Edit" aria-label="Edit" data-id="${a.id}">✎</button><button class="row-del" title="Delete" aria-label="Delete" data-id="${a.id}">✕</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.row-edit').forEach(b=>b.addEventListener('click',()=>{
    const a = db.driverAllowances.find(a=>a.id==b.dataset.id); if(!a) return;
    guardClosedMonth(a.weekStart, 'edit this allowance payment', ()=>{
      checkAdminPin('edit this allowance payment', ()=>{
        editingAllowanceId = a.id;
        document.getElementById('al_driver').value = a.driverId;
        document.getElementById('al_week').value = a.weekStart;
        document.getElementById('al_amount').value = a.amount;
        document.getElementById('al_note').value = a.note||'';
        setEditMode('btnAddAllowance', true, ()=>{ editingAllowanceId = null; clearFields(['al_week','al_amount','al_note']); });
        scrollToForm('allowanceForm');
        toast('Editing allowance payment — update the fields and click Update allowance payment');
      });
    });
  }));
  tb.querySelectorAll('.row-del').forEach(b=>b.addEventListener('click',()=>{
    const a = db.driverAllowances.find(a=>a.id==b.dataset.id); if(!a) return;
    guardClosedMonth(a.weekStart, 'delete this allowance payment', ()=>{
      checkAdminPin('delete this allowance payment', ()=>{
        db.driverAllowances = db.driverAllowances.filter(x=>x.id!=a.id);
        markDirty(); renderAllowances(); renderAllowanceSummary();
        toast('Allowance payment deleted', 'success');
      });
    });
  }));
}
export let alPeriodType = 'monthly';
export function renderAllowanceSummary(){
  if(!document.getElementById('al_ref').value) document.getElementById('al_ref').value = toLocalISO(new Date());
  const {start,end} = computePeriodRange(alPeriodType,
    document.getElementById('al_ref').value,
    document.getElementById('al_start').value,
    document.getElementById('al_end').value);
  document.getElementById('alPeriodLabel').textContent = 'Showing: ' + start.toDateString() + '  →  ' + end.toDateString();
  const rows = db.driverAllowances.filter(a=>inRange(a.weekStart,start,end));
  const byDriver = {};
  rows.forEach(a=>{
    if(!byDriver[a.driverId]) byDriver[a.driverId] = {count:0, total:0};
    byDriver[a.driverId].count++; byDriver[a.driverId].total += a.amount;
  });
  const tb = document.querySelector('#allowanceSummaryTable tbody'); tb.innerHTML='';
  const ids = Object.keys(byDriver);
  if(!ids.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="3">No allowance payments in this period.</td></tr>'; return; }
  ids.sort((a,b)=>byDriver[b].total-byDriver[a].total).forEach(id=>{
    const d = db.drivers.find(d=>d.id==id);
    const s = byDriver[id];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(d?d.name:'—')}</td><td class="num">${s.count}</td><td class="num">${fmt(s.total)}</td>`;
    tb.appendChild(tr);
  });
}

export function initAllowances(){
  document.getElementById('al_driver').addEventListener('change', ()=>{
    const d = db.drivers.find(d=>d.id==document.getElementById('al_driver').value);
    if(d && !document.getElementById('al_amount').value) document.getElementById('al_amount').value = d.allowance || '';
  });
  document.getElementById('btnAddAllowance').addEventListener('click', ()=>{
    const driverId = document.getElementById('al_driver').value;
    const weekStart = document.getElementById('al_week').value;
    const amount = parseFloat(document.getElementById('al_amount').value)||0;
    if(!driverId||!weekStart||!amount){ toast('Driver, week starting and amount are required', 'error'); return; }
    if(!isValidMoney(amount)){ toast('Amount must be a positive number', 'error'); return; }
    const fields = { driverId, weekStart, amount, note: document.getElementById('al_note').value.trim() };
    const finish = ()=>{
      const wasEditing = !!editingAllowanceId;
      if(editingAllowanceId){
        const a = db.driverAllowances.find(a=>a.id==editingAllowanceId);
        if(!a){ editingAllowanceId = null; setEditMode('btnAddAllowance', false); toast('That record no longer exists — it may have been deleted', 'error'); return; }
        Object.assign(a, fields);
        editingAllowanceId = null;
        setEditMode('btnAddAllowance', false);
      } else {
        db.driverAllowances.push({ id: uid(), ...fields });
      }
      ['al_week','al_amount','al_note'].forEach(id=>document.getElementById(id).value='');
      markDirty(); renderAllowances(); renderAllowanceSummary();
      toast(wasEditing ? 'Allowance payment updated' : 'Allowance payment added', 'success');
    };
    if(editingAllowanceId){ checkAdminPin('save changes to this allowance payment', finish); }
    else { finish(); }
  });
  document.getElementById('alPeriodSeg').addEventListener('click', e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    document.querySelectorAll('#alPeriodSeg button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    alPeriodType = btn.dataset.p;
    document.getElementById('al_ref').style.display = alPeriodType==='custom' ? 'none' : 'inline-block';
    document.getElementById('alCustomRange').style.display = alPeriodType==='custom' ? 'inline-flex' : 'none';
    renderAllowanceSummary();
  });
  document.getElementById('al_ref').addEventListener('change', renderAllowanceSummary);
  document.getElementById('al_start').addEventListener('change', renderAllowanceSummary);
  document.getElementById('al_end').addEventListener('change', renderAllowanceSummary);
}
