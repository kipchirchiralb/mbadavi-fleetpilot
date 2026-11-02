import { owedForRental, paidForRental } from '../core/paymentMath.js';
import { ensurePeriod } from '../core/period.js';
import { db } from '../core/state.js';
import { THIN, effectivePeriodEnd, periodRangeLabel, tintCell, tintNet } from './dataSheets.js';
import { EXP_CATEGORIES, byCatMatch, expPeriodRangeVals } from '../reports/expenseStatement.js';
import { inRange } from '../reports/periodRange.js';

/* ---- styled per-vehicle statement sheet, formatted like the original ledger book ---- */
export const STMT_COLS = ['DATE','CLIENT','CONT. NO.','INV NO.','RCT NO.','DAYS','AMOUNT','PAID','OWED']; // columns C..K
export function styleHeaderRow(ws, rowNum, firstCol, lastCol){
  const row = ws.getRow(rowNum);
  for(let c=firstCol;c<=lastCol;c++){ row.getCell(c).font = {bold:true}; row.getCell(c).border = {bottom:THIN}; }
}
/* Full grid box on every cell in the rectangle, matching the original ledger book's look
   (Performance_Statement.xlsx) — every used cell bordered on all four sides, not just the header. */
export function boxRange(ws, r1, c1, r2, c2){
  for(let r=r1;r<=r2;r++){
    for(let c=c1;c<=c2;c++){
      ws.getCell(r,c).border = { top:THIN, bottom:THIN, left:THIN, right:THIN };
    }
  }
}
export function ledgerTitle(ws, rowNum, firstCol, lastCol, text){
  ws.mergeCells(rowNum, firstCol, rowNum, lastCol);
  const title = ws.getCell(rowNum, firstCol);
  title.value = text;
  title.font = {bold:true}; title.alignment = {horizontal:'center'};
}
export function addVehicleStatementBlock(ws, startRow, vehicle, rentalsForVehicle, expensesForVehicle, monthLabel){
  let r = startRow;
  ledgerTitle(ws, r, 3, 11, `${vehicle.reg} STATEMENT FOR ${monthLabel}`);
  r++;
  const rentalHeaderRow = r;
  STMT_COLS.forEach((h,i)=> ws.getCell(r,3+i).value = h);
  styleHeaderRow(ws, r, 3, 11);
  r++;
  let subDays=0, subAmount=0, subPaid=0;
  rentalsForVehicle.forEach(rental=>{
    const client = db.clients.find(c=>c.id==rental.clientId);
    const paid = paidForRental(rental.id);
    ws.getCell(r,3).value = rental.pickup + (rental.return && rental.return!==rental.pickup ? (' - '+rental.return) : '');
    ws.getCell(r,4).value = client ? client.name : '';
    ws.getCell(r,5).value = rental.contract || '';
    ws.getCell(r,6).value = rental.invoice || '';
    ws.getCell(r,7).value = rental.receipt || '';
    ws.getCell(r,8).value = Number(rental.days)||0;
    ws.getCell(r,9).value = Number(rental.amount)||0;
    ws.getCell(r,10).value = paid;
    ws.getCell(r,11).value = owedForRental(rental);
    subDays += Number(rental.days)||0; subAmount += Number(rental.amount)||0; subPaid += paid;
    r++;
  });
  ws.getCell(r,3).value = 'SUB TOTAL'; ws.getCell(r,3).font = {bold:true};
  ws.getCell(r,8).value = subDays; ws.getCell(r,8).font = {bold:true};
  ws.getCell(r,9).value = subAmount; tintCell(ws, r, 9, 'green', true);
  ws.getCell(r,10).value = subPaid; tintCell(ws, r, 10, 'green', true);
  ws.getCell(r,11).value = subAmount - subPaid; tintCell(ws, r, 11, (subAmount-subPaid)>0 ? 'red' : 'green', true);
  boxRange(ws, rentalHeaderRow, 3, r, 11);
  r += 2;
  const lessExpRow = r;
  ws.getCell(r,3).value = 'LESS EXPENSES'; ws.getCell(r,3).font = {bold:true};
  r++;
  let expTotal = 0;
  expensesForVehicle.forEach(x=>{
    ws.getCell(r,3).value = x.date;
    ws.getCell(r,4).value = x.desc || x.category || '';
    ws.getCell(r,5).value = Number(x.qty)||1;
    ws.getCell(r,6).value = x.category || '';
    ws.getCell(r,9).value = Number(x.amount)||0;
    tintCell(ws, r, 9, 'red');
    expTotal += Number(x.amount)||0;
    r++;
  });
  ws.getCell(r,9).value = expTotal; tintCell(ws, r, 9, 'red', true);
  r++;
  ws.getCell(r,3).value = 'TOTAL'; ws.getCell(r,3).font = {bold:true};
  ws.getCell(r,9).value = subAmount - expTotal; tintNet(ws, r, 9, subAmount - expTotal, true);
  boxRange(ws, lessExpRow, 3, r, 9);
  r += 2;
  ws.getCell(r,3).value = 'COLLECTED SO FAR'; ws.getCell(r,3).font = {bold:true};
  ws.getCell(r,10).value = subPaid; tintCell(ws, r, 10, 'green', true);
  r++;
  ws.getCell(r,3).value = 'STILL OWED BY CLIENTS'; ws.getCell(r,3).font = {bold:true};
  ws.getCell(r,11).value = subAmount - subPaid; tintCell(ws, r, 11, (subAmount-subPaid)>0 ? 'red' : 'green', true);
  r += 3; // blank rows before next vehicle's block
  return { nextRow: r, subAmount, subPaid, expTotal };
}
export function addStatementSheet(wb){
  ensurePeriod();
  const start = new Date(db.period.start+'T00:00:00');
  const end = effectivePeriodEnd(db.period);
  const monthLabel = periodRangeLabel(db.period);
  const ws = wb.addWorksheet('Statement');
  [15,15.5,12,12,15,8,15,12,12].forEach((w,i)=> ws.getColumn(3+i).width = w);
  let row = 2, any = false;
  let fleetRevenue=0, fleetPaid=0, fleetExpenses=0;
  db.vehicles.forEach(v=>{
    const vr = db.rentals.filter(r=>r.vehicleId==v.id && r.status!=='Cancelled' && inRange(r.pickup,start,end));
    const ve = db.expenses.filter(x=>x.vehicleId==v.id && inRange(x.date,start,end));
    if(!vr.length && !ve.length) return;
    any = true;
    const result = addVehicleStatementBlock(ws, row, v, vr, ve, monthLabel);
    row = result.nextRow;
    fleetRevenue += result.subAmount;
    fleetPaid += result.subPaid;
    fleetExpenses += result.expTotal;
  });
  if(!any){
    ws.getCell(2,3).value = 'No rentals or expenses recorded for ' + monthLabel + ' yet.';
    return;
  }
  ledgerTitle(ws, row, 3, 11, 'FLEET-WIDE TOTAL — ALL VEHICLES (' + monthLabel + ')');
  row++;
  const fwHeadRow = row;
  ws.getCell(row,3).value = 'METRIC'; ws.getCell(row,9).value = 'AMOUNT';
  ws.getCell(row,10).value = 'PAID'; ws.getCell(row,11).value = 'OWED';
  styleHeaderRow(ws, row, 3, 11);
  row++;
  ws.getCell(row,3).value = 'Total rental revenue (invoiced, before expenses)';
  ws.getCell(row,9).value = fleetRevenue; tintCell(ws, row, 9, 'green', true);
  row++;
  ws.getCell(row,3).value = 'Total vehicle expenses deducted';
  ws.getCell(row,9).value = fleetExpenses; tintCell(ws, row, 9, 'red', true);
  row++;
  ws.getCell(row,3).value = 'Net total (revenue less expenses)'; ws.getCell(row,3).font = {bold:true};
  ws.getCell(row,9).value = fleetRevenue - fleetExpenses; tintNet(ws, row, 9, fleetRevenue - fleetExpenses, true);
  row++;
  ws.getCell(row,3).value = 'Total collected from clients so far';
  ws.getCell(row,10).value = fleetPaid; tintCell(ws, row, 10, 'green', true);
  row++;
  ws.getCell(row,3).value = 'Total still owed by clients'; ws.getCell(row,3).font = {bold:true};
  ws.getCell(row,11).value = fleetRevenue - fleetPaid; tintCell(ws, row, 11, (fleetRevenue-fleetPaid)>0 ? 'red' : 'green', true);
  boxRange(ws, fwHeadRow, 3, row, 11);
}
/* ---- expense report sheet, mirrors the Expense statement modal's current scope ---- */
export function addExpenseReportSheet(wb){
  const vidEl = document.getElementById('exp_vehicle_pick');
  const vid = vidEl ? vidEl.value : '';
  const {start,end} = expPeriodRangeVals();
  const v = vid ? db.vehicles.find(v=>v.id==vid) : null;
  let rows = db.expenses.filter(x=>inRange(x.date,start,end));
  if(vid) rows = rows.filter(x=>x.vehicleId==vid);

  const ws = wb.addWorksheet('Expense Report');
  [14,20,16,26,8,14].forEach((w,i)=> ws.getColumn(1+i).width = w);

  ledgerTitle(ws, 1, 1, 6, (v ? v.reg+' — ' : 'FLEET-WIDE — ') + 'EXPENSE REPORT (' + start.toDateString() + ' to ' + end.toDateString() + ')');

  let r = 3;
  const catHeaderRow = r;
  ['CATEGORY','COUNT','AMOUNT','% OF TOTAL'].forEach((h,i)=> ws.getCell(r,1+i).value = h);
  styleHeaderRow(ws, r, 1, 4);
  r++;
  const total = rows.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const byCat = {}; EXP_CATEGORIES.forEach(c=>byCat[c]={count:0,amount:0});
  rows.forEach(x=>{ const cat = byCatMatch(x.category); byCat[cat].count++; byCat[cat].amount += Number(x.amount)||0; });
  EXP_CATEGORIES.filter(c=>byCat[c].count>0).sort((a,b)=>byCat[b].amount-byCat[a].amount).forEach(cat=>{
    const d = byCat[cat];
    ws.getCell(r,1).value = cat; ws.getCell(r,2).value = d.count; ws.getCell(r,3).value = d.amount;
    ws.getCell(r,4).value = (total ? (d.amount/total*100).toFixed(1) : '0.0') + '%';
    r++;
  });
  ws.getCell(r,1).value = 'TOTAL'; ws.getCell(r,1).font = {bold:true};
  ws.getCell(r,3).value = total; tintCell(ws, r, 3, 'red', true);
  boxRange(ws, catHeaderRow, 1, r, 4);
  r += 3;

  const detailHeaderRow = r;
  ['DATE','VEHICLE','CATEGORY','DESCRIPTION','QTY','AMOUNT'].forEach((h,i)=> ws.getCell(r,1+i).value = h);
  styleHeaderRow(ws, r, 1, 6);
  r++;
  rows.slice().sort((a,b)=> a.date<b.date?-1:(a.date>b.date?1:0)).forEach(x=>{
    const veh = db.vehicles.find(v=>v.id==x.vehicleId);
    ws.getCell(r,1).value = x.date;
    ws.getCell(r,2).value = veh?veh.reg:'';
    ws.getCell(r,3).value = x.category||'';
    ws.getCell(r,4).value = x.desc||'';
    ws.getCell(r,5).value = Number(x.qty)||1;
    ws.getCell(r,6).value = Number(x.amount)||0;
    r++;
  });
  ws.getCell(r,4).value = 'TOTAL'; ws.getCell(r,4).font = {bold:true};
  ws.getCell(r,6).value = total; tintCell(ws, r, 6, 'red', true);
  r++;
  boxRange(ws, detailHeaderRow, 1, r-1, 6);
}
/* ---- Fuel report: same ledger-book style as the Statement sheet, one block per vehicle ---- */
export function addFuelReportSheet(wb){
  const vidEl = document.getElementById('exp_vehicle_pick');
  const vid = vidEl ? vidEl.value : '';
  const {start,end} = expPeriodRangeVals();
  const monthLabel = start.toLocaleString('default',{month:'long',year:'numeric'}).toUpperCase();

  const ws = wb.addWorksheet('Fuel');
  [15,26,14,14,14,14,14].forEach((w,i)=> ws.getColumn(3+i).width = w); // C..I

  let r = 2;
  const vehiclesToShow = vid ? db.vehicles.filter(v=>v.id==vid) : db.vehicles;
  let anyRows = false;
  let fleetCost=0, fleetCharged=0;
  vehiclesToShow.forEach(v=>{
    const fuelRows = db.expenses.filter(x=>x.vehicleId==v.id && x.category==='Fuel' && inRange(x.date,start,end));
    if(!fuelRows.length) return;
    anyRows = true;
    ledgerTitle(ws, r, 3, 9, `${v.reg} FUEL FOR ${monthLabel}`);
    r++;
    const headerRow = r;
    ['DATE','DESCRIPTION','SOURCE','OFFICE COST (FRONTED)','BILLED TO','CHARGED TO CLIENT','RECOVERY'].forEach((h,i)=> ws.getCell(r,3+i).value = h);
    styleHeaderRow(ws, r, 3, 9);
    r++;
    let subCost=0, subCharged=0;
    fuelRows.slice().sort((a,b)=> a.date<b.date?-1:(a.date>b.date?1:0)).forEach(x=>{
      const client = x.billable ? db.clients.find(c=>c.id==x.billClientId) : null;
      const charged = x.billable ? (Number(x.chargeAmount)||0) : 0;
      ws.getCell(r,3).value = x.date;
      ws.getCell(r,4).value = x.desc || 'Fuel';
      ws.getCell(r,5).value = x.source==='rental' ? 'Rental-linked' : 'Manual';
      ws.getCell(r,6).value = Number(x.amount)||0;
      ws.getCell(r,7).value = client ? client.name : '—';
      ws.getCell(r,8).value = x.billable ? charged : 0;
      ws.getCell(r,9).value = x.billable ? (charged - (Number(x.amount)||0)) : 0;
      subCost += Number(x.amount)||0; subCharged += charged;
      r++;
    });
    ws.getCell(r,3).value = 'SUB TOTAL'; ws.getCell(r,3).font = {bold:true};
    ws.getCell(r,6).value = subCost; tintCell(ws, r, 6, 'fuel', true);
    ws.getCell(r,8).value = subCharged; tintCell(ws, r, 8, 'amber', true);
    ws.getCell(r,9).value = subCharged - subCost; tintNet(ws, r, 9, subCharged - subCost, true);
    boxRange(ws, headerRow, 3, r, 9);
    fleetCost += subCost; fleetCharged += subCharged;
    r += 3; // blank rows before next vehicle's block
  });
  if(!anyRows){
    ws.getCell(r,3).value = 'No fuel entries in this period.';
    r++;
    return ws;
  }
  // Fleet-wide total, shown only when the report covers every vehicle (not a single-vehicle scope)
  if(!vid){
    ledgerTitle(ws, r, 3, 9, 'FLEET-WIDE FUEL TOTAL — ALL VEHICLES (' + monthLabel + ')');
    r++;
    const fwHeadRow = r;
    ws.getCell(r,3).value = 'METRIC'; ws.getCell(r,6).value = 'FRONTED'; ws.getCell(r,8).value = 'CHARGED'; ws.getCell(r,9).value = 'NET';
    styleHeaderRow(ws, r, 3, 9);
    r++;
    ws.getCell(r,3).value = 'Total office-fronted (spent)';
    ws.getCell(r,6).value = fleetCost; tintCell(ws, r, 6, 'fuel');
    r++;
    ws.getCell(r,3).value = 'Total charged back to clients';
    ws.getCell(r,8).value = fleetCharged; tintCell(ws, r, 8, 'amber');
    r++;
    ws.getCell(r,3).value = 'Total net recovery (charged - fronted)'; ws.getCell(r,3).font = {bold:true};
    ws.getCell(r,9).value = fleetCharged - fleetCost; tintNet(ws, r, 9, fleetCharged - fleetCost, true);
    boxRange(ws, fwHeadRow, 3, r, 9);
  }
  return ws;
}
/* ---- Totals sheet: one-page fleet-wide summary — rentals, expenses by category, fuel recovery ---- */
export function addTotalsSheet(wb){
  ensurePeriod();
  const start = new Date(db.period.start+'T00:00:00');
  const end = effectivePeriodEnd(db.period);
  const monthLbl = periodRangeLabel(db.period);

  const ws = wb.addWorksheet('Totals');
  ws.getColumn(2).width = 42; ws.getColumn(3).width = 14; ws.getColumn(4).width = 16;

  ledgerTitle(ws, 2, 2, 4, 'FLEET-WIDE — TOTALS SUMMARY (' + monthLbl + ')');

  const rentalsInPeriod = db.rentals.filter(r=> r.status!=='Cancelled' && inRange(r.pickup,start,end));
  const fleetRevenue = rentalsInPeriod.reduce((s,r)=> s+(Number(r.amount)||0), 0);
  const fleetPaid = rentalsInPeriod.reduce((s,r)=> s+paidForRental(r.id), 0);

  let r = 4;
  ws.getCell(r,2).value = 'RENTALS'; ws.getCell(r,2).font = {bold:true};
  r++;
  const rentHead = r;
  ws.getCell(r,2).value = 'METRIC'; ws.getCell(r,3).value = 'AMOUNT';
  styleHeaderRow(ws, r, 2, 3);
  r++;
  ws.getCell(r,2).value = 'Total rental revenue (invoiced)';
  ws.getCell(r,3).value = fleetRevenue; tintCell(ws, r, 3, 'green', true);
  r++;
  ws.getCell(r,2).value = 'Total collected from clients';
  ws.getCell(r,3).value = fleetPaid; tintCell(ws, r, 3, 'green', true);
  r++;
  ws.getCell(r,2).value = 'Total still owed by clients'; ws.getCell(r,2).font = {bold:true};
  ws.getCell(r,3).value = fleetRevenue - fleetPaid; tintCell(ws, r, 3, (fleetRevenue-fleetPaid)>0 ? 'red' : 'green', true);
  boxRange(ws, rentHead, 2, r, 3);
  r += 2;

  const expInPeriod = db.expenses.filter(x=> inRange(x.date,start,end));
  const byCat = {}; EXP_CATEGORIES.forEach(c=>byCat[c]={count:0,amount:0});
  expInPeriod.forEach(x=>{ const cat = byCatMatch(x.category); byCat[cat].count++; byCat[cat].amount += Number(x.amount)||0; });
  const catsUsed = EXP_CATEGORIES.filter(c=>byCat[c].count>0).sort((a,b)=>byCat[b].amount-byCat[a].amount);
  const expTotalAmt = expInPeriod.reduce((s,x)=> s+(Number(x.amount)||0), 0);

  ws.getCell(r,2).value = 'EXPENSES'; ws.getCell(r,2).font = {bold:true};
  r++;
  const expHead = r;
  ws.getCell(r,2).value = 'CATEGORY'; ws.getCell(r,3).value = 'COUNT'; ws.getCell(r,4).value = 'AMOUNT';
  styleHeaderRow(ws, r, 2, 4);
  r++;
  catsUsed.forEach(cat=>{
    ws.getCell(r,2).value = cat; ws.getCell(r,3).value = byCat[cat].count; ws.getCell(r,4).value = byCat[cat].amount;
    tintCell(ws, r, 4, 'red');
    r++;
  });
  ws.getCell(r,2).value = 'TOTAL MONEY USED (ALL EXPENSES)'; ws.getCell(r,2).font = {bold:true};
  ws.getCell(r,3).value = expInPeriod.length; ws.getCell(r,3).font = {bold:true};
  ws.getCell(r,4).value = expTotalAmt; tintCell(ws, r, 4, 'red', true);
  boxRange(ws, expHead, 2, r, 4);
  r += 2;

  // Net income — the headline figure: revenue actually invoiced this period, less every
  // expense logged this period. Green when the fleet made money, red when it didn't.
  const netIncome = fleetRevenue - expTotalAmt;
  ws.getCell(r,2).value = 'NET INCOME'; ws.getCell(r,2).font = {bold:true};
  r++;
  const netHead = r;
  ws.getCell(r,2).value = 'METRIC'; ws.getCell(r,3).value = 'AMOUNT';
  styleHeaderRow(ws, r, 2, 3);
  r++;
  ws.getCell(r,2).value = 'Net income (revenue - expenses)'; ws.getCell(r,2).font = {bold:true};
  ws.getCell(r,3).value = netIncome; tintNet(ws, r, 3, netIncome, true);
  boxRange(ws, netHead, 2, r, 3);
  r += 2;

  const fuelRows = expInPeriod.filter(x=> x.category==='Fuel');
  const fuelCost = fuelRows.reduce((s,x)=> s+(Number(x.amount)||0), 0);
  const fuelCharged = fuelRows.reduce((s,x)=> s+(x.billable ? (Number(x.chargeAmount)||0) : 0), 0);

  ws.getCell(r,2).value = 'FUEL RECOVERY'; ws.getCell(r,2).font = {bold:true};
  r++;
  const fuelHead = r;
  ws.getCell(r,2).value = 'METRIC'; ws.getCell(r,3).value = 'AMOUNT';
  styleHeaderRow(ws, r, 2, 3);
  r++;
  ws.getCell(r,2).value = 'Total office-fronted (fuel spent)';
  ws.getCell(r,3).value = fuelCost; tintCell(ws, r, 3, 'fuel', true);
  r++;
  ws.getCell(r,2).value = 'Total charged back to clients';
  ws.getCell(r,3).value = fuelCharged; tintCell(ws, r, 3, 'amber', true);
  r++;
  ws.getCell(r,2).value = 'Net recovery (charged - fronted)'; ws.getCell(r,2).font = {bold:true};
  ws.getCell(r,3).value = fuelCharged - fuelCost; tintNet(ws, r, 3, fuelCharged - fuelCost, true);
  boxRange(ws, fuelHead, 2, r, 3);
}
