/* One fuel / driver figure per rental, Coop table figures, Sub-hire one-off cars. Run: node fuelcore.test.mjs */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyze } from '../src/importer/index.js';
import { mergeImport } from '../src/importer/merge.js';
import { rentalFuel, rentalDriver, addFill, fuelByCar, fuelAudit, rentalForFill, fillAccount } from '../src/fuelCore.js';
import { fuelPosition } from '../src/fuelAccount.js';
import { coopFigures, saveFromRental, dateRangeText, VAT } from '../src/coop.js';
import { ownerRows, vehiclePerformance, ownerSummary } from '../src/subhireCore.js';
const W = JSON.parse(fs.readFileSync(new URL('./workbook.json', import.meta.url), 'utf8'));
const db = { vehicles:[],drivers:[],clients:[],bookings:[],rentals:[],expenses:[],payments:[],invoices:[],accounts:[],loans:[],insurance:[],chama:[],fuelAccount:[],coops:[],settings:{},nextId:1 };
mergeImport(db, analyze(W, { today: '2026-10-24' }), { today: '2026-10-24' });
let id = 900000; const uid = () => ++id;
const ok = (n, c) => { assert.ok(c, n); console.log('PASS ' + n); };

const r = db.rentals.find(x => x.fuel > 0 && x.vehicleId && x.status !== 'Active');
const before = rentalFuel(db, r), pos0 = fuelPosition(db);
ok('rental fuel before = carried fuel', before === r.fuel);
ok('old fills are untagged and not counted as Ola', fillAccount(db.expenses.find(x => x.category === 'Fuel')) === '' && pos0.taken === 0 && pos0.nUntagged > 400);
const res = addFill(db, uid, { date: r.pickup, rentalId: r.id, account: 'Outside', amount: 2500 });
ok('fill tied to a rental adds to it at once, once', res.ok && rentalFuel(db, r) === before + 2500);
ok('Outside fill does not touch the Ola account', fuelPosition(db).taken === 0 && fuelPosition(db).outside === 2500);
const r2 = addFill(db, uid, { date: r.pickup, rentalId: r.id, account: 'Ola', amount: 1000 });
ok('Ola fill draws the Ola balance down', fuelPosition(db).taken === 1000 && fuelPosition(db).balance === pos0.balance - 1000 && rentalFuel(db, r) === before + 3500);
ok('mirror expense of rental.fuel is not added twice', (() => { db.expenses.push({ id: uid(), category: 'Fuel', source: 'rental', rentalId: r.id, vehicleId: r.vehicleId, date: r.pickup, amount: r.fuel }); return rentalFuel(db, r) === before + 3500; })());
ok('fuel per car splits Ola / Outside', (() => { const o = fuelByCar(db).find(x => String(x.vehicleId) === String(r.vehicleId)); return o.outside >= 2500 && o.ola >= 1000 && o.total === o.ola + o.outside + o.untagged; })());
ok('audit lists the rental with carried + fills', (() => { const a = fuelAudit(db).find(x => x.rentalId === r.id); return a.total === before + 3500 && a.extra === 3500 && a.carried === before; })());
ok('fill dated in the rental finds the rental', String(rentalForFill(db, r.vehicleId, r.pickup)) !== '' );
ok('refuses a fill with no amount or car', !addFill(db, uid, { date: '2026-01-01', amount: 0 }).ok && !addFill(db, uid, { date: '2026-01-01', amount: 10 }).ok);

/* driver pay */
const rd = db.rentals.find(x => x.days > 0);
rd.driverRate = 1000; rd.driverStatus = ''; ok('driver pay = rate x days', rentalDriver(rd) === 1000 * rd.days);
rd.driverStatus = 'cancelled'; ok('cancelled driver job costs nothing', rentalDriver(rd) === 0); rd.driverStatus = ''; rd.driverRate = 0;

/* coop table: pick a coop rental */
const cr = db.rentals.find(x => x.type === 'coop' && x.vehicleId && x.status !== 'Cancelled');
const sv = saveFromRental(db, uid, { rentalId: cr.id, name: 'Test Staff', department: 'Sales', kmOut: 1000, kmIn: 1150, contract: 'C-1' });
const c = db.coops.find(x => String(x.rentalId) === String(cr.id));
ok('coop line saved from a rental', sv.ok && c.name === 'TEST STAFF' && c.department === 'SALES' && cr.contract === 'C-1');
addFill(db, uid, { date: cr.pickup, rentalId: cr.id, account: 'Ola', amount: 700 });
cr.allowance = 1500; cr.driverRate = 500; cr.driverStatus = '';
const g = coopFigures(db, c, false), gv = coopFigures(db, c, true);
ok('coop fuel = the rental fuel (same single figure)', g.fuel === rentalFuel(db, cr) && g.fuel >= 700);
ok('coop driver / allowance come from the rental', g.driver === 500 * cr.days && g.allowance === 1500);
ok('total = charge + fuel + driver + allowance', g.total === g.base + g.fuel + g.driver + g.allowance && g.km === 150);
ok('VAT view changes the display only, database keeps the rate', gv.charge === Math.round(c.amount * (1 + VAT) * 100) / 100 && gv.base === g.base && c.amount === g.base);
ok('dates like the client sheet', dateRangeText('2026-09-01', '2026-09-03') === '01-03/09/2026' && dateRangeText('2026-08-31', '2026-09-11') === '31/08-11/09/2026' && dateRangeText('2026-09-01', '2026-09-01') === '01/09/2026');

/* one-off sub-hire car: its own vehicle, stays a sub-hire, own line, cost deducted */
const v = { id: uid(), reg: 'Prado, one-off', make: '', model: '', rate: 0, owner: 'Joe', ownership: 'subhire', ownerCost: 0, oneOff: true }; db.vehicles.push(v);
const cl = db.clients[0];
const ro = { id: uid(), vehicleId: v.id, clientId: cl.id, pickup: '2026-10-05', return: '2026-10-07', days: 3, amount: 30000, status: 'Returned', fuel: 0, subhireCost: 18000, type: 'walkin', subhireStatus: 'notcleared' }; db.rentals.push(ro);
addFill(db, uid, { date: '2026-10-06', rentalId: ro.id, account: 'Outside', amount: 2000 });
const rows = ownerRows(db).filter(x => x.reg === 'Prado, one-off');
ok('one-off car is a sub-hire line with its own description', rows.length === 1 && rows[0].cost === 18000 && rows[0].fuel === 2000);
const perf = vehiclePerformance(db, '2026-10').find(x => x.reg === 'Prado, one-off');
ok('its sub-hire cost and fuel are deducted', perf.net === 30000 - 18000 - 2000);
console.log('fuelcore tests passed');
