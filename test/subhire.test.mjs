/* Sub-hire: SUBHIRE DRIVER lines tied to rentals, owner side, totals against the sheet, second run adds nothing, self-drive type. Run from the test folder. */
import fs from 'node:fs';
import { analyze } from '../src/importer/index.js';
import { mergeImport } from '../src/importer/merge.js';
import { monthlySummary } from '../src/summary.js';
import { drillRecords } from '../src/pages.js';
import { ownerRows, driverRows, ownerSummary, driverSummary, vehiclePerformance, driverAmount, driverCost, ownerCost, setOwnerStatus, setDriverStatus, ownerStatus, driverStatus } from '../src/subhireCore.js';
const W = JSON.parse(fs.readFileSync('workbook.json', 'utf8'));
let fail = 0; const ok = (name, c, extra) => { console.log((c ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if(!c) fail++; };
const res = analyze(W, { today: '2026-10-24' });
const db = { vehicles: [], drivers: [], clients: [], bookings: [], rentals: [], expenses: [], payments: [], accounts: [], loans: [], insurance: [], chama: [], settings: {}, nextId: 1 };
const log = mergeImport(db, res, { today: '2026-10-24' });
const sheet = res.data.expenses.filter(e => e.sheet === 'SUBHIRE DRIVER');
const sheetTotal = sheet.reduce((s, e) => s + e.amount, 0);
ok('201 sub-hire driver lines read', sheet.length === 201, String(sheet.length));
ok('most lines tied to a rental', log.added.driverJobs >= 175, 'tied ' + log.added.driverJobs);
const left = db.expenses.filter(x => x.category === 'Sub-hire driver');
ok('the rest stay as costs and are listed for review', left.length === sheet.length - res.data.driverJobs.length && res.review.filter(r => r.code === 'SD_NO_RENTAL').length === left.length, left.length + ' left');
const fromRentals = db.rentals.reduce((s, r) => s + driverAmount(r), 0);
ok('rentals + leftover costs add up to the sheet total (nothing lost, nothing doubled)', Math.abs(fromRentals + left.reduce((s, x) => s + x.amount, 0) - sheetTotal) < 1, fromRentals + ' + ' + left.reduce((s, x) => s + x.amount, 0) + ' = ' + sheetTotal);
ok('a rental carries driver amount per day, status, date', db.rentals.some(r => r.driverRate > 0 && r.driverStatus === 'paid' && r.driverStatusDate));
const subDrivers = db.drivers.filter(d => d.kind === 'subhire').map(d => d.name);
ok('sub-hire drivers flagged', ['BARACK', 'BRIAN', 'RODGERS', 'COLLINS', 'DENIS'].every(n => subDrivers.includes(n)), subDrivers.join(','));
ok('own drivers stay own', !subDrivers.includes('EVANS') && !subDrivers.includes('PHILIP'));
/* the sheet example: Brian, coop, one day, 800 */
const brian = db.drivers.find(d => d.name === 'BRIAN');
const one = db.rentals.find(r => r.driverId === brian.id && r.days === 1 && r.driverRate === 800);
ok('Brian, one day, 800 per day = 800', !!one && driverAmount(one) === 800);
const dr = driverRows(db);
ok('driver sheet draws every rental of a sub-hire driver', dr.length >= db.rentals.filter(r => subDrivers.includes((db.drivers.find(d => d.id === r.driverId) || {}).name)).length);
/* monthly figures == pages records == tables */
const rg = ['2026-01', '2026-10'];
const rows = monthlySummary(db, rg[0], rg[1]);
let bad = 0;
rows.forEach(r => { ['subhire', 'subhireDriver'].forEach(col => {
  const d = drillRecords(db, { col, from: r.month, to: r.month }, { fmt: n => n, paidFor: () => 0 });
  if(Math.abs(d.total - r[col]) > 0.01){ bad++; console.log('  mismatch', r.month, col, d.total, r[col]); } }); });
ok('Monthly progress figures equal the records behind them (sub-hire and sub-hire driver)', bad === 0);
let bad2 = 0;
rows.forEach(r => { const o = ownerSummary(db, r.month).reduce((s, x) => s + x.cost, 0); if(Math.abs(o - r.subhire) > 0.01){ bad2++; console.log('  owner table', r.month, o, r.subhire); } });
ok('Sub-hire page owner totals equal the Monthly progress Sub-hire column', bad2 === 0);
const allDrv = rows.reduce((s, r) => s + r.subhireDriver, 0);
ok('Monthly progress sub-hire driver = rentals + leftover costs', Math.abs(allDrv - sheetTotal) < 1, allDrv + ' vs ' + sheetTotal);
/* status changes */
const r1 = db.rentals.find(r => r.subhireCost > 0 && ownerStatus(r) === 'paid');
const before = ownerSummary(db, r1.pickup.slice(0, 7)).reduce((s, o) => s + o.cost, 0);
setOwnerStatus(r1, 'cancelled', '2026-10-25');
const after = ownerSummary(db, r1.pickup.slice(0, 7)).reduce((s, o) => s + o.cost, 0);
ok('cancelling an owner line removes its cost and keeps paid flag false', Math.abs(before - after - r1.subhireCost) < 0.01 && r1.subhirePaid === false && r1.subhireStatus === 'cancelled');
setOwnerStatus(r1, 'paid', '2026-10-26'); ok('paid again sets paid flag and date', r1.subhirePaid === true && r1.subhirePaidDate === '2026-10-26');
const r2 = db.rentals.find(r => r.driverRate > 0 && driverStatus(r) === 'paid'); const c0 = driverCost(r2);
setDriverStatus(r2, 'cancelled', '2026-10-25'); ok('cancelled driver job costs nothing', driverCost(r2) === 0 && c0 > 0);
r2.driverRate = 1000; setDriverStatus(r2, 'notcleared', ''); ok('amount = rate x days after typing a new rate', driverAmount(r2) === 1000 * r2.days);
const perf = vehiclePerformance(db, ''); ok('car performance rows', perf.length > 5 && perf.every(p => Number.isFinite(p.net)));
/* second run adds nothing, changes nothing typed */
const snap = JSON.stringify(db.rentals.map(r => [r.id, r.driverRate, r.driverStatus, r.type]));
const log2 = mergeImport(db, res, { today: '2026-10-24' });
ok('second import ties nothing again and removes nothing', !log2.added.driverJobs && !log2.added.driverCostsMoved && !log2.added.rentals, JSON.stringify(log2.added));
ok('second import leaves typed values alone', JSON.stringify(db.rentals.map(r => [r.id, r.driverRate, r.driverStatus, r.type])) === snap);
/* self-drive */
const selfN = db.rentals.filter(r => r.type === 'self').length, selfRaw = res.data.rentals.filter(x => String(x.driver).toUpperCase() === 'SELF' && x.type !== 'taxi' && String(x.client).toUpperCase() !== 'COOP').length;
ok('rentals with SELF in the DRIVER column become self-drive', selfN === selfRaw && selfN > 300, selfN + ' of ' + selfRaw);
ok('self-drive rentals have no driver', db.rentals.filter(r => r.type === 'self').every(r => !r.driverId));
ok('self-drive clients exist', db.clients.filter(c => c.type === 'self').length > 20, db.clients.filter(c => c.type === 'self').length + ' clients');
/* an old database that already holds walk-in rentals imported before: retyped, once */
const old = JSON.parse(JSON.stringify(db)); old.rentals.forEach(r => { if(r.type === 'self') r.type = 'walkin'; }); old.clients.forEach(c => { if(c.type === 'self') c.type = 'walkin'; }); delete old.settings.importMarks;   // a database imported before v21 has no import fingerprints
const log3 = mergeImport(old, res, { today: '2026-10-24' });
ok('older database: SELF rentals retyped by the import', log3.added.retypedSelf === selfN && old.clients.some(c => c.type === 'self'), log3.added.retypedSelf + ' rentals, ' + old.clients.filter(c => c.type === 'self').length + ' clients');
console.log(fail ? fail + ' FAILED' : 'sub-hire tests passed'); process.exit(fail ? 1 : 0);
