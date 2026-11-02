import { escapeHTML } from '../core/format.js';
import { db, markDirty, uid } from '../core/state.js';
import { checkAdminPin } from './adminPin.js';
import { toast } from '../ui/dialogs.js';
import { clearFields, setEditMode } from '../ui/forms.js';
import { scrollToForm } from '../ui/recordNavigation.js';
import { renderSelects } from '../ui/selects.js';

/* ---------- clients ---------- */

export let editingClientId = null;
export function renderClients(){
  const tb = document.querySelector('#clientTable tbody'); tb.innerHTML='';
  if(!db.clients.length){ tb.innerHTML = '<tr class="empty-row"><td colspan="5">No clients yet.</td></tr>'; return; }
  db.clients.forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(c.name)}</td><td>${escapeHTML(c.phone||'—')}</td><td>${c.idnum||'—'}</td><td>${escapeHTML(c.dl||'—')}</td>
      <td><button class="row-edit" title="Edit" aria-label="Edit" data-id="${c.id}">✎</button><button class="row-del" title="Delete" aria-label="Delete" data-id="${c.id}">✕</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.row-edit').forEach(b=>b.addEventListener('click',()=>{
    const c = db.clients.find(c=>c.id==b.dataset.id); if(!c) return;
    checkAdminPin('edit this client', ()=>{
      editingClientId = c.id;
      document.getElementById('c_name').value = c.name;
      document.getElementById('c_phone').value = c.phone;
      document.getElementById('c_id').value = c.idnum;
      document.getElementById('c_dl').value = c.dl;
      setEditMode('btnAddClient', true, ()=>{ editingClientId = null; clearFields(['c_name','c_phone','c_id','c_dl']); });
      scrollToForm('clientForm');
      toast('Editing ' + c.name + ' — update the fields and click Update client');
    });
  }));
  tb.querySelectorAll('.row-del').forEach(b=>b.addEventListener('click',()=>{
    checkAdminPin('delete this client', ()=>{
      db.clients = db.clients.filter(c=>c.id!=b.dataset.id);
      markDirty(); renderClients(); renderSelects();
      toast('Client deleted', 'success');
    });
  }));
}

export function initClients(){
  document.getElementById('btnAddClient').addEventListener('click', ()=>{
    const name = document.getElementById('c_name').value.trim();
    if(!name){ toast('Name is required', 'error'); return; }
    const fields = {
      name,
      phone: document.getElementById('c_phone').value.trim(),
      idnum: document.getElementById('c_id').value.trim(),
      dl: document.getElementById('c_dl').value.trim()
    };
    const finish = ()=>{
      const wasEditing = !!editingClientId;
      if(editingClientId){
        const c = db.clients.find(c=>c.id==editingClientId);
        if(!c){ editingClientId = null; setEditMode('btnAddClient', false); toast('That record no longer exists — it may have been deleted', 'error'); return; }
        Object.assign(c, fields);
        editingClientId = null;
        setEditMode('btnAddClient', false);
      } else {
        db.clients.push({ id: uid(), ...fields });
      }
      ['c_name','c_phone','c_id','c_dl'].forEach(id=>document.getElementById(id).value='');
      markDirty(); renderClients(); renderSelects();
      toast(wasEditing ? 'Client updated' : 'Client added', 'success');
    };
    if(editingClientId){ checkAdminPin('save changes to this client', finish); }
    else { finish(); }
  });
}
