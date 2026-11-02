import { fmt, escapeHTML } from '../core/format.js';
import { db, markDirty, uid } from '../core/state.js';
import { isValidMoney } from '../core/validation.js';
import { checkAdminPin } from './adminPin.js';
import { renderAllowanceSummary, renderAllowances } from './allowances.js';
import { toast } from '../ui/dialogs.js';
import { clearFields, setEditMode } from '../ui/forms.js';
import { scrollToForm } from '../ui/recordNavigation.js';
import { renderSelects } from '../ui/selects.js';

/* ---------- drivers ---------- */

export let editingDriverId = null;
export function renderDrivers(){
  const tb = document.querySelector('#driverTable tbody'); tb.innerHTML='';
  if(!db.drivers.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="7">No drivers yet.</td></tr>'; return; }
  db.drivers.forEach(d=>{
    const v = db.vehicles.find(v=>v.id==d.vehicleId);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(d.name)}</td><td>${escapeHTML(d.phone||'—')}</td><td>${escapeHTML(d.license||'—')}</td>
      <td>${escapeHTML(v?v.reg:'—')}</td><td class="num">${fmt(d.allowance)}</td>
      <td><span class="tag ${d.status}">${d.status}</span></td>
      <td><button class="row-edit" title="Edit" aria-label="Edit" data-id="${d.id}">✎</button><button class="row-del" title="Delete" aria-label="Delete" data-id="${d.id}">✕</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.row-edit').forEach(b=>b.addEventListener('click',()=>{
    const d = db.drivers.find(d=>d.id==b.dataset.id); if(!d) return;
    checkAdminPin('edit this driver', ()=>{
      editingDriverId = d.id;
      document.getElementById('d_name').value = d.name;
      document.getElementById('d_phone').value = d.phone||'';
      document.getElementById('d_license').value = d.license||'';
      document.getElementById('d_vehicle').value = d.vehicleId||'';
      document.getElementById('d_allowance').value = d.allowance||'';
      document.getElementById('d_status').value = d.status||'Active';
      setEditMode('btnAddDriver', true, ()=>{ editingDriverId = null; clearFields(['d_name','d_phone','d_license','d_allowance']); });
      scrollToForm('driverForm');
      toast('Editing ' + d.name + ' — update the fields and click Update driver');
    });
  }));
  tb.querySelectorAll('.row-del').forEach(b=>b.addEventListener('click',()=>{
    checkAdminPin('delete this driver', ()=>{
      db.drivers = db.drivers.filter(d=>d.id!=b.dataset.id);
      markDirty(); renderDrivers(); renderSelects();
      toast('Driver deleted', 'success');
    });
  }));
}

export function initDrivers(){
  document.getElementById('btnAddDriver').addEventListener('click', ()=>{
    const name = document.getElementById('d_name').value.trim();
    if(!name){ toast('Driver name is required', 'error'); return; }
    const allowance = parseFloat(document.getElementById('d_allowance').value)||0;
    if(!isValidMoney(allowance, {allowZero:true})){ toast('Allowance can\'t be negative', 'error'); return; }
    const fields = {
      name,
      phone: document.getElementById('d_phone').value.trim(),
      license: document.getElementById('d_license').value.trim(),
      vehicleId: document.getElementById('d_vehicle').value,
      allowance,
      status: document.getElementById('d_status').value
    };
    const finish = ()=>{
      const wasEditing = !!editingDriverId;
      if(editingDriverId){
        const d = db.drivers.find(d=>d.id==editingDriverId);
        if(!d){ editingDriverId = null; setEditMode('btnAddDriver', false); toast('That record no longer exists — it may have been deleted', 'error'); return; }
        Object.assign(d, fields);
        editingDriverId = null;
        setEditMode('btnAddDriver', false);
      } else {
        db.drivers.push({ id: uid(), ...fields });
      }
      ['d_name','d_phone','d_license','d_allowance'].forEach(id=>document.getElementById(id).value='');
      markDirty(); renderDrivers(); renderSelects(); renderAllowances(); renderAllowanceSummary();
      toast(wasEditing ? 'Driver updated' : 'Driver added', 'success');
    };
    if(editingDriverId){ checkAdminPin('save changes to this driver', finish); }
    else { finish(); }
  });
}
