/* Run: node test/dbstore.test.mjs   (needs no Electron: the desktop store is plain Node) */
import { createRequire } from 'module';
import fs from 'fs'; import os from 'os'; import path from 'path';
const require = createRequire(import.meta.url);
const { createStore, CURRENT_FORMAT } = require('../electron/ledgerFile.cjs');

let fails = 0; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if(!c) fails++; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fp-'));
const ledger = (n, extra) => Object.assign({ vehicles: Array.from({ length: n }, (_, i) => ({ id: i + 1, reg: 'KAA ' + i })), drivers: [], clients: [], rentals: [], expenses: [], payments: [], settings: { adminPin: 'x' }, nextId: n + 1 }, extra || {});
const at = iso => () => new Date(iso);

/* ---- save, close, open again ---- */
{
  const root = tmp(); let s = createStore({ root, now: at('2026-10-31T10:00:00') });
  const r = await s.save('Main', ledger(3));
  ok('save writes the database file', r.ok && fs.existsSync(path.join(root, 'databases', 'Main.fpdb.json')));
  ok('no temp file is left behind', !fs.readdirSync(path.join(root, 'databases')).some(n => n.endsWith('.tmp')));
  s = createStore({ root });                                   // "close and start again"
  const l = await s.load('Main');
  ok('reopened: the same records are there', l.ok && l.data.vehicles.length === 3 && l.data.settings.adminPin === 'x' && l.data.nextId === 4);
  ok('the list shows it with its record count', s.list()[0].name === 'Main' && s.list()[0].records === 3);
  ok('last used / start-with settings are kept', (s.setSettings({ lastUsed: 'Main' }), createStore({ root }).getSettings().lastUsed === 'Main' && createStore({ root }).getSettings().startWith === 'last'));
  const sy = s.saveSync('Main', ledger(5));
  ok('synchronous save (window closing) works', sy.ok && (await createStore({ root }).load('Main')).data.vehicles.length === 5);
}

/* ---- an update (new program version, same data folder) keeps the data ---- */
{
  const root = tmp(), program1 = tmp(), program2 = tmp();
  fs.writeFileSync(path.join(program1, 'app.exe'), 'old'); 
  const v20 = createStore({ root, appVersion: 'v21' }); await v20.save('Main', ledger(4));
  fs.rmSync(program1, { recursive: true }); fs.writeFileSync(path.join(program2, 'app.exe'), 'new');   // "install over": the program folder is replaced
  const v22 = createStore({ root, appVersion: 'v22' }); const l = await v22.load('Main');
  ok('after the program is replaced, the data is there at first start', l.ok && l.data.vehicles.length === 4);
  ok('the data folder is not inside the program folder', !root.startsWith(program1) && !root.startsWith(program2));
}

/* ---- format version: newer program upgrades an older file step by step, once-copy of the old file ---- */
{
  const root = tmp(); fs.mkdirSync(path.join(root, 'databases'), { recursive: true });
  const bare = ledger(2); fs.writeFileSync(path.join(root, 'databases', 'Old.fpdb.json'), JSON.stringify(bare));   // format 0: a bare ledger
  let s = createStore({ root }); const l = await s.load('Old');
  ok('a bare ledger (format 0) opens and is upgraded to the current format', l.ok && l.upgradedFrom === 0 && l.formatVersion === CURRENT_FORMAT);
  const written = JSON.parse(fs.readFileSync(path.join(root, 'databases', 'Old.fpdb.json'), 'utf8'));
  ok('the file now carries the format version', written.formatVersion === CURRENT_FORMAT && written.data.vehicles.length === 2);
  ok('one copy of the old file is kept, named with its version', fs.existsSync(path.join(root, 'copies', 'Old - old format v0.fpdb.json')));
  await createStore({ root }).load('Old');
  ok('opening again does not make another copy', fs.readdirSync(path.join(root, 'copies')).filter(n => /old format/.test(n)).length === 1);
}
{
  const root = tmp(), steps = [];
  const upgrades = { 0: d => d, 1: d => { steps.push(1); d.step1 = true; return d; }, 2: d => { steps.push(2); d.step2 = d.step1 === true; return d; } };
  const v1 = createStore({ root, current: 1, upgrades }); await v1.save('Main', ledger(2));
  const v3 = createStore({ root, current: 3, upgrades }); const l = await v3.load('Main');
  ok('format 1 -> 3 runs step 1 then step 2, in order', l.ok && steps.join() === '1,2' && l.data.step1 === true && l.data.step2 === true && l.upgradedFrom === 1);
  ok('the old file is kept once, named with its version', fs.existsSync(path.join(root, 'copies', 'Main - old format v1.fpdb.json')));
  const before = fs.readFileSync(path.join(root, 'databases', 'Main.fpdb.json'), 'utf8');
  const v2 = createStore({ root, current: 2, upgrades });                // an OLDER program meets the format-3 file
  const refuse = await v2.load('Main');
  ok('an older program refuses a newer file with a plain message', !refuse.ok && refuse.reason === 'newer' && /newer version of FleetPilot/.test(refuse.message));
  const w = await v2.save('Main', ledger(9));
  ok('and never overwrites it', !w.ok && w.locked === true && fs.readFileSync(path.join(root, 'databases', 'Main.fpdb.json'), 'utf8') === before);
  ok('same for the synchronous save', v2.saveSync('Main', ledger(9)).ok === false && fs.readFileSync(path.join(root, 'databases', 'Main.fpdb.json'), 'utf8') === before);
  const bad = createStore({ root: tmp(), current: 2, upgrades: { 0: d => d } });
  fs.mkdirSync(path.join(bad.root, 'databases'), { recursive: true }); fs.writeFileSync(path.join(bad.root, 'databases', 'X.fpdb.json'), JSON.stringify({ format: 'fleetpilot-database', formatVersion: 1, data: ledger(1) }));
  ok('a missing upgrade step fails safely and leaves the file as it was', (await bad.load('X')).reason === 'upgrade-failed' && JSON.parse(fs.readFileSync(path.join(bad.root, 'databases', 'X.fpdb.json'), 'utf8')).formatVersion === 1);
}

