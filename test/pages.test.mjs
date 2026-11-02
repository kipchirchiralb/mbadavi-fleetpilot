import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyze } from '../src/importer/index.js';
import { mergeImport } from '../src/importer/merge.js';
import { monthlySummary, SUMMARY_COLUMNS } from '../src/summary.js';
import { drillRecords } from '../src/pages.js';
const W = JSON.parse(fs.readFileSync(new URL('./workbook.json', import.meta.url),'utf8'));
const res = analyze(W, { today: '2026-10-24' });
const db = { vehicles:[],drivers:[],clients:[],bookings:[],rentals:[],expenses:[],payments:[],invoices:[],accounts:[],loans:[],insurance:[],chama:[],settings:{},nextId:1 };
mergeImport(db, res, { today: '2026-10-24' });
const paidFor = id => db.payments.filter(p=>p.rentalId==id).reduce((s,p)=>s+p.amount,0);
const ctx = { fmt: n=>String(n), paidFor };
const cols = SUMMARY_COLUMNS.map(c=>c.key).concat(['billed','other','collected']);
let checked = 0;
const vehicleIds = [null, ...db.vehicles.slice(0, 12).map(v=>v.id)];
for(const vid of vehicleIds){
  const rows = monthlySummary(db, '2025-01', '2026-12', { vehicleId: vid, paidFor });
  for(const r of rows){
    for(const col of cols){
      const d = drillRecords(db, { col, from: r.month, to: r.month, vehicleId: vid }, ctx);
      assert.ok(Math.abs(d.total - (r[col]||0)) < 0.01, `vehicle ${vid} ${r.month} ${col}: figure ${r[col]} vs records ${d.total}`);
      checked++;
    }
  }
  // TOTAL row
  for(const col of cols){
    const sum = rows.reduce((s,r)=>s+(r[col]||0),0);
    const d = drillRecords(db, { col, from: '2025-01', to: '2026-12', vehicleId: vid }, ctx);
    assert.ok(Math.abs(d.total - sum) < 0.01, `TOTAL vehicle ${vid} ${col}: ${sum} vs ${d.total}`); checked++;
  }
}
// owed drill = billed - collected
const rowsAll = monthlySummary(db, '2025-01', '2026-12', { paidFor });
for(const r of rowsAll){ const d = drillRecords(db, { col:'owed', from:r.month, to:r.month }, ctx); 
  const expect = db.rentals.filter(x=>x.status!=='Cancelled'&&x.pickup.slice(0,7)===r.month).reduce((s,x)=>s+Math.max(0,x.amount-paidFor(x.id)),0);
  assert.ok(Math.abs(d.total-expect)<0.01); checked++; }
// invoices
const invTot = drillRecords(db, { col:'invoiceTotal', from:'2026-01', to:'2026-12' }, ctx).total;
assert.equal(invTot, 15116386);
assert.equal(drillRecords(db, { col:'invoiceUnpaid', from:'2026-01', to:'2026-12' }, ctx).total, 776446);
console.log('pages figures == records behind them:', checked, 'checks passed; invoices', invTot);
