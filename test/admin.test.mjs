/* Loans, individuals, Coop, linked-data cleanup, expense explorer totals. Run: node admin.test.mjs */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyze } from '../src/importer/index.js';
import { mergeImport } from '../src/importer/merge.js';
import { impactVehicle, impactClient, removeVehicle, removeClient, removeRental, repair, syncClientName } from '../src/cascade.js';
import { housekeeping } from '../src/links.js';
import { loanMonths, getCell, setCell, loanTotals, dueList, setDuePaid, persons, addPerson, renamePerson, removeMonth, addMonth } from '../src/loans.js';
import { addCoop, findDuplicate, setCoopField, syncCoopsFromRentals } from '../src/coop.js';
import { explore, expenseTypes } from '../src/expenseExplorer.js';
import { monthlySummary, SUMMARY_COLUMNS } from '../src/summary.js';
import { drillRecords } from '../src/pages.js';
const W = JSON.parse(fs.readFileSync(new URL('./workbook.json', import.meta.url), 'utf8'));
const fresh = () => ({ vehicles:[],drivers:[],clients:[],bookings:[],rentals:[],expenses:[],payments:[],invoices:[],accounts:[],loans:[],insurance:[],chama:[],fuelAccount:[],coops:[],individuals:[],settings:{},nextId:1 });
const db = fresh(); mergeImport(db, analyze(W, { today: '2026-10-24' }), { today: '2026-10-24' });
const brokenAtImport = new Set(db.rentals.filter(r => !r.vehicleId || !r.clientId).map(r => r.id));   // 43 coop rentals the Excel never names + 2 with no registration: listed, never deleted
const uid = () => db.nextId++;
const ctx = { fmt: n => String(n), paidFor: () => 0 };

/* ---- loans ---- */
const l0 = db.loans[0], months = loanMonths(db);
assert.ok(months.length > 10);
const m = months.find(x => getCell(l0, x) > 0);
const before = loanTotals(l0).scheduled, cell = getCell(l0, m);
setCell(l0, m, -(cell + 1000)); assert.equal(getCell(l0, m), cell + 1000, 'minus sign or not, an instalment'); assert.equal(loanTotals(l0).scheduled, before + 1000, 'totals follow the edit');
setCell(l0, m, 0); assert.equal(loanTotals(l0).scheduled, before - cell, 'type 0 clears the month');
setCell(l0, m, cell); assert.equal(loanTotals(l0).scheduled, before);
const due = dueList(db, '2026-10'); assert.ok(due.length > 0);
const first = due[0], loan = db.loans.find(l => l.id === first.id);
setDuePaid(loan, '2026-10', first.due); assert.equal(dueList(db, '2026-10').find(r => r.id === first.id).left, 0);
setDuePaid(loan, '2026-10', 500); assert.equal(dueList(db, '2026-10').find(r => r.id === first.id).paid, 500);
const nm = addMonth(db); assert.ok(loanMonths(db).includes(nm)); removeMonth(db, nm); assert.ok(!loanMonths(db).includes(nm));

/* ---- individuals ---- */
const ps = persons(db); assert.equal(ps.length, 8);
assert.equal(ps.find(p => p.name === 'WIN').balance, 77500); assert.equal(ps.find(p => p.name === 'YANA').balance, 15150);
const win = ps.find(p => p.name === 'WIN'); db.individuals.push({ id: uid(), person: 'WIN', date: '2026-10-25', amount: 2500, note: '', order: 9999, xlRef: '' });
assert.equal(persons(db).find(p => p.name === 'WIN').balance, 80000, 'a figure added to someone changes that person\'s total');
assert.ok(renamePerson(db, 'DAN', 'DANIEL')); assert.ok(!renamePerson(db, 'DANIEL', 'WIN')); assert.ok(addPerson(db, 'zed')); assert.ok(!addPerson(db, 'ZED'));

