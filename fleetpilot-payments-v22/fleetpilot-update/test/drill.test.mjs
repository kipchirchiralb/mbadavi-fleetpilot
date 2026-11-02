/* Every figure that can be tapped on Pilot (Loans, Insurance, Chama, OCHWADA, Sub-hire, Overview "Total spent") must equal the records listed behind it. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyze } from '../src/importer/index.js';
import { mergeImport } from '../src/importer/merge.js';
import { monthlySummary, SUMMARY_COLUMNS } from '../src/summary.js';
import { drillRecords } from '../src/pages.js';
import { scheduleOf, paidOf, loanTotals, persons, dueList, loanMonths, getCell } from '../src/loans.js';
import { ownerSummary, vehiclePerformance, driverSummary, monthsOf, ownerRows, driverRows } from '../src/subhireCore.js';
import { statement } from '../src/statement.js';
import { model, schemeNames } from '../src/chama.js';
const W = JSON.parse(fs.readFileSync(new URL('./workbook.json', import.meta.url), 'utf8'));
const res = analyze(W, { today: '2026-10-24' });
const db = { vehicles:[],drivers:[],clients:[],bookings:[],rentals:[],expenses:[],payments:[],invoices:[],accounts:[],loans:[],insurance:[],chama:[],individuals:[],settings:{},nextId:1 };
mergeImport(db, res, { today: '2026-10-24' });
const ctx = { fmt: n => String(n), paidFor: id => db.payments.filter(p => p.rentalId == id).reduce((s, p) => s + p.amount, 0) };
const num = v => Number(v) || 0; let n = 0;
const same = (label, figure, spec) => { const d = drillRecords(db, spec, ctx); assert.ok(Math.abs(d.total - figure) < 0.01, `${label}: figure ${figure} vs records ${d.total} (${JSON.stringify(spec)})`); assert.ok(d.rows.every(r => r.open && r.open.panel), label + ': a row cannot be opened'); n++; };

// Overview: Total spent per month and for the whole range
const rows = monthlySummary(db, '2025-01', '2026-12');
const sumCols = r => SUMMARY_COLUMNS.reduce((s, c) => s + num(r[c.key]), 0) + num(r.other);
rows.forEach(r => same('total ' + r.month, sumCols(r), { col: 'total', from: r.month, to: r.month }));
same('total all', rows.reduce((s, r) => s + sumCols(r), 0), { col: 'total', from: '2025-01', to: '2026-12' });

// Loans
db.loans.forEach(l => { const t = loanTotals(l);
  same('loan sched ' + l.id, t.scheduled, { col: 'loan', loanId: l.id, kind: 'scheduled' });
  same('loan paid ' + l.id, t.paid, { col: 'loan', loanId: l.id, kind: 'paid' });
  same('loan bal ' + l.id, t.balance, { col: 'loan', loanId: l.id, kind: 'balance' }); });
const allT = db.loans.reduce((a, l) => { const t = loanTotals(l); a.s += t.scheduled; a.p += t.paid; a.b += t.balance; return a; }, { s: 0, p: 0, b: 0 });
same('all sched', allT.s, { col: 'loanAll', kind: 'scheduled' }); same('all paid', allT.p, { col: 'loanAll', kind: 'paid' }); same('all bal', allT.b, { col: 'loanAll', kind: 'balance' });
loanMonths(db).forEach(m => { same('loan month ' + m, db.loans.reduce((s, l) => s + getCell(l, m), 0), { col: 'loanMonth', month: m, kind: 'due' });
  const due = dueList(db, m);
  same('due list due ' + m, due.reduce((s, r) => s + r.due, 0), { col: 'loanMonth', month: m, kind: 'due' });
  same('due list paid ' + m, due.reduce((s, r) => s + r.paid, 0), { col: 'loanMonth', month: m, kind: 'paid' });
  same('due list left ' + m, due.reduce((s, r) => s + r.left, 0), { col: 'loanMonth', month: m, kind: 'left' });
  due.forEach(r => same('due row ' + m + r.id, r.due, { col: 'loanMonth', month: m, loanId: r.id, kind: 'due' })); });
persons(db).forEach(p => same('person ' + p.name, p.balance, { col: 'person', person: p.name }));

// Insurance
const insTotal = db.insurance.reduce((s, i) => s + num(i.amount), 0);
same('ins total', insTotal, { col: 'insTab' });
const veh = new Set(db.insurance.map(i => i.vehicleId));
veh.forEach(v => same('ins car ' + v, db.insurance.filter(i => i.vehicleId == v).reduce((s, i) => s + num(i.amount), 0), { col: 'insTab', vehicleId: v || 'none' }));
new Set(db.insurance.map(i => (i.paidDate || '').slice(0, 7) || 'none')).forEach(m => same('ins month ' + m, db.insurance.filter(i => ((i.paidDate || '').slice(0, 7) || 'none') === m).reduce((s, i) => s + num(i.amount), 0), { col: 'insTab', month: m }));
const today = new Date().toISOString().slice(0, 10);
same('ins expired', db.insurance.filter(i => i.expiryDate && i.expiryDate < today).reduce((s, i) => s + num(i.amount), 0), { col: 'insTab', expired: true });

// OCHWADA, both ways of carrying the brought-forward figure
[true, false].forEach(carry => {
  const by = {}; db.accounts.filter(a => a.account === 'OCHWADA').forEach(a => { const b = by[a.month] = by[a.month] || { month: a.month, bf: null, entries: [], sheetTotal: null }; if(a.kind === 'bf') b.bf = num(a.amount); else b.entries.push(a); });
  const blocks = Object.values(by).sort((a, b) => a.month < b.month ? -1 : 1), st = statement(blocks, { carryBF: carry });
  st.forEach(s => ['opening', 'charges', 'payments', 'closing'].forEach(k => same('account ' + s.month + ' ' + k + ' carry=' + carry, s[k], { col: 'account', month: s.month, kind: k, carry })));
});

// Chama
schemeNames(db).forEach(name => { const m = model(db, name), all = db.chama.filter(c => c.scheme === name);
  same('chama saved ' + name, all.filter(c => c.paid).reduce((s, c) => s + num(c.amount), 0), { col: 'chama', scheme: name, kind: 'saved' });
  same('chama behind ' + name, all.filter(c => !c.paid && c.dueDate && c.dueDate <= today).reduce((s, c) => s + num(c.amount), 0), { col: 'chama', scheme: name, kind: 'behind' });
  for(let r = 1; r <= m.rounds; r++) same('chama round ' + name + r, m.roundEntries(r).filter(e => e.paid).reduce((s, e) => s + num(e.amount), 0), { col: 'chama', scheme: name, kind: 'round', round: r }); });

// Sub-hire
const sh = ownerRows(db), months = ['', ...monthsOf(sh)];
months.forEach(mo => {
  const owners = ownerSummary(db, mo), S = (k) => owners.reduce((s, o) => s + o[k], 0);
  ['cost', 'paid', 'notcleared', 'cancelled'].forEach(k => { same('sh all ' + k + mo, S(k), { col: 'shOwner', month: mo, kind: k }); owners.forEach(o => same('sh owner ' + o.key + k + mo, o[k], { col: 'shOwner', key: o.key, month: mo, kind: k })); });
  const cars = vehiclePerformance(db, mo);
  ['billed', 'ownerCost', 'driverPay', 'fuel', 'allowance', 'net'].forEach(f => { same('car all ' + f + mo, cars.reduce((s, c) => s + c[f], 0), { col: 'shCar', field: f, month: mo }); cars.forEach(c => same('car ' + c.reg + f + mo, c[f], { col: 'shCar', field: f, vehicleId: c.vehicleId || 'none', month: mo })); });
  const drv = driverSummary(db, mo);
  [['amount', 'amount'], ['paid', 'paid'], ['notcleared', 'notcleared'], ['cancelled', 'cancelled']].forEach(([k, f]) => { same('drv all ' + k + mo, drv.reduce((s, d) => s + d[f], 0), { col: 'shDriver', month: mo, kind: k }); drv.forEach(d => same('drv ' + d.driver + k + mo, d[f], { col: 'shDriver', driver: d.driver, month: mo, kind: k })); });
});
console.log('drill figures == records behind them: ' + n + ' checks passed');
