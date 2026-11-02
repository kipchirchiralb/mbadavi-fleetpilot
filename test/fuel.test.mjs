/* Fuel account: top-ups, opening balance, fills, monthly balance, repeats, Pages. Run: node fuel.test.mjs */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyze, decide } from '../src/importer/index.js';
import { mergeImport } from '../src/importer/merge.js';
import { fuelPosition, fuelAccountMonths, fuelLedger, fuelRepeats } from '../src/fuelAccount.js';
import { drillRecords, pagesHtml, pagesClick } from '../src/pages.js';
const W = JSON.parse(fs.readFileSync(new URL('./workbook.json', import.meta.url), 'utf8'));
const fresh = () => ({ vehicles:[],drivers:[],clients:[],bookings:[],rentals:[],expenses:[],payments:[],invoices:[],accounts:[],loans:[],insurance:[],chama:[],fuelAccount:[],settings:{},nextId:1 });
const fmt = n => String(n);

/* 1. read: nothing existing is dropped by default; top-ups and opening are read from the sheet */
const res = analyze(W, { today: '2026-10-24' });
assert.equal(res.data.fuelAccount.topups.length, 215);
assert.equal(res.data.fuelAccount.topups.reduce((s, t) => s + t.amount, 0), 1437400);
assert.equal(res.data.fuelAccount.opening.amount, -34773);
const fuelExp = res.data.expenses.filter(e => e.category === 'Fuel');
assert.equal(fuelExp.length, 433, 'all fuel fills still read, as before');
assert.equal(res.checks.filter(c => c.group === 'Fuel' && /top-ups/.test(c.label) && !c.ok).length, 0, 'every monthly top-up total matches the sheet');
const reps = res.review.filter(r => r.code === 'FUEL_REPEAT');
assert.equal(reps.length, 20); assert.equal(reps.filter(r => r.severity === 'high').length, 13);
assert.ok(reps.every(r => r.choices.some(c => c.remove) && r.choices.some(c => c.keep)), 'each repeat offers remove and keep');

/* 2. merge: top-ups stored once, second import adds nothing */
const db = fresh(); mergeImport(db, res, { today: '2026-10-24' });
assert.equal(db.fuelAccount.filter(x => x.kind === 'topup').length, 215);
assert.equal(db.fuelAccount.filter(x => x.kind === 'opening').length, 1);
const again = mergeImport(db, analyze(W, { today: '2026-10-24' }), { today: '2026-10-24' });
assert.equal(db.fuelAccount.length, 216, 'no duplicate top-ups on a second import');
assert.equal(again.added.fuelTopups || 0, 0);
assert.equal(db.expenses.filter(x => x.category === 'Fuel').length, 433);

/* 3. the owner's decision: removing the 13 exact repeats changes fills only, and the sheet's own closing totals then agree more */
let state = { overrides: {}, ignores: [] };
reps.filter(r => r.severity === 'high').forEach(r => { state = decide(state, r, r.choices.find(c => c.remove)); });
const res2 = analyze(W, { today: '2026-10-24', overrides: state.overrides, ignores: state.ignores });
assert.equal(res2.data.expenses.filter(e => e.category === 'Fuel').length, 420);
assert.equal(res2.review.filter(r => r.code === 'FUEL_REPEAT').length, 7, 'the 7 undecided stay for the owner');
const feb = r => r.checks.find(c => c.label === 'FUEL closing row 188 - spent').diff;
assert.equal(feb(res), 31803, 'as read today the sheet closing for the Feb block is 31,803 higher (all 15 repeated lines)');
assert.equal(feb(res2), 8363, 'removing the 13 exact repeats leaves the 7 other positive lines (8,363)');
let stAll = { overrides: {}, ignores: [] };
res.review.filter(r => r.code === 'FUEL_REPEAT').forEach(r => { stAll = decide(stAll, r, r.choices.find(c => c.remove)); });
assert.equal(feb(analyze(W, { today: '2026-10-24', overrides: stAll.overrides, ignores: stAll.ignores })), 0, 'removing all repeated positive lines makes the sheet total match exactly');
const db2 = fresh(); mergeImport(db2, res2, { today: '2026-10-24' });
assert.equal(db2.expenses.filter(x => x.category === 'Fuel').length, 420);
assert.equal(db2.fuelAccount.length, 216, 'top-ups are unaffected by the decision');

