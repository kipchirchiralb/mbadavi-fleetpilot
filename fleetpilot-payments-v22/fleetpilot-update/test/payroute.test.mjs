/* Payments router: every category lands in the right place, the date is saved there, totals move once (never twice), undo restores. Run from the test folder. */
import fs from 'node:fs';
import { analyze } from '../src/importer/index.js';
import { mergeImport } from '../src/importer/merge.js';
import { monthlySummary } from '../src/summary.js';
import { fuelPosition } from '../src/fuelAccount.js';
import { driverRows, ownerRows, driverAmount } from '../src/subhireCore.js';
import { loanTotals, scheduleOf, paidOf } from '../src/loans.js';
import { check, post, validate, unified, removeEntry, owedOn, unpaidRentals, invoiceRentals, unclearedDriverJobs, unclearedOwnerJobs, chamaSlots } from '../src/payRoute.js';
const W = JSON.parse(fs.readFileSync('workbook.json', 'utf8'));
let fail = 0; const ok = (name, c, extra) => { console.log((c ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if(!c) fail++; };
const res = analyze(W, { today: '2026-10-24' });
const db = { vehicles: [], drivers: [], clients: [], bookings: [], rentals: [], expenses: [], payments: [], invoices: [], accounts: [], loans: [], insurance: [], chama: [], fuelAccount: [], coops: [], individuals: [], settings: {}, nextId: 1 };
mergeImport(db, res, { today: '2026-10-24' });
const uid = () => db.nextId++;
const D = '2026-10-20', M = '2026-10';
const run = spec => { let s = Object.assign({ method: 'Cash', note: '', ans: {} }, spec); for(let i = 0; i < 6; i++){ const e = validate(db, s); if(e) return { err: e }; const q = check(db, s); if(!q) break; s = Object.assign({}, s, { ans: Object.assign({}, s.ans, q.options[0].ans), asked: (s.asked || []).concat(q.code) }); } return Object.assign(post(db, s, uid), { asked: s.asked || [] }); };
const sum = (m, k) => (monthlySummary(db, m, m)[0] || {})[k] || 0;
const veh = db.vehicles.find(v => v.ownership !== 'subhire') || db.vehicles[0];

/* validation */
ok('needs a date', !!validate(db, { dir: 'out', cat: 'x:Airport', amount: 300, date: '' }));
ok('needs an amount', !!validate(db, { dir: 'out', cat: 'x:Airport', amount: 0, date: D }));

/* airport 300: lands in Expenses, in the Overview column, once */
const a0 = sum(M, 'airport'); const nExp = db.expenses.length;
let r = run({ dir: 'out', cat: 'x:Airport', date: D, amount: 300, vehicleId: veh.id });
ok('airport 300 recorded', r.ok && db.expenses.length === nExp + 1 && db.expenses.at(-1).date === D && db.expenses.at(-1).category === 'Airport');
ok('Overview airport column moved by 300, not 600', sum(M, 'airport') - a0 === 300);
r = run({ dir: 'out', cat: 'x:Airport', date: D, amount: 300, vehicleId: veh.id });
ok('same payment again asks first (duplicate)', r.asked.includes('duplicate'));
ok('airport without a car asks "office?"', run({ dir: 'out', cat: 'x:Garage', date: D, amount: 111, vehicleId: '' }).asked.includes('no-car'));

/* rent 7000 */
const rent0 = sum(M, 'rent'); r = run({ dir: 'out', cat: 'rent', date: D, amount: 7000, month: M });
ok('rent 7000 recorded as Rent with date', r.ok && db.expenses.at(-1).category === 'Rent' && db.expenses.at(-1).date === D);
ok('rent column for the month is 7000 (replaces standing rent, not added to it)', sum(M, 'rent') >= 7000 && sum(M, 'rent') - rent0 <= 7000, sum(M, 'rent') + ' was ' + rent0);

/* fuel: topup is NOT an expense; fill is */
const fp0 = fuelPosition(db), fuelCol0 = sum(M, 'fuel');
r = run({ dir: 'out', cat: 'fuel', date: D, amount: 5000, vehicleId: '' });
ok('fuel asks which kind, answer top-up', r.asked.includes('fuel-kind') && db.fuelAccount.at(-1).kind === 'topup' && db.fuelAccount.at(-1).date === D);
ok('top-up raises the account by 5000 and is not an expense', fuelPosition(db).balance - fp0.balance === 5000 && sum(M, 'fuel') === fuelCol0);
r = run({ dir: 'out', cat: 'fuel', date: '2026-10-21', amount: 2000, vehicleId: veh.id, ans: { fuelKind: 'fill' } });
ok('fill is an expense and lowers the account', sum(M, 'fuel') - fuelCol0 === 2000 && fuelPosition(db).balance - fp0.balance === 3000);

/* sub-hire driver: ticks Paid with the date, adds no expense (the imported jobs are all Paid, so put some back to Not cleared first) */
driverRows(db).filter(x => x.status === 'paid' && x.rate > 0).slice(0, 3).forEach(x => { const rr = db.rentals.find(q => q.id === x.id); rr.driverStatus = 'notcleared'; rr.driverStatusDate = ''; });
ownerRows(db).filter(x => x.status === 'paid' && x.cost > 0).slice(0, 2).forEach(x => { const rr = db.rentals.find(q => q.id === x.id); rr.subhireStatus = 'notcleared'; rr.subhirePaid = false; rr.subhirePaidDate = ''; });
const drv = driverRows(db).find(x => x.status === 'notcleared' && x.rate > 0);
const expBefore = db.expenses.length, drvTotalBefore = driverRows(db).reduce((s, x) => s + (x.status === 'cancelled' ? 0 : x.amount), 0);
r = run({ dir: 'out', cat: 'driver', date: D, amount: drv.amount, jobIds: [drv.id] });
const after = driverRows(db).find(x => x.id === drv.id);
ok('driver job is Paid with the date typed', r.ok && after.status === 'paid' && after.statusDate === D);
ok('no expense added and driver cost unchanged (not counted twice)', db.expenses.length === expBefore && driverRows(db).reduce((s, x) => s + (x.status === 'cancelled' ? 0 : x.amount), 0) === drvTotalBefore);
const drv2 = driverRows(db).find(x => x.status === 'notcleared' && x.rate > 0);
r = run({ dir: 'out', cat: 'driver', date: D, amount: drv2.amount + 500, jobIds: [drv2.id] });
ok('amount different from the job asks first', r.asked.includes('sum-differs') && driverRows(db).find(x => x.id === drv2.id).status === 'paid');

/* owner */
const own = ownerRows(db).find(x => x.status === 'notcleared' && x.cost > 0);
r = run({ dir: 'out', cat: 'owner', date: D, amount: own.cost, jobIds: [own.id] });
ok('owner job Paid with date', r.ok && ownerRows(db).find(x => x.id === own.id).status === 'paid' && ownerRows(db).find(x => x.id === own.id).statusDate === D);

/* loan */
const loan = db.loans.find(l => scheduleOf(l).some(s => s.amount > 0 && paidOf(s) < s.amount));
const cell = scheduleOf(loan).find(s => s.amount > 0 && paidOf(s) < s.amount), t0 = loanTotals(loan);
r = run({ dir: 'out', cat: 'loan', date: D, amount: cell.amount - paidOf(cell), loanId: loan.id, month: cell.month });
const c2 = scheduleOf(loan).find(s => s.month === cell.month);
const cellLeft = cell.amount - paidOf(cell);
ok('loan instalment paid, with date', r.ok && paidOf(c2) === c2.amount && c2.paidDate === D);
ok('loan balance fell by exactly the payment', t0.balance - loanTotals(loan).balance === cellLeft, t0.balance + ' -> ' + loanTotals(loan).balance);
const cell3 = scheduleOf(loan).find(s => s.amount > 0 && paidOf(s) < s.amount && s.month !== cell.month);
if(cell3){ const b0 = loanTotals(loan).balance; r = run({ dir: 'out', cat: 'loan', date: D, amount: 100, loanId: loan.id, month: cell3.month });
  ok('part payment asks, then records 100 with date', r.asked.includes('loan-part') && b0 - loanTotals(loan).balance === 100 && scheduleOf(loan).find(s => s.month === cell3.month).paidDate === D); }

/* individual */
const ppl = db.individuals.map(x => x.person)[0]; const bal = p => db.individuals.filter(x => x.person === p).reduce((s, x) => s + x.amount, 0);
const b0 = bal(ppl); r = run({ dir: 'out', cat: 'individual', date: D, amount: 10000, person: ppl });
ok('paying an individual lowers their balance by 10000 with date', r.ok && b0 - bal(ppl) === 10000 && db.individuals.at(-1).date === D);
r = run({ dir: 'in', cat: 'individual', date: D, amount: 4000, person: ppl, note: 'lent again' });
ok('money in from an individual raises it', bal(ppl) === b0 - 10000 + 4000);
ok('a name close to a person asks "same person?"', run({ dir: 'out', cat: 'individual', date: D, amount: 1, person: ppl.slice(0, 2) }).asked.includes('new-person') || ppl.length < 3);

/* insurance, chama */
const nIns = db.insurance.length; r = run({ dir: 'out', cat: 'insurance', date: D, amount: 9000, vehicleId: veh.id });
ok('insurance recorded with paid date, asks for expiry', r.ok && db.insurance.length === nIns + 1 && db.insurance.at(-1).paidDate === D && r.asked.includes('no-expiry'));
ok('insurance shows in the Overview month', sum(M, 'insurance') >= 9000);
const slot = chamaSlots(db)[0]; if(slot){ r = run({ dir: 'out', cat: 'chama', date: D, amount: slot.amount, chamaId: slot.id }); ok('chama slot ticked with the date', r.ok && db.chama.find(c => c.id === slot.id).paid && db.chama.find(c => c.id === slot.id).paidDate === D); }

/* allowance */
const rent = db.rentals.find(x => x.status !== 'Cancelled' && !x.allowance); r = run({ dir: 'out', cat: 'allowance', date: D, amount: 1500, rentalId: rent.id });
ok('allowance saved on the rental with its date', r.ok && rent.allowance === 1500 && rent.allowanceDate === D);

/* ---- money in ---- */
const rental = unpaidRentals(db)[0]; const owed = owedOn(db, rental);
r = run({ dir: 'in', cat: 'rental', date: D, amount: owed, rentalId: rental.id });
ok('rental paid in full -> owed 0, payment dated', r.ok && owedOn(db, rental) === 0 && db.payments.at(-1).date === D);
const rental2 = unpaidRentals(db).find(x => owedOn(db, x) > 500);
r = run({ dir: 'in', cat: 'rental', date: D, amount: owedOn(db, rental2) + 700, rentalId: rental2.id });
ok('over-payment asks; extra kept as not linked', r.asked.includes('over') && owedOn(db, rental2) === 0 && db.payments.at(-1).rentalId === '' && db.payments.at(-1).amount === 700);
/* client, oldest first, several rentals */
const byClient = {}; unpaidRentals(db).forEach(x => (byClient[x.clientId] = byClient[x.clientId] || []).push(x));
const cid = Object.keys(byClient).find(k => byClient[k].length >= 2); const rs = byClient[cid]; const o1 = owedOn(db, rs[0]), o2 = owedOn(db, rs[1]);
const nPay = db.payments.length; r = run({ dir: 'in', cat: 'client', date: D, amount: o1 + Math.min(o2, 100), clientId: cid });
ok('client payment asks which rental, goes oldest first, one line per rental', r.asked.includes('client-several') && owedOn(db, rs[0]) === 0 && db.payments.length === nPay + 2, 'lines ' + (db.payments.length - nPay));
/* invoice */
const inv = db.invoices.find(i => invoiceRentals(db, i.no).some(x => owedOn(db, x) > 0));
if(inv){ const owedInv = invoiceRentals(db, inv.no).reduce((s, x) => s + owedOn(db, x), 0); r = run({ dir: 'in', cat: 'invoice', date: D, amount: owedInv, invoiceNo: inv.no });
  ok('invoice paid in full clears its rentals', r.ok && invoiceRentals(db, inv.no).every(x => owedOn(db, x) === 0)); }
/* ochwada both ways */
const oc0 = db.accounts.length; r = run({ dir: 'in', cat: 'ochwada', date: D, amount: 3000, note: 'cash' }); const r2 = run({ dir: 'out', cat: 'ochwada', date: D, amount: 1200, note: 'paid for him' });
ok('OCHWADA payment (-) and charge (+) with dates', db.accounts.length === oc0 + 2 && db.accounts.at(-2).amount === -3000 && db.accounts.at(-1).amount === 1200 && db.accounts.at(-1).date === D);
/* coop with no rental */
const coop = db.coops.find(c => c.status !== 'linked' && !c.rentalId); if(coop){ r = run({ dir: 'in', cat: 'coop', date: D, amount: 2500, coopId: coop.id }); ok('coop without a rental asks, keeps money not linked', r.asked.includes('coop-no-rental') && db.payments.at(-1).rentalId === ''); }
/* other */
r = run({ dir: 'in', cat: 'other', date: D, amount: 800, note: 'Joe, to link later' }); ok('other money in kept not linked', r.ok && db.payments.at(-1).rentalId === '');

/* ---- the one list ---- */
const U = unified(db);
ok('list has money in and money out', U.some(x => x.dir === 'in') && U.some(x => x.dir === 'out'));
ok('every row has a direction, category and amount', U.every(x => (x.dir === 'in' || x.dir === 'out') && x.cat && x.amount >= 0));
ok('new records appear in the list with their date', ['Airport', 'Rent', 'Fuel top-up', 'Sub-hire driver', 'Sub-hire owner', 'Loan', 'Insurance'].every(c => U.some(x => x.cat === c && x.date === D)));
ok('list is newest first', U.slice(0, 200).every((x, i, a) => !i || a[i - 1].sortKey >= x.sortKey));
/* undo */
const row = U.find(x => x.kind === 'driver' && x.date === D); const exp0 = db.expenses.length;
ok('undo a driver payment sets it back to Not cleared, date cleared', removeEntry(db, row) && driverRows(db).find(x => x.id === row.id).status === 'notcleared' && driverRows(db).find(x => x.id === row.id).statusDate === '');
const lrow = unified(db).find(x => x.kind === 'loan' && x.date === D); const lb = loanTotals(loan).balance; removeEntry(db, lrow);
ok('undo a loan payment puts the balance back', loanTotals(loan).balance > lb);
const arow = unified(db).find(x => x.cat === 'Airport' && x.date === D); removeEntry(db, arow); ok('undo an expense removes it (the repeated airport 300 was answered "record again", so one is left)', sum(M, 'airport') === a0 + 300);
console.log(fail ? fail + ' FAILED' : 'payment router tests passed'); process.exit(fail ? 1 : 0);