/* ---- a damaged file is set aside, never overwritten ---- */
{
  const root = tmp(); const s = createStore({ root }); await s.save('Main', ledger(2));
  fs.writeFileSync(path.join(root, 'databases', 'Main.fpdb.json'), '{"format":"fleetpilot-database","formatVersion":1,"data":{"vehicles":[');   // cut short
  const l = await createStore({ root }).load('Main');
  ok('a file that cannot be read is reported as damaged', !l.ok && l.reason === 'damaged');
  ok('it is moved to the damaged folder, so nothing can overwrite it', l.setAside && fs.existsSync(l.setAside) && !fs.existsSync(path.join(root, 'databases', 'Main.fpdb.json')));
}

/* ---- one safety copy per month ---- */
{
  const root = tmp(); let clock = new Date('2026-10-05T09:00:00'); const s = createStore({ root, now: () => clock });
  const first = await s.save('Main', ledger(1));
  ok('a brand new database gets this month\'s copy right away', first.monthlyCopy === 'Main - monthly 2026-10.fpdb.json');
  clock = new Date('2026-10-20T09:00:00'); const again = await s.save('Main', ledger(2));
  ok('later saves in the same month make no new copy', again.monthlyCopy === '' && s.copies().length === 1);
  clock = new Date('2026-11-01T08:30:00'); const nov = await s.save('Main', ledger(3));
  ok('the first save of a new month makes the copy', nov.monthlyCopy === 'Main - monthly 2026-11.fpdb.json');
  const copy = JSON.parse(fs.readFileSync(path.join(root, 'copies', 'Main - monthly 2026-11.fpdb.json'), 'utf8'));
  ok('the copy holds the file as it stood before that save (2 cars, not 3)', copy.data.vehicles.length === 2);
  clock = new Date('2026-11-02T08:30:00'); await s.save('Main', ledger(4));
  ok('exactly one copy per month: two months, two copies', s.copies().filter(c => c.kind === 'monthly').length === 2);
  const rc = s.readCopy('Main - monthly 2026-11.fpdb.json');
  ok('a copy can be read back for Recover an earlier copy', rc.ok && rc.data.vehicles.length === 2);
  ok('a copy name that points outside the folder is refused', !s.readCopy('..\\..\\settings.json').ok && !s.readCopy('../x.fpdb.json').ok);
  const dmg = tmp(); const s2 = createStore({ root: dmg, now: () => new Date('2026-12-01T08:00:00') });
  fs.mkdirSync(path.join(dmg, 'databases'), { recursive: true }); fs.writeFileSync(path.join(dmg, 'databases', 'Main.fpdb.json'), 'garbage');
  await s2.save('Main', ledger(1));
  ok('a damaged file is never kept as the monthly copy', !s2.copies().some(c => c.db === 'Main' && c.records === 0 && c.size < 50));
}

/* ---- a file that is briefly locked is retried quietly ---- */
{
  const root = tmp(); let failRenames = 2, renames = 0; const fsx = Object.assign({}, fs, { renameSync: (a, b) => { renames++; if(failRenames-- > 0){ const e = new Error('busy'); e.code = 'EBUSY'; throw e; } return fs.renameSync(a, b); } });
  const s = createStore({ root, fs: fsx, sleep: async () => {} });
  const r = await s.save('Main', ledger(2));
  ok('two short locks in a row: the save still succeeds', r.ok && renames === 3 && (await createStore({ root }).load('Main')).data.vehicles.length === 2);
  failRenames = 99; const prev = fs.readFileSync(path.join(root, 'databases', 'Main.fpdb.json'), 'utf8');
  const r2 = await s.save('Main', ledger(7));
  ok('a lock that stays: a plain message and the old file is untouched', !r2.ok && /not letting FleetPilot write/.test(r2.error) && fs.readFileSync(path.join(root, 'databases', 'Main.fpdb.json'), 'utf8') === prev);
  failRenames = 0; const r3 = await s.save('Main', ledger(7));
  ok('when the lock goes the next save works', r3.ok);
  const full = createStore({ root: tmp(), fs: Object.assign({}, fs, { openSync: () => { const e = new Error('x'); e.code = 'ENOSPC'; throw e; } }), sleep: async () => {} });
  ok('disk full is reported in plain words', /disk is full/.test((await full.save('Main', ledger(1))).error));
}

/* ---- several databases ---- */
{
  const root = tmp(); const s = createStore({ root });
  await s.save('Main', ledger(2)); const c = await s.create('Test books', ledger(1));
  ok('a second database can be created', c.ok && s.list().map(x => x.name).join() === 'Main,Test books');
  ok('creating one with a used name (any letter case) is refused and changes nothing', !(await s.create('main', ledger(9))).ok && (await s.load('Main')).data.vehicles.length === 2);
  ok('a name with forbidden characters is cleaned', s.cleanName('a/b:c*?') === 'a b c');
}
const free = createStore({ root: tmp() }).diskFree(); ok('free disk space can be read (or is null on an old Electron)', free === null || free > 0);
console.log(fails ? fails + ' FAILED' : 'dbstore tests passed'); process.exit(fails ? 1 : 0);
