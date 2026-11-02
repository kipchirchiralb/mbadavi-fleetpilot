import ExcelJS from 'exceljs';
import { renderAll } from '../app.js';
import { confirmLoadOverUnsaved, localSaveError, localSavePending, persistLocalDatabase } from '../core/autosave.js';
import { escapeHTML } from '../core/format.js';
import { checkMonthRollover, ensurePeriod, monthBounds, monthLabel, resetPeriodToDataDefault } from '../core/period.js';
import { currentFileHandle, currentFileName, db, dirty, markDirty, setCurrentFileHandle, setCurrentFileName, setDb, setDirty, setRolloverPromptShown } from '../core/state.js';
import { buildWorkbook, workbookToDb } from '../excel/workbook.js';
import { migratePinIfNeeded } from './adminPin.js';
import { toast } from '../ui/dialogs.js';
import { busyButton } from '../ui/enhancements.js';

/* ---------- save / load ---------- */
export function downloadWorkbookBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
export async function buildXlsxBlob(){
  const wb = await buildWorkbook();
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
/* Builds a workbook containing only the currently open period's records — vehicles,
   drivers and clients stay in full (so names/rates resolve), but bookings, rentals,
   expenses, payments and allowances are filtered down to the open month's date range.
   Temporarily swaps the global db so every existing sheet-builder (Statement, Totals,
   Fuel, etc.) just works unmodified, then restores it — the live working file, which
   keeps every record forever, is never touched by this. */
export async function buildMonthOnlyXlsxBlob(period){
  const inP = d => !!d && d>=period.start && d<=period.end;
  const snapshotDb = {
    vehicles: db.vehicles, drivers: db.drivers, clients: db.clients,
    bookings: db.bookings.filter(bk=>inP(bk.pickup)),
    rentals: db.rentals.filter(r=>inP(r.pickup)),
    expenses: db.expenses.filter(x=>inP(x.date)),
    payments: db.payments.filter(p=>inP(p.date)),
    driverAllowances: db.driverAllowances.filter(a=>inP(a.weekStart)),
    settings: db.settings,
    nextId: db.nextId,
    period: period
  };
  const original = db;
  setDb(snapshotDb);
  try{
    return await buildXlsxBlob();
  } finally {
    setDb(original);
  }
}
export function allDatabaseDates(){
  const dates = [];
  (db.bookings||[]).forEach(x=>x.pickup && dates.push(x.pickup));
  (db.rentals||[]).forEach(x=>x.pickup && dates.push(x.pickup));
  (db.expenses||[]).forEach(x=>x.date && dates.push(x.date));
  (db.payments||[]).forEach(x=>x.date && dates.push(x.date));
  (db.driverAllowances||[]).forEach(x=>x.weekStart && dates.push(x.weekStart));
  return dates.filter(Boolean);
}
export function databaseMonthKeys(){
  return [...new Set(allDatabaseDates().map(d=>String(d).slice(0,7)))].sort();
}
export function databaseYearKeys(){
  return [...new Set(databaseMonthKeys().map(k=>k.slice(0,4)))].sort();
}
export function archiveMonthLabel(key){
  const [y,m]=key.split('-').map(Number);
  return monthLabel(y,m-1);
}
export function openArchiveMonthPicker(){
  const keys=databaseMonthKeys();
  ensurePeriod();
  const currentKey=`${db.period.year}-${String(db.period.month+1).padStart(2,'0')}`;
  if(!keys.includes(currentKey)) keys.push(currentKey);
  keys.sort().reverse();
  const existing=document.getElementById('archiveMonthModal'); if(existing) existing.remove();
  const overlay=document.createElement('div'); overlay.className='modal-overlay show'; overlay.id='archiveMonthModal';
  overlay.innerHTML=`<div class="modal-box" style="max-width:520px;">
    <div class="modal-head"><div><h2>Save month / previous</h2><p>Choose the month to export as a clean standalone Excel file.</p></div><button class="modal-close" id="archiveMonthClose">✕</button></div>
    <div class="modal-body">
      <label style="display:block;margin-bottom:6px;">Month</label>
      <select id="archiveMonthSelect" style="width:100%;margin-bottom:12px;">
        ${keys.map(k=>`<option value="${k}" ${k===currentKey?'selected':''}>${archiveMonthLabel(k)}${k===currentKey?' — current':''}</option>`).join('')}
      </select>
      <div class="hint" style="margin-bottom:16px;">The exported file contains that month's bookings, rentals, expenses, payments and driver allowances. Vehicles, drivers and clients remain available for reference.</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;"><button class="btn" id="archiveMonthCancel" style="width:auto;padding:9px 16px;">Cancel</button><button class="btn primary" id="archiveMonthGo" style="width:auto;padding:9px 16px;">💾 Save selected month</button></div>
    </div></div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.querySelector('#archiveMonthClose').onclick=close; overlay.querySelector('#archiveMonthCancel').onclick=close;
  overlay.querySelector('#archiveMonthGo').onclick=async()=>{
    const key=overlay.querySelector('#archiveMonthSelect').value; close();
    const [y,m]=key.split('-').map(Number);
    await saveArchiveMonth({year:y,month:m-1,start:monthBounds(y,m-1).start,end:monthBounds(y,m-1).end,label:monthLabel(y,m-1)});
  };
}
export async function saveArchiveMonth(period){
  // buildMonthOnlyXlsxBlob briefly swaps the global db for a filtered snapshot; block
  // interaction for that window so nothing the user adds/edits in the meantime can land
  // in the throwaway snapshot copy and get lost when db is restored.
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--mono);font-size:13px;';
  overlay.textContent=`Saving ${period.label}…`; document.body.appendChild(overlay);
  try{
    const blob=await buildMonthOnlyXlsxBlob(period);
    const filename=`Fleet Ledger - ${period.label}.xlsx`; const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast(`Saved ${period.label} (${period.start} – ${period.end}). Your working database was not changed.`, 'success');
  }catch(err){ console.error(err); toast(err.message || 'Could not save the selected month.', 'error'); }
  finally{ overlay.remove(); }
}
export function updateArchiveStatus(){
  const el=document.getElementById('archiveMonthStatus'); if(!el) return;
  const count=databaseMonthKeys().length;
  el.textContent=`${count} month${count===1?'':'s'} represented in database${count>=10?' · yearly export enabled':' · '+(10-count)+' more month'+(10-count===1?'':'s')+' needed for yearly export'}`;
}
export async function saveArchiveYear(year){
  const period={year,month:0,start:`${year}-01-01`,end:`${year}-12-31`,label:String(year)};
  const overlay=document.createElement('div'); overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--mono);font-size:13px;'; overlay.textContent=`Saving ${year}…`; document.body.appendChild(overlay);
  const inP=d=>!!d && d>=period.start && d<=period.end;
  const snapshotDb={vehicles:db.vehicles,drivers:db.drivers,clients:db.clients,bookings:db.bookings.filter(x=>inP(x.pickup)),rentals:db.rentals.filter(x=>inP(x.pickup)),expenses:db.expenses.filter(x=>inP(x.date)),payments:db.payments.filter(x=>inP(x.date)),driverAllowances:db.driverAllowances.filter(x=>inP(x.weekStart)),settings:db.settings,nextId:db.nextId,period:period};
  const original=db;
  try{ setDb(snapshotDb); const blob=await buildXlsxBlob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`Fleet Ledger - ${year}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast(`Saved the ${year} annual archive. Your working database was not changed.`, 'success'); }
  catch(err){ console.error(err); toast(err.message || 'Could not save the yearly archive.', 'error'); }
  finally{ setDb(original); overlay.remove(); }
}
export function syncSheetCheckboxes(){
  if(!db.settings) db.settings = { adminPin: null };
  document.getElementById('chkIncludeStatement').checked = db.settings.includeStatement !== false;
  document.getElementById('chkIncludeExpenseReport').checked = !!db.settings.includeExpenseReport;
  document.getElementById('chkIncludeFuelReport').checked = !!db.settings.includeFuelReport;
  document.getElementById('chkIncludeTotals').checked = db.settings.includeTotals !== false;
}
export function renderFileStatus(){
  ensurePeriod();
  const el = document.getElementById('fileStatus');
  const localStatus = localSaveError
    ? '<span class="dirty">● local save failed</span>'
    : localSavePending
      ? '<span class="dirty">● saving locally…</span>'
      : '<span class="clean">● saved on this device</span>';
  const workbookStatus = dirty
    ? '<span class="dirty">Excel backup needs updating</span>'
    : currentFileName ? `Excel backup: ${escapeHTML(currentFileName)}` : 'No Excel backup yet';
  el.innerHTML = localStatus + `<br>${workbookStatus}` +
    `<br><span style="color:var(--amber);">📅 ${escapeHTML(db.period.label)}</span> <span style="color:var(--ink-faint);">(${db.period.start} – ${db.period.end})</span>`;
}

