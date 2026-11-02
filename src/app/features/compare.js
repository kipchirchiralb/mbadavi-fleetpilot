import ExcelJS from 'exceljs';
import { renderDashboard } from '../dashboard/cards.js';
import { workbookToDb } from '../excel/workbook.js';
import { inRange } from '../reports/periodRange.js';
import { toast } from '../ui/dialogs.js';

/* ---------- dashboard: optional "compare vs another month's file" ----------
   Lets someone see live dashboard deltas against a DIFFERENT saved Fleet Ledger
   file (e.g. last month's, if months are kept as separate files rather than one
   running ledger) without touching the currently open working file. Purely a
   session-side comparison: nothing here is saved into the open file or its
   exported reports, and it clears itself on page reload. */
export let compareDb = null;
export let compareFileName = null;
export function renderCompareStatus(){
  const status = document.getElementById('compareStatus');
  const clearBtn = document.getElementById('btnCompareClear');
  if(compareDb){
    status.textContent = `Comparing against: ${compareDb.period.label} — ${compareFileName}`;
    clearBtn.style.display = '';
  } else {
    status.textContent = '';
    clearBtn.style.display = 'none';
  }
}
/* Pulls the same four headline figures (revenue, expenses, fuel, net) out of a
   compare file, scoped to THAT file's own open period — works on an arbitrary db
   object instead of the global one. */
export function summarizeDbForPeriod(targetDb){
  const p = targetDb.period;
  const revenue = targetDb.rentals.filter(r=>r.status!=='Cancelled' && inRange(r.pickup,p.start,p.end)).reduce((s,r)=>s+r.amount,0);
  const expenses = targetDb.expenses.filter(x=>inRange(x.date,p.start,p.end)).reduce((s,x)=>s+x.amount,0);
  const fuel = targetDb.expenses.filter(x=>x.category==='Fuel' && inRange(x.date,p.start,p.end)).reduce((s,x)=>s+x.amount,0);
  return { revenue, expenses, fuel, net: revenue-expenses, label: p.label };
}

export function initCompare(){
  document.getElementById('btnCompareUpload').addEventListener('click', ()=>{
    document.getElementById('compareFileInput').click();
  });
  document.getElementById('compareFileInput').addEventListener('change', e=>{
    const f = e.target.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = async ()=>{
      try{
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(reader.result);
        const loaded = workbookToDb(wb);
        compareDb = loaded;
        compareFileName = f.name;
        renderCompareStatus();
        renderDashboard();
        toast('Comparing against ' + loaded.period.label + ' (' + f.name + ')', 'success');
      }catch(err){
        console.error('Compare read failed:', err);
        toast('Could not read that file — is it a saved Fleet Ledger database file (.xlsx)?', 'error');
      }
    };
    reader.readAsArrayBuffer(f);
    e.target.value = '';
  });
  document.getElementById('btnCompareClear').addEventListener('click', ()=>{
    compareDb = null; compareFileName = null;
    renderCompareStatus();
    renderDashboard();
  });
}