/* 4. balance = opening + paid in - taken; months chain; the ledger of a month ends on that month's closing */
assert.equal(fuelPosition(db).taken, 0, 'old untagged fills are NOT counted as Ola'); assert.equal(fuelPosition(db).nUntagged, 433);
db.expenses.filter(x => x.category === 'Fuel').forEach(x => { x.account = 'Ola'; });   // the owner tags them
const pos = fuelPosition(db);
const taken = db.expenses.filter(x => x.category === 'Fuel').reduce((s, x) => s + x.amount, 0);
assert.equal(pos.paidIn, 1437400); assert.equal(pos.opening, -34773); assert.equal(pos.taken, taken);
assert.equal(pos.balance, -34773 + 1437400 - taken);
const months = fuelAccountMonths(db, '2026-10');
for(let i = 1; i < months.length; i++) assert.equal(months[i].opening, months[i - 1].closing, 'month ' + months[i].month + ' starts where the last ended');
assert.equal(months[0].opening, -34773);
const datedTaken = months.reduce((s, m) => s + m.fills, 0);
assert.equal(months[months.length - 1].closing, -34773 + 1437400 - datedTaken);
assert.equal(datedTaken + pos.undatedAmount, taken, 'undated fills are reported, not lost');
let ledgerLines = 0;
months.forEach(m => { const L = fuelLedger(db, m.month); ledgerLines += L.entries.length;
  assert.equal(L.entries.length ? L.entries[L.entries.length - 1].balance : L.opening, m.closing, m.month + ' ledger ends on closing');
  assert.equal(L.paidIn, m.topups); assert.equal(L.taken, m.fills); });
assert.equal(ledgerLines, 215 + db.expenses.filter(x => x.category === 'Fuel' && x.date).length);

/* 5. the repeats panel finds the same 13 exact repeats; nothing is removed by looking */
assert.ok(fuelRepeats(db).length >= 13);
assert.equal(fuelRepeats(db2).length, fuelRepeats(db).length - 13);

/* 6. Pages: figures equal the records behind them, the page draws, edits keep the balance in step */
const ctx = { fmt, paidFor: () => 0 };
months.forEach(m => assert.equal(drillRecords(db, { col: 'fuelTopups', from: m.month, to: m.month }, ctx).total, m.topups));
assert.equal(drillRecords(db, { col: 'fuelTopups', from: '2026-01', to: '2026-10' }, ctx).total, 1437400);
months.forEach(m => assert.equal(drillRecords(db, { col: 'fuel', from: m.month, to: m.month }, ctx).total, m.fills));
const html = pagesHtml(db, { page: 'fuel', month: '2026-03' }, ctx);
['Balance with the station', 'Balance brought forward', 'March 2026', 'Fuel taken by car', 'looks entered twice', 'look entered twice'].some(k => html.includes(k));
assert.ok(html.includes('Balance with the station') && html.includes('Balance brought forward') && html.includes('March 2026') && html.includes('Fuel taken by car'));
assert.ok(html.includes('entered twice'));
assert.ok(pagesHtml(fresh(), { page: 'fuel' }, ctx).includes('No fuel recorded yet'), 'empty database still draws');

/* add / edit / delete a top-up through the page's own handlers */
global.window = { confirm: () => true };
const mkBtn = (pg, data, form) => ({ target: { closest: s => s === '[data-pg]' ? { dataset: Object.assign({ pg }, data), closest: () => form } : null } });
const mkForm = vals => ({ querySelector: sel => ({ value: vals[/data-f="(\w+)"/.exec(sel)[1]] }) });
let redraws = 0, dirty = 0;
const actx = Object.assign({}, ctx, { db: () => db, uid: () => db.nextId++, toast: () => {}, markDirty: () => dirty++, guard: (d, l, cb) => cb(), redraw: () => redraws++, removeExpense: (id, cb) => { db.expenses = db.expenses.filter(e => e.id != id); cb(); } });
const st = { page: 'fuel', month: '2026-10' };
const before = fuelPosition(db).balance;
pagesClick(mkBtn('topupsave', {}, mkForm({ date: '2026-10-23', amount: '7000', note: 'test' })), st, actx);
assert.equal(fuelPosition(db).balance, before + 7000); assert.equal(fuelPosition(db).nTop, 216);
const added = db.fuelAccount.find(x => x.note === 'test');
st.fuelEdit = added.id; pagesClick(mkBtn('topupsave', {}, mkForm({ date: '2026-10-23', amount: '9000', note: 'test' })), st, actx);
assert.equal(fuelPosition(db).balance, before + 9000);
pagesClick(mkBtn('topupsave', {}, mkForm({ date: '2026-10-23', amount: '-5', note: '' })), { page: 'fuel' }, actx);
assert.equal(fuelPosition(db).balance, before + 9000, 'a negative top-up is refused');
pagesClick(mkBtn('topupdel', { id: added.id }), st, actx);
assert.equal(fuelPosition(db).balance, before, 'deleting the top-up restores the balance');
const grp = fuelRepeats(db)[0], later = grp[1];
pagesClick(mkBtn('fillremove', { id: later.id }), st, actx);
assert.equal(fuelPosition(db).taken, taken - later.amount, 'deleting a repeated fill lowers fuel taken by exactly that fill');
assert.ok(db.expenses.some(e => e.id === grp[0].id), 'the first of the pair is kept');
assert.ok(redraws >= 4 && dirty >= 3);
console.log('fuel account tests passed:', months.length, 'months,', ledgerLines, 'ledger lines');
