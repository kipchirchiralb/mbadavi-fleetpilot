/* ---------- badge spin: always spinning, slowly, whether the app is
   active or idle — no on/off timing logic to depend on, just a constant
   slow rotation (see the .brand-badge img rule in <style> above). ---------- */

/* ---------- excel (xlsx) conversion — ExcelJS ---------- */
/* Raw data sheets keep the app's tables round-trippable (used to reload the database). */
export const DATA_SHEETS = {
  Vehicles: ['id','reg','make','model','year','rate','owner','status'],
  Drivers:  ['id','name','phone','license','vehicleId','allowance','status'],
  Clients:  ['id','name','phone','idnum','dl'],
  Bookings: ['id','vehicleId','clientId','bookedOn','pickup','return','deposit','status','reminderAck'],
  Rentals:  ['id','vehicleId','clientId','contract','invoice','receipt','pickup','pickupTime','return','returnTime','rate','days','mileage','amount','status','fuel','fuelCharge'],
  Expenses: ['id','vehicleId','date','category','desc','qty','amount','billable','billClientId','chargeAmount','source','rentalId'],
  Payments: ['id','rentalId','date','amount','method','note'],
  DriverAllowances: ['id','driverId','weekStart','amount','note']
};
export const DATA_SHEET_KEY = { Vehicles:'vehicles', Drivers:'drivers', Clients:'clients', Bookings:'bookings', Rentals:'rentals', Expenses:'expenses', Payments:'payments', DriverAllowances:'driverAllowances' };
/* Settings sheet columns — periodStart/periodLabel record which calendar month this
   file represents, so the app can auto-detect month rollovers and so multi-month
   analysis can label each loaded file without guessing. */
export const SETTINGS_COLS = ['adminPin','chartType','includeStatement','includeExpenseReport','includeFuelReport','includeTotals','periodStart','periodLabel','dashboardWidgets','lastModified'];