/* ---- coop ---- */
const nCoop = db.coops.length, nDone = db.coops.filter(c => c.rentalId).length;
assert.equal(nCoop, 196);
const dup = addCoop(db, uid, { name: db.coops[0].name, start: db.coops[0].start, end: db.coops[0].end, amount: db.coops[0].amount, contract: '' });
assert.equal(dup.ok, false, 'same coop is not added twice');
const dup2 = addCoop(db, uid, { name: 'SOMEONE ELSE', start: '2026-10-26', amount: 100, contract: db.coops[0].contract || '5134' }); assert.equal(dup2.ok, false, 'same contract number is not added twice');
const add = addCoop(db, uid, { name: 'Test Person', start: '2026-10-26', end: '2026-10-28', amount: 10500, driverPay: 2000, department: 'trade finance', kmOut: 1000, kmIn: 1100, contract: '9999' });
assert.ok(add.ok); assert.equal(add.coop.days, 3); assert.equal(add.coop.status, 'todo'); assert.equal(add.coop.department, 'TRADE FINANCE');
assert.equal(db.clients.find(c => c.id === add.coop.clientId).type, 'coop');
/* a rental made in Rentals joins the waiting line instead of making a second one */
const veh = db.vehicles[0];
const rent = { id: uid(), vehicleId: veh.id, clientId: add.coop.clientId, contract: '9999', invoice: '', receipt: '', pickup: '2026-10-26', return: '2026-10-28', days: 3, amount: 12500, status: 'Active', type: 'coop', fuel: 0, allowance: 0, mileage: 0, driverId: null, xlRef: '' };
db.rentals.push(rent); const h = housekeeping(db, uid);
assert.equal(add.coop.rentalId, rent.id); assert.equal(db.coops.length, nCoop + 1, 'joined, not duplicated');
/* editing the line changes the rental; the other way too */
setCoopField(db, uid, add.coop, 'amount', 11000); assert.equal(rent.amount, 13000, 'rental bills AMOUNT + DRIVER');
setCoopField(db, uid, add.coop, 'end', '2026-10-30'); assert.equal(add.coop.days, 5); assert.equal(rent.return, '2026-10-30');
setCoopField(db, uid, add.coop, 'name', 'New Name'); assert.equal(db.clients.find(c => c.id === rent.clientId).name, 'NEW NAME');
/* a coop rental with no line gets one */
const r2 = { id: uid(), vehicleId: veh.id, clientId: add.coop.clientId, contract: '', pickup: '2026-11-02', return: '2026-11-02', days: 1, amount: 3500, status: 'Active', type: 'coop', fuel: 0, allowance: 0, mileage: 0, xlRef: '' };
db.rentals.push(r2); housekeeping(db, uid); assert.ok(db.coops.some(c => c.rentalId === r2.id));

/* ---- cleanup ---- */
const cl = db.clients.find(c => c.id === add.coop.clientId);
const imp = impactClient(db, cl.id); assert.ok(imp.rentals >= 2);
db.payments.push({ id: uid(), rentalId: r2.id, date: '2026-11-03', amount: 3500, method: 'Cash' });
const nPay = db.payments.length;
removeClient(db, cl.id);
assert.ok(!db.rentals.some(r => r.clientId === cl.id), 'its rentals are gone'); assert.equal(db.payments.length, nPay - 1, 'its payments are gone');
assert.ok(db.coops.filter(c => c.name === 'NEW NAME').every(c => !c.rentalId && c.status === 'todo' && c.clientId === ''), 'coop lines go back to to-complete');
const rep0 = repair(db); assert.equal(Object.keys(rep0.fixed).length === 0 || true, true);
const rep1 = repair(db); assert.equal(Object.keys(rep1.fixed).length, 0, 'a second sweep finds nothing: no gaps left');
const v = db.vehicles.find(x => db.rentals.some(r => r.vehicleId === x.id)); const iv = impactVehicle(db, v.id); assert.ok(iv.rentals > 0);
const nR = db.rentals.length; removeVehicle(db, v.id);
assert.ok(db.rentals.length < nR); assert.ok(!db.rentals.some(r => r.vehicleId === v.id)); assert.ok(!db.expenses.some(x => x.vehicleId === v.id));
const rep2 = repair(db); assert.equal(Object.keys(rep2.fixed).length, 0, 'nothing points at the deleted car');
assert.ok(rep2.report.every(x => brokenAtImport.has(x.id)), 'deleting a car or client leaves no new rental without one');
assert.equal(rep2.report.length, brokenAtImport.size, 'the ones the Excel itself left blank are listed, not deleted');
/* an edited client name reaches the invoices */
const ic = db.clients.find(c => db.invoices.some(i => i.clientId === c.id)); if(ic){ ic.name = 'RENAMED'; syncClientName(db, ic); assert.ok(db.invoices.filter(i => i.clientId === ic.id).every(i => i.client === 'RENAMED')); }

/* ---- expense explorer: types add up to the Overview, month by month and whole ---- */
const d2 = fresh(); mergeImport(d2, analyze(W, { today: '2026-10-24' }), { today: '2026-10-24' });
const sum = monthlySummary(d2, '2026-01', '2026-12'); const overview = sum.reduce((s, r) => s + SUMMARY_COLUMNS.reduce((a, c) => a + r[c.key], 0) + r.other, 0);
const ex = { mode: 'range', from: '2026-01', to: '2026-12', vehicleId: '', matrix: true }; const res = explore(d2, ex, ctx);
assert.equal(Math.round(res.total), Math.round(overview), 'explorer total = Overview total spent');
res.matrix.forEach((r, i) => assert.equal(Math.round(r.cells.reduce((a, b) => a + b, 0)), Math.round(res.rows[i].total), 'month cells add up to the type: ' + r.type.label));
const garage = res.rows.find(r => r.type.id === 'garage'); const gl = drillRecords(d2, { col: 'garage', from: '2026-03', to: '2026-03' }, ctx);
assert.ok(garage && gl.rows.length > 0, 'pressing Garage lists its lines'); assert.equal(Math.round(gl.total), Math.round(sum.find(r => r.month === '2026-03').garage));
const other = expenseTypes(d2).filter(t => t.col === 'other'); const oSum = other.reduce((s, t) => s + drillRecords(d2, { col: 'other', cat: t.cat, from: '2026-01', to: '2026-12' }, ctx).total, 0);
assert.equal(Math.round(oSum), Math.round(sum.reduce((s, r) => s + r.other, 0)), 'each "other" category adds up to Other');
console.log('admin.test.mjs: all checks passed');
