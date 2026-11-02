import { installSafeInnerHTML } from './core/sanitize.js';
import { initEnhancements } from './ui/enhancements.js';
import { initAdminPin } from './features/adminPin.js';
import { initWatchlist } from './features/watchlist.js';
import { initShell } from './ui/shell.js';
import { initFileIO } from './features/fileIO.js';
import { initCompare } from './features/compare.js';
import { initLifecycle } from './core/lifecycle.js';
import { initVehicles } from './features/vehicles.js';
import { initDrivers } from './features/drivers.js';
import { initAllowances } from './features/allowances.js';
import { initClients } from './features/clients.js';
import { initSelects } from './ui/selects.js';
import { initBookings } from './features/bookings.js';
import { initRentals } from './features/rentals.js';
import { initExpenses } from './features/expenses.js';
import { initPayments } from './features/payments.js';
import { initDashboardCards } from './dashboard/cards.js';
import { initGlobalSearch } from './features/globalSearch.js';
import { initFleetChart } from './dashboard/fleetChart.js';
import { initPeriodControls } from './reports/periodRange.js';
import { initAnalysis } from './reports/analysis.js';
import { initStatistics } from './reports/statistics.js';
import { initExpenseStatement } from './reports/expenseStatement.js';
import { initDailyInfo } from './features/dailyInfo.js';
import { loadLedger } from './app.js';

/* Event bindings run in the same order the original single-file ledger registered them,
   after every module has been evaluated. */
export function startApp(){
  installSafeInnerHTML();
  initEnhancements();
  initAdminPin();
  initWatchlist();
  initShell();
  initFileIO();
  initCompare();
  initLifecycle();
  initVehicles();
  initDrivers();
  initAllowances();
  initClients();
  initSelects();
  initBookings();
  initRentals();
  initExpenses();
  initPayments();
  initDashboardCards();
  initGlobalSearch();
  initFleetChart();
  initPeriodControls();
  initAnalysis();
  initStatistics();
  initExpenseStatement();
  initDailyInfo();
  loadLedger();
}
