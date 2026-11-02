/* Run from the test folder: node import-save.test.mjs
   Import twice adds nothing; an edited record is never overwritten; the whole database saves, reopens and imports again with no duplicates. */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createRequire } from 'node:module';
import { analyze } from '../src/importer/index.js'; import { mergeImport } from '../src/importer/merge.js'; import { isEdited } from '../src/importMarks.js';
const { createStore } = createRequire(import.meta.url)('../electron/ledgerFile.cjs');
let fails = 0; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if(!c) fails++; };
const res = analyze(JSON.parse(fs.readFileSync('workbook.json', 'utf8')), { today: '2026-10-24' });
const mk = () => ({ vehicles: [], drivers: [], clients: [], bookings: [], rentals: [], expenses: [], payments: [], invoices: [], accounts: [], loans: [], insurance: [], chama: [], fuelAccount: [], coops: [], individuals: [], driverAllowances: [], nextId: 1, settings: {} });
const counts = d => ['vehicles', 'clients', 'rentals', 'expenses', 'payments', 'invoices', 'coops', 'loans'].map(k => d[k].length).join(',');

const db = mk(); mergeImport(db, res, { today: '2026-10-24' }); const c1 = counts(db);
ok('first import adds records', db.rentals.length > 1000);
mergeImport(db, res, { today: '2026-10-25' });
ok('importing the same file again adds nothing', counts(db) === c1);

/* an edited record is never overwritten or removed by a later import */
const self = db.rentals.find(r => r.type === 'self'); const walk = db.rentals.find(r => r.type === 'walkin' && r.xlRef);
ok('a record just imported is not "edited"', !isEdited(db, 'rentals', walk));
walk.amount = 1234; walk.notes = 'changed by hand';
ok('after you change it, it counts as edited', isEdited(db, 'rentals', walk));
const before = JSON.stringify(walk); db.rentals.forEach(r => { if(r === self) r.type = 'walkin'; });   // simulate an old import that left a SELF rental as walk-in
self.notes = 'mine'; self.type = 'walkin';
mergeImport(db, res, { today: '2026-10-26' });
ok('re-import leaves an edited rental exactly as you left it', JSON.stringify(db.rentals.find(r => r.id === walk.id)) === before);
ok('an edited rental is not retyped by the import', db.rentals.find(r => r.id === self.id).type === 'walkin');
ok('still no duplicates', counts(db) === c1);

/* save, close, open again, import again */
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-')); const s = createStore({ root });
ok('the imported database saves', (await s.save('Main', db)).ok);
const re = (await createStore({ root }).load('Main')).data;
ok('and reopens with every record', counts(re) === counts(db));
ok('the marks survive, so an edited record is still protected', isEdited(re, 'rentals', re.rentals.find(r => r.id === walk.id)));
mergeImport(re, res, { today: '2026-10-27' });
ok('importing again after reopening adds no duplicates', counts(re) === c1);
console.log(fails ? fails + ' FAILED' : 'import-save tests passed'); process.exit(fails ? 1 : 0);
