import ExcelJS from 'exceljs';
import { ensurePeriod, inferPeriodFromData, monthBounds, monthLabel } from '../core/period.js';
import { db } from '../core/state.js';
import { getDashLayout } from '../dashboard/cards.js';
import { addDataSheet, readDataSheet } from './dataSheets.js';
import { addExpenseReportSheet, addFuelReportSheet, addStatementSheet, addTotalsSheet } from './reportSheets.js';
import { DATA_SHEETS, DATA_SHEET_KEY, SETTINGS_COLS } from './schema.js';
import { toast } from '../ui/dialogs.js';

export async function buildWorkbook(){
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Fleet Ledger'; wb.created = new Date();

  ensurePeriod();
  // Reports go first so they're what opens in Excel; the raw data sheets the app
  // re-imports from follow (they're looked up by name, so order doesn't matter).
  if(!(db.settings && db.settings.includeStatement===false)) addStatementSheet(wb);
  if(db.settings && db.settings.includeExpenseReport) addExpenseReportSheet(wb);
  if(db.settings && db.settings.includeFuelReport) addFuelReportSheet(wb);
  if(!(db.settings && db.settings.includeTotals===false)) addTotalsSheet(wb);

  Object.keys(DATA_SHEETS).forEach(name=> addDataSheet(wb, name, db[DATA_SHEET_KEY[name]], DATA_SHEETS[name]));
  addDataSheet(wb, 'Meta', [{nextId: db.nextId}], ['nextId']);
  addDataSheet(wb, 'Settings', [{
    adminPin: (db.settings&&db.settings.adminPin)||'',
    chartType: (db.settings&&db.settings.chartType)||'pie',
    includeStatement: !(db.settings && db.settings.includeStatement===false),
    includeExpenseReport: !!(db.settings && db.settings.includeExpenseReport),
    includeFuelReport: !!(db.settings && db.settings.includeFuelReport),
    includeTotals: !(db.settings && db.settings.includeTotals===false),
    periodStart: db.period ? db.period.start : '',
    periodLabel: db.period ? db.period.label : '',
    dashboardWidgets: JSON.stringify(getDashLayout()),
    lastModified: db.lastModified || ''
  }], SETTINGS_COLS);

  return wb;
}
export function workbookToDb(wb){
  const newDb = {
    vehicles: readDataSheet(wb,'Vehicles', DATA_SHEETS.Vehicles),
    drivers:  readDataSheet(wb,'Drivers',  DATA_SHEETS.Drivers),
    clients:  readDataSheet(wb,'Clients',  DATA_SHEETS.Clients),
    bookings: readDataSheet(wb,'Bookings', DATA_SHEETS.Bookings),
    rentals:  readDataSheet(wb,'Rentals',  DATA_SHEETS.Rentals),
    expenses: readDataSheet(wb,'Expenses', DATA_SHEETS.Expenses),
    payments: readDataSheet(wb,'Payments', DATA_SHEETS.Payments),
    driverAllowances: readDataSheet(wb,'DriverAllowances', DATA_SHEETS.DriverAllowances),
    settings: { adminPin: null, chartType: 'pie', includeStatement: true, includeExpenseReport: false, includeFuelReport: false, includeTotals: true },
    nextId: 1,
    lastModified: null
  };
  const recordCollections = [newDb.vehicles,newDb.drivers,newDb.clients,newDb.bookings,newDb.rentals,newDb.expenses,newDb.payments,newDb.driverAllowances];
  recordCollections.flat().forEach(record=>{
    const numericId = Number(record.id);
    if(Number.isFinite(numericId) && numericId > 0) record.id = numericId;
  });
  newDb.vehicles.forEach(v=>{ v.rate = Number(v.rate)||0; });
  newDb.drivers.forEach(d=>{ d.allowance = Number(d.allowance)||0; });
  newDb.bookings.forEach(bk=>{
    bk.deposit = Number(bk.deposit)||0;
    bk.reminderAck = (bk.reminderAck===true || bk.reminderAck==='true' || bk.reminderAck===1 || bk.reminderAck==='1');
  });
  newDb.rentals.forEach(r=>{ r.rate=Number(r.rate)||0; r.days=Number(r.days)||0; r.amount=Number(r.amount)||0; r.fuel=Number(r.fuel)||0;
    r.fuelCharge = (r.fuelCharge===undefined || r.fuelCharge===null || r.fuelCharge==='') ? r.fuel : (Number(r.fuelCharge)||0); });
  newDb.expenses.forEach(x=>{
    x.qty=Number(x.qty)||1; x.amount=Number(x.amount)||0;
    x.billable = (x.billable===true || x.billable==='true' || x.billable===1 || x.billable==='1');
    x.chargeAmount = Number(x.chargeAmount)||0;
    x.billClientId = x.billClientId ? Number(x.billClientId)||x.billClientId : null;
    x.source = x.source==='rental' ? 'rental' : 'manual';
    x.rentalId = x.rentalId ? (Number(x.rentalId)||x.rentalId) : null;
    if(!x.billable){ x.billClientId = null; x.chargeAmount = 0; }
    if(x.source!=='rental'){ x.rentalId = null; }
  });
  newDb.payments.forEach(p=>{
    p.amount = Number(p.amount)||0;
    p.rentalId = p.rentalId ? (Number(p.rentalId)||p.rentalId) : null;
  });
  newDb.driverAllowances.forEach(a=>{ a.amount = Number(a.amount)||0; });

  const meta = readDataSheet(wb,'Meta', ['nextId']);
  const settingsRows = readDataSheet(wb,'Settings', SETTINGS_COLS);
  newDb.period = null;
  if(settingsRows[0]){
    if(settingsRows[0].adminPin) newDb.settings.adminPin = String(settingsRows[0].adminPin);
    if(settingsRows[0].chartType==='pie' || settingsRows[0].chartType==='bar') newDb.settings.chartType = settingsRows[0].chartType;
    newDb.settings.includeStatement = !(settingsRows[0].includeStatement===false || settingsRows[0].includeStatement==='false' || settingsRows[0].includeStatement===0);
    newDb.settings.includeExpenseReport = (settingsRows[0].includeExpenseReport===true || settingsRows[0].includeExpenseReport==='true' || settingsRows[0].includeExpenseReport===1);
    newDb.settings.includeFuelReport = (settingsRows[0].includeFuelReport===true || settingsRows[0].includeFuelReport==='true' || settingsRows[0].includeFuelReport===1);
    newDb.settings.includeTotals = !(settingsRows[0].includeTotals===false || settingsRows[0].includeTotals==='false' || settingsRows[0].includeTotals===0);
    if(settingsRows[0].periodStart){
      const d = new Date(settingsRows[0].periodStart+'T00:00:00');
      if(!isNaN(d)){
        const {start,end} = monthBounds(d.getFullYear(), d.getMonth());
        newDb.period = { year:d.getFullYear(), month:d.getMonth(), start, end, label: settingsRows[0].periodLabel || monthLabel(d.getFullYear(),d.getMonth()) };
      }
    }
    if(settingsRows[0].dashboardWidgets){
      try{
        const parsed = JSON.parse(settingsRows[0].dashboardWidgets);
        if(Array.isArray(parsed)) newDb.settings.dashboardWidgets = parsed;
      }catch(e){ /* malformed/old file — fall back to default layout */ }
    }
    newDb.lastModified = settingsRows[0].lastModified || null;
  }
  const allIds = [...newDb.vehicles,...newDb.drivers,...newDb.clients,...newDb.bookings,...newDb.rentals,...newDb.expenses,...newDb.payments,...newDb.driverAllowances].map(r=>Number(r.id)||0);
  const savedNextId = meta[0] && Number(meta[0].nextId);
  newDb.nextId = Math.max(Number.isFinite(savedNextId) ? savedNextId : 1, Math.max(0,...allIds)+1);
  migrateExpenseCategories(newDb);
  if(!newDb.period) newDb.period = inferPeriodFromData(newDb);
  return newDb;
}
/* One-time migration: rename old expense category labels to the current ones.
   "Repair" -> "Garage", "Airport charges - In"/"Airport charges - Out" -> "Airport". */
export function migrateExpenseCategories(targetDb){
  const renameMap = {
    'Repair': 'Garage',
    'Airport charges - In': 'Airport',
    'Airport charges - Out': 'Airport'
  };
  let changed = 0;
  (targetDb.expenses || []).forEach(x=>{
    if(renameMap[x.category]){ x.category = renameMap[x.category]; changed++; }
  });
  if(changed) toast(`Updated ${changed} expense categor${changed===1?'y':'ies'} to the new names`, 'success');
}
