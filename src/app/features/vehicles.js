import { fmt, escapeHTML } from '../core/format.js';
import { db, markDirty, uid } from '../core/state.js';
import { isValidMoney } from '../core/validation.js';
import { checkAdminPin } from './adminPin.js';
import { toast } from '../ui/dialogs.js';
import { clearFields, setEditMode } from '../ui/forms.js';
import { scrollToForm } from '../ui/recordNavigation.js';
import { refreshRentalVehicleSelect, renderSelects } from '../ui/selects.js';

/* ---------- vehicles ---------- */

export let editingVehicleId = null;
export function renderVehicles(){
  refreshRentalVehicleSelect();
  const tb = document.querySelector('#vehicleTable tbody'); tb.innerHTML='';
  if(!db.vehicles.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="6">No vehicles yet — add your first car above.</td></tr>'; return; }
  db.vehicles.forEach(v=>{
    const tr = document.createElement('tr');
    tr.dataset.id = v.id;
    tr.innerHTML = `<td>${escapeHTML(v.reg)}</td><td>${escapeHTML(v.make)} ${escapeHTML(v.model)} ${v.year?('\''+String(v.year).slice(-2)):''}</td>
      <td>${escapeHTML(v.owner||'—')}</td><td class="num">${fmt(v.rate)}</td>
      <td><span class="tag ${v.status}">${v.status}</span></td>
      <td><button class="row-edit" title="Edit" aria-label="Edit" data-id="${v.id}">✎</button><button class="row-del" title="Delete" aria-label="Delete" data-id="${v.id}">✕</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.row-edit').forEach(b=>b.addEventListener('click',()=>{
    const v = db.vehicles.find(v=>v.id==b.dataset.id); if(!v) return;
    checkAdminPin('edit this vehicle', ()=>{
      editingVehicleId = v.id;
      document.getElementById('v_reg').value = v.reg;
      document.getElementById('v_make').value = v.make;
      document.getElementById('v_model').value = v.model;
      document.getElementById('v_year').value = v.year;
      document.getElementById('v_rate').value = v.rate;
      document.getElementById('v_owner').value = v.owner;
      document.getElementById('v_status').value = v.status;
      setEditMode('btnAddVehicle', true, ()=>{ editingVehicleId = null; clearFields(['v_reg','v_make','v_model','v_year','v_rate','v_owner']); });
      scrollToForm('vehicleForm');
      toast('Editing ' + v.reg + ' — update the fields and click Update vehicle');
    });
  }));
  tb.querySelectorAll('.row-del').forEach(b=>b.addEventListener('click',()=>{
    checkAdminPin('delete this vehicle', ()=>{
      const removed = db.vehicles.find(v=>v.id==b.dataset.id);
      db.vehicles = db.vehicles.filter(v=>v.id!=b.dataset.id);
      markDirty(); renderVehicles(); renderSelects();
      toast('Deleted vehicle ' + (removed ? removed.reg : ''), 'success');
    });
  }));
}

export function initVehicles(){
  document.getElementById('btnAddVehicle').addEventListener('click', ()=>{
    const reg = document.getElementById('v_reg').value.trim();
    if(!reg){ toast('Reg no. is required', 'error'); return; }
    const dupe = db.vehicles.find(v=>v.id!=editingVehicleId && v.reg.trim().toLowerCase()===reg.toLowerCase());
    if(dupe){ toast('A vehicle with reg "' + dupe.reg + '" already exists', 'error'); return; }
    const rate = parseFloat(document.getElementById('v_rate').value)||0;
    if(!isValidMoney(rate, {allowZero:true})){ toast('Daily rate can\'t be negative', 'error'); return; }
    const fields = {
      reg,
      make: document.getElementById('v_make').value.trim(),
      model: document.getElementById('v_model').value.trim(),
      year: document.getElementById('v_year').value,
      rate,
      owner: document.getElementById('v_owner').value.trim(),
      status: document.getElementById('v_status').value
    };
    const finish = ()=>{
      const wasEditing = !!editingVehicleId;
      if(editingVehicleId){
        const v = db.vehicles.find(v=>v.id==editingVehicleId);
        if(!v){ editingVehicleId = null; setEditMode('btnAddVehicle', false); toast('That record no longer exists — it may have been deleted', 'error'); return; }
        Object.assign(v, fields);
        editingVehicleId = null;
        setEditMode('btnAddVehicle', false);
      } else {
        db.vehicles.push({ id: uid(), ...fields });
      }
      ['v_reg','v_make','v_model','v_year','v_rate','v_owner'].forEach(id=>document.getElementById(id).value='');
      markDirty(); renderVehicles(); renderSelects();
      toast((wasEditing ? 'Updated vehicle ' : 'Added vehicle ') + reg, 'success');
    };
    if(editingVehicleId){ checkAdminPin('save changes to this vehicle', finish); }
    else { finish(); }
  });
}