export function initFileIO(){
  document.getElementById('btnSaveThisMonth').addEventListener('click', openArchiveMonthPicker);
  document.getElementById('btnSaveYear').addEventListener('click', async ()=>{
    const count=databaseMonthKeys().length;
    if(count<10){ toast(`Save year is locked until the database contains at least 10 different months. Currently ${count} month${count===1?' is':'s are'} represented.`, 'error'); return; }
    const years=databaseYearKeys();
    const defaultYear=db.period ? String(db.period.year) : years[years.length-1];
    const existing=document.getElementById('archiveYearModal'); if(existing) existing.remove();
    const overlay=document.createElement('div'); overlay.className='modal-overlay show'; overlay.id='archiveYearModal';
    overlay.innerHTML=`<div class="modal-box" style="max-width:520px;">
    <div class="modal-head"><div><h2>Save year</h2><p>The database has ${count} different calendar months.</p></div><button class="modal-close" id="archiveYearClose">✕</button></div>
    <div class="modal-body"><label style="display:block;margin-bottom:6px;">Year</label><select id="archiveYearSelect" style="width:100%;margin-bottom:12px;">${years.slice().reverse().map(y=>`<option value="${y}" ${y===defaultYear?'selected':''}>${y}</option>`).join('')}</select>
    <div class="hint" style="margin-bottom:16px;">This creates one standalone Excel archive containing records from 1 January through 31 December of the selected year.</div>
    <div style="display:flex;gap:10px;justify-content:flex-end;"><button class="btn" id="archiveYearCancel" style="width:auto;padding:9px 16px;">Cancel</button><button class="btn primary" id="archiveYearGo" style="width:auto;padding:9px 16px;">🗓 Save selected year</button></div></div></div>`;
    document.body.appendChild(overlay); const close=()=>overlay.remove(); overlay.querySelector('#archiveYearClose').onclick=close; overlay.querySelector('#archiveYearCancel').onclick=close;
    overlay.querySelector('#archiveYearGo').onclick=async()=>{ const y=Number(overlay.querySelector('#archiveYearSelect').value); close(); await saveArchiveYear(y); };
  });
  updateArchiveStatus();
  document.getElementById('btnSave').addEventListener('click', busyButton(async ()=>{
    try{
      const blob = await buildXlsxBlob();
      ensurePeriod();
      const suggested = currentFileName || `Fleet Ledger - ${db.period.label}.xlsx`;
      if(window.showSaveFilePicker){
        try{
          const handle = await window.showSaveFilePicker({
            suggestedName: suggested,
            types:[{description:'Excel Workbook', accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          setCurrentFileHandle(handle);
          setCurrentFileName(handle.name);
          setDirty(false); renderFileStatus();
          await persistLocalDatabase();
          toast('Saved ' + currentFileName + ' — "Update existing file" will now overwrite it directly', 'success');
          return;
        }catch(err){ if(err.name==='AbortError') return; /* fall through to download */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = suggested;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setCurrentFileName(suggested);
      setCurrentFileHandle(null);
      setDirty(false); renderFileStatus();
      await persistLocalDatabase();
      toast('Saved ' + suggested + ' to your Downloads folder', 'success');
    }catch(err){
      console.error('Save failed:', err);
      toast('Save failed: ' + (err && err.message ? err.message : 'unknown error') + ' — check the browser console for details.', 'error');
    }
  }));
  document.getElementById('btnUpdate').addEventListener('click', busyButton(async ()=>{
    if(!currentFileHandle){
      try{
        const blob = await buildXlsxBlob();
        ensurePeriod();
        const filename = currentFileName || `Fleet Ledger - ${db.period.label}.xlsx`;
        downloadWorkbookBlob(blob, filename);
        setCurrentFileName(filename);
        setDirty(false); renderFileStatus();
        await persistLocalDatabase();
        toast('Downloaded updated copy as ' + filename + '. This preview cannot overwrite the original file directly.', 'success');
      }catch(err){
        console.error('Update download failed:', err);
        toast('Could not download the updated file: ' + (err && err.message ? err.message : 'unknown error'), 'error');
      }
      return;
    }
    let blob;
    try{
      blob = await buildXlsxBlob();
      const writable = await currentFileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      setDirty(false); renderFileStatus();
      await persistLocalDatabase();
      toast('Updated ' + currentFileName, 'success');
    }catch(err){
      console.error('Update failed:', err);
      try{
        if(!blob) blob = await buildXlsxBlob();
        ensurePeriod();
        const filename = currentFileName || `Fleet Ledger - ${db.period.label}.xlsx`;
        downloadWorkbookBlob(blob, filename);
        setCurrentFileHandle(null);
        setCurrentFileName(filename);
        setDirty(false); renderFileStatus();
        await persistLocalDatabase();
        toast('Could not overwrite the original here. Downloaded an updated copy as ' + filename, 'error');
      }catch(downloadError){
        console.error('Update download failed:', downloadError);
        toast('Could not update or download the file: ' + (downloadError && downloadError.message ? downloadError.message : 'unknown error'), 'error');
      }
    }
  }));
  document.getElementById('btnLoad').addEventListener('click', busyButton(async ()=>{
    if(window.showOpenFilePicker){
      try{
        const [handle] = await window.showOpenFilePicker({
          types:[{description:'Excel Workbook', accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]
        });
        const file = await handle.getFile();
        const buf = await file.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const loadedDb = workbookToDb(wb);
        if(!(await confirmLoadOverUnsaved(loadedDb))) return;
        setDb(loadedDb);
        syncSheetCheckboxes();
        setCurrentFileHandle(handle); setCurrentFileName(file.name); setDirty(false);
        await persistLocalDatabase();
        setRolloverPromptShown(false);
        resetPeriodToDataDefault();
        renderAll();
        checkMonthRollover();
        toast('Loaded ' + file.name, 'success');
        migratePinIfNeeded(db);
        return;
      }catch(err){
        if(err.name==='AbortError') return;
        if(err.name!=='NotAllowedError' && err.name!=='SecurityError'){
          console.error('Open failed:', err);
          toast('Could not open that file: ' + (err && err.message ? err.message : 'unknown error'), 'error');
          return;
        }
          console.warn('Direct open unavailable; using the browser file chooser:', err);
          toast('Direct file access is unavailable here. Choose the workbook in the file chooser.');
      }
    }
    document.getElementById('fileInput').click();
  }));
  document.getElementById('fileInput').addEventListener('change', e=>{
    const f = e.target.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = async ()=>{
      try{
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(reader.result);
        const loadedDb = workbookToDb(wb);
        if(!(await confirmLoadOverUnsaved(loadedDb))){ e.target.value=''; return; }
        setDb(loadedDb);
        syncSheetCheckboxes();
        setCurrentFileHandle(null); setCurrentFileName(f.name); setDirty(false);
        await persistLocalDatabase();
        setRolloverPromptShown(false);
        resetPeriodToDataDefault();
        renderAll();
        checkMonthRollover();
        toast('Loaded ' + f.name + ' (use Save to link it for direct updates)', 'success');
        migratePinIfNeeded(db);
      }catch(err){ console.error('Read failed:', err); toast('Could not read that file — is it a saved database file (.xlsx)?', 'error'); }
    };
    reader.readAsArrayBuffer(f);
    e.target.value = '';
  });
  document.getElementById('chkIncludeStatement').addEventListener('change', e=>{
    if(!db.settings) db.settings = { adminPin: null };
    db.settings.includeStatement = e.target.checked;
    markDirty();
  });
  document.getElementById('chkIncludeExpenseReport').addEventListener('change', e=>{
    if(!db.settings) db.settings = { adminPin: null };
    db.settings.includeExpenseReport = e.target.checked;
    markDirty();
  });
  document.getElementById('chkIncludeFuelReport').addEventListener('change', e=>{
    if(!db.settings) db.settings = { adminPin: null };
    db.settings.includeFuelReport = e.target.checked;
    markDirty();
  });
  document.getElementById('chkIncludeTotals').addEventListener('change', e=>{
    if(!db.settings) db.settings = { adminPin: null };
    db.settings.includeTotals = e.target.checked;
    markDirty();
  });
}
