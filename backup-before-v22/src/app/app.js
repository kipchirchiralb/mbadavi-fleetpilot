import { restoreLocalDatabase } from './core/autosave.js';
import { checkMonthRollover, ensurePeriod, resetPeriodToDataDefault } from './core/period.js';
import { renderDashboard } from './dashboard/cards.js';
import { renderAllowanceSummary, renderAllowances } from './features/allowances.js';
import { renderBookings } from './features/bookings.js';
import { renderClients } from './features/clients.js';
import { renderDrivers } from './features/drivers.js';
import { renderExpenses } from './features/expenses.js';
import { renderFileStatus, syncSheetCheckboxes } from './features/fileIO.js';
import { renderPayments } from './features/payments.js';
import { renderRentals } from './features/rentals.js';
import { renderVehicles } from './features/vehicles.js';
import { renderAnalysis } from './reports/analysis.js';
import { renderReports } from './reports/reports.js';
import { renderSelects } from './ui/selects.js';

/* ---------- init ---------- */
export function renderAll(){
  renderVehicles(); renderDrivers(); renderClients(); renderSelects();
  renderBookings(); renderRentals(); renderExpenses(); renderPayments();
  renderAllowances(); renderAllowanceSummary();
  renderDashboard(); renderReports(); renderFileStatus();
}
export async function initializeApp(){
  await restoreLocalDatabase();
  resetPeriodToDataDefault();
  syncSheetCheckboxes();
  ensurePeriod();
  renderAll();
  renderAnalysis();
  checkMonthRollover();
}

export function loadLedger(){
  initializeApp().catch(err=>{
    console.error('Could not initialize the local ledger:', err);
    ensurePeriod();
    syncSheetCheckboxes();
    renderAll();
    renderAnalysis();
    checkMonthRollover();
  });
}
