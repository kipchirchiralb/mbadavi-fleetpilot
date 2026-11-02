import ExcelJS from 'exceljs';
import { fmt, escapeHTML } from '../core/format.js';
import { workbookToDb } from '../excel/workbook.js';
import { renderStatAnalysis } from './statistics.js';
import { toast } from '../ui/dialogs.js';

/* ---------- multi-month analysis (loads other monthly files read-only) ---------- */
export let analysisFiles = []; // [{name, db}]
export function renderAnalysis(){
  const wrap = document.getElementById('analysisFilesWrap');
  const tb = document.querySelector('#analysisFilesTable tbody'); tb.innerHTML='';
  renderStatAnalysis();
  if(!analysisFiles.length){
    wrap.style.display='none';
    document.getElementById('analysisCards').innerHTML = '';
    document.querySelector('#analysisMonthTable tbody').innerHTML = '<tr class="empty-row"><td colspan="6">Load monthly database files above to see combined totals across them.</td></tr>';
    document.getElementById('analysisBars').innerHTML = '<div class="hint" style="margin:0;">Nothing loaded yet.</div>';
    return;
  }
  wrap.style.display = '';
  analysisFiles.forEach((f,i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(f.name)}</td><td>${escapeHTML(f.db.period.label)}</td>
      <td class="num">${f.db.bookings.length}</td><td class="num">${f.db.rentals.length}</td><td class="num">${f.db.expenses.length}</td>
      <td><button class="row-del" title="Remove this file" aria-label="Remove this file" data-i="${i}">✕</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.row-del').forEach(b=>b.addEventListener('click',()=>{
    analysisFiles.splice(Number(b.dataset.i),1);
    renderAnalysis();
  }));

  const monthRows = analysisFiles.map(f=>{
    const rentalsOk = f.db.rentals.filter(r=>r.status!=='Cancelled');
    const revenue = rentalsOk.reduce((s,r)=>s+(Number(r.amount)||0),0);
    const cancelledRentalIds = new Set(f.db.rentals.filter(r=>r.status==='Cancelled').map(r=>r.id));
    const collected = (f.db.payments||[]).filter(p=>!cancelledRentalIds.has(p.rentalId)).reduce((s,p)=>s+(Number(p.amount)||0),0);
    const expenses = (f.db.expenses||[]).reduce((s,x)=>s+(Number(x.amount)||0),0);
    return { label: f.db.period.label, rentals: rentalsOk.length, revenue, collected, expenses, net: revenue-expenses };
  });

  const totalRentals = monthRows.reduce((s,r)=>s+r.rentals,0);
  const totalRevenue = monthRows.reduce((s,r)=>s+r.revenue,0);
  const totalCollected = monthRows.reduce((s,r)=>s+r.collected,0);
  const totalExpenses = monthRows.reduce((s,r)=>s+r.expenses,0);
  document.getElementById('analysisCards').innerHTML = `
    <div class="card"><div class="label">Months loaded</div><div class="value">${analysisFiles.length}</div></div>
    <div class="card"><div class="label">Rentals</div><div class="value">${totalRentals}</div></div>
    <div class="card"><div class="label">Revenue</div><div class="value amber">${fmt(totalRevenue)}</div></div>
    <div class="card"><div class="label">Collected</div><div class="value green">${fmt(totalCollected)}</div></div>
    <div class="card"><div class="label">Expenses</div><div class="value red">${fmt(totalExpenses)}</div></div>
    <div class="card"><div class="label">Net</div><div class="value ${totalRevenue-totalExpenses>=0?'green':'red'}">${fmt(totalRevenue-totalExpenses)}</div></div>`;

  const mtb = document.querySelector('#analysisMonthTable tbody'); mtb.innerHTML='';
  monthRows.forEach(row=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(row.label)}</td><td class="num">${row.rentals}</td><td class="num">${fmt(row.revenue)}</td>
      <td class="num" style="color:var(--green);">${fmt(row.collected)}</td>
      <td class="num">${fmt(row.expenses)}</td>
      <td class="num" style="color:${row.net>=0?'var(--green)':'var(--red)'}">${fmt(row.net)}</td>`;
    mtb.appendChild(tr);
  });

  const maxRev = Math.max(1, ...monthRows.map(r=>r.revenue));
  document.getElementById('analysisBars').innerHTML = monthRows.length ? monthRows.map(row=>`
    <div class="bar-row">
      <div class="bname" style="width:120px;">${escapeHTML(row.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(row.revenue/maxRev*100)}%"></div></div>
      <div class="bar-amt">${fmt(row.revenue)}</div>
    </div>`).join('') : '<div class="hint" style="margin:0;">Nothing to chart yet.</div>';
}

export function initAnalysis(){
  document.getElementById('btnLoadAnalysisFiles').addEventListener('click', ()=>{
    document.getElementById('analysisFileInput').click();
  });
  document.getElementById('analysisFileInput').addEventListener('change', async e=>{
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for(const f of files){
      try{
        const buf = await f.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const parsedDb = workbookToDb(wb);
        analysisFiles.push({ name: f.name, db: parsedDb });
      }catch(err){
        console.error('Analysis load failed for', f.name, err);
        toast('Could not read ' + f.name + ' — skipped.', 'error');
      }
    }
    analysisFiles.sort((a,b)=> (a.db.period.start||'').localeCompare(b.db.period.start||''));
    renderAnalysis();
    toast(`Loaded ${files.length} file(s) for analysis`, 'success');
  });
  document.getElementById('btnClearAnalysisFiles').addEventListener('click', ()=>{
    analysisFiles = [];
    renderAnalysis();
  });
}
