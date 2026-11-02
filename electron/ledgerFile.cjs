/* FleetPilot desktop side of the database. Runs in the Electron MAIN process.

   WHERE THE DATA LIVES (per user, never inside the program folder, so an update never touches it):
     %APPDATA%\FleetPilot\databases\<name>.fpdb.json        the database(s); one is shown at start
     %APPDATA%\FleetPilot\copies\                          one safety copy per month, and one copy of an old-format file before it is upgraded
     %APPDATA%\FleetPilot\damaged\                         a file that could not be read is set aside here, never overwritten
     %APPDATA%\FleetPilot\settings.json                    which database opens at start, which was used last
   The folder is fixed ("FleetPilot" under the user's AppData), so it does not depend on the app name or ID in the build settings.

   THE FILE carries a format version. A newer program opens an older file and upgrades it step by step (the old file is kept once, named with its
   version). An older program refuses a newer file with a plain message and never writes to it.
   Every write is: temp file, flush to disk, rename. A file that is briefly locked (antivirus, backup tool) is retried quietly.
   The testable part (createStore) does not need Electron; registerLedgerFile() wires it to the window. */
'use strict';
const fs = require('fs'), path = require('path');

const FORMAT_NAME = 'fleetpilot-database';
const CURRENT_FORMAT = 1;
const APP_VERSION = 'v21';
const EXT = '.fpdb.json';
const LIST_KEYS = ['vehicles', 'drivers', 'clients', 'bookings', 'rentals', 'expenses', 'payments', 'invoices', 'driverAllowances', 'accounts', 'loans', 'insurance', 'chama', 'fuelAccount', 'coops', 'individuals'];
const RETRY_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'EMFILE', 'ENFILE']);

/* UPGRADES[n] turns format n into format n + 1 (the ledger object in, the ledger object out). To change the data layout one day:
   raise CURRENT_FORMAT by one and add UPGRADES[<old number>] here. Nothing else has to change.
   Format 0 is a bare ledger with no wrapper (what the browser storage held before this version): same content, now wrapped with a version. */
const UPGRADES = { 0: data => data };

const countRecords = d => { let n = 0; if(d && typeof d === 'object') LIST_KEYS.forEach(k => { if(Array.isArray(d[k])) n += d[k].length; }); return n; };
const cleanName = n => String(n == null ? '' : n).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 60);
const two = n => String(n).padStart(2, '0');
const sleepAsync = ms => new Promise(r => setTimeout(r, ms));
const sleepSync = ms => { try{ Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }catch(e){} };

function plainError(e){
  const c = e && e.code;
  if(c === 'ENOSPC') return 'the disk is full';
  if(c === 'EBUSY' || c === 'EPERM' || c === 'EACCES') return 'Windows is not letting FleetPilot write the database file (another program may be holding it, or the folder is protected)';
  if(c === 'ENOENT') return 'the FleetPilot data folder is missing';
  return String(e && e.message || e);
}

/* ---- the file text: a small header first (so lists can read it cheaply), then the ledger ---- */
function serialize(name, data, appVersion, format, now){
  const head = JSON.stringify({ format: FORMAT_NAME, formatVersion: format, appVersion, name, savedAt: now().toISOString(), records: countRecords(data) });
  return head.slice(0, -1) + ',"data":' + JSON.stringify(data) + '}';
}
function readHeaderOf(file, fsx){
  try{
    const fd = fsx.openSync(file, 'r');
    try{
      const buf = Buffer.alloc(1200), n = fsx.readSync(fd, buf, 0, 1200, 0), text = buf.toString('utf8', 0, n), i = text.indexOf(',"data":');
      if(i < 0) return null;
      const h = JSON.parse(text.slice(0, i) + '}'); return h && h.format === FORMAT_NAME ? h : null;
    }finally{ fsx.closeSync(fd); }
  }catch(e){ return null; }
}
/* text -> { version, data, header } or throws Error with .damaged = true */
function parseText(text){
  let o; try{ o = JSON.parse(text); }catch(e){ const x = new Error('the file is not readable (' + e.message + ')'); x.damaged = true; throw x; }
  if(o && o.format === FORMAT_NAME && Number.isInteger(o.formatVersion) && o.data && typeof o.data === 'object') return { version: o.formatVersion, data: o.data, header: o };
  if(o && Array.isArray(o.vehicles)) return { version: 0, data: o, header: {} };   // a bare ledger: format 0
  const x = new Error('the file does not hold a FleetPilot database'); x.damaged = true; throw x;
}

function createStore(opts){
  const root = opts.root, fsx = opts.fs || fs, now = opts.now || (() => new Date());
  const appVersion = opts.appVersion || APP_VERSION, current = opts.current || CURRENT_FORMAT, steps = opts.upgrades || UPGRADES;
  const sleepA = opts.sleep || sleepAsync, sleepS = opts.sleepSync || sleepSync;
  const dirs = { db: path.join(root, 'databases'), copies: path.join(root, 'copies'), damaged: path.join(root, 'damaged') };
  const settingsFile = path.join(root, 'settings.json');
  const locked = new Map();                       // database name (lower case) -> the plain message: a newer file, never written to
  let chain = Promise.resolve();
  const queue = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  const mk = d => fsx.mkdirSync(d, { recursive: true });
  const exists = f => { try{ fsx.statSync(f); return true; }catch(e){ return false; } };
  const fileFor = name => path.join(dirs.db, name + EXT);
  const monthKey = () => { const d = now(); return d.getFullYear() + '-' + two(d.getMonth() + 1); };
  const monthlyPath = (name, month) => path.join(dirs.copies, name + ' - monthly ' + month + EXT);
  const oldFormatPath = (name, v) => path.join(dirs.copies, name + ' - old format v' + v + EXT);

  function writeOnce(file, text){
    const tmp = file + '.tmp', buf = Buffer.from(text, 'utf8');
    const fd = fsx.openSync(tmp, 'w');
    try{ let off = 0; while(off < buf.length) off += fsx.writeSync(fd, buf, off, buf.length - off); try{ fsx.fsyncSync(fd); }catch(e){} }
    finally{ fsx.closeSync(fd); }
    fsx.renameSync(tmp, file);
  }
  async function writeAtomic(file, text){
    let last;
    for(let i = 0; i < 6; i++){
      try{ writeOnce(file, text); return; }catch(e){ last = e; if(!(e && RETRY_CODES.has(e.code))) break; await sleepA(120 * (i + 1)); }
    }
    throw last;
  }
  function writeAtomicSync(file, text){
    let last;
    for(let i = 0; i < 4; i++){
      try{ writeOnce(file, text); return; }catch(e){ last = e; if(!(e && RETRY_CODES.has(e.code))) break; sleepS(60 * (i + 1)); }
    }
    throw last;
  }
  const validFile = f => { try{ parseText(fsx.readFileSync(f, 'utf8')); return true; }catch(e){ return false; } };

  /* ---------- settings (which database opens at start) ---------- */
  function getSettings(){
    let s = {}; try{ s = JSON.parse(fsx.readFileSync(settingsFile, 'utf8')) || {}; }catch(e){}
    return { startWith: typeof s.startWith === 'string' && s.startWith ? s.startWith : 'last', lastUsed: typeof s.lastUsed === 'string' ? s.lastUsed : '', migrated: s.migrated === true };
  }
  function setSettings(patch){
    const s = Object.assign(getSettings(), patch || {});
    if(typeof s.startWith !== 'string' || !s.startWith) s.startWith = 'last';
    mk(root); writeOnce(settingsFile, JSON.stringify(s)); return s;
  }

  /* ---------- the databases ---------- */
  function list(){
    let names = []; try{ names = fsx.readdirSync(dirs.db); }catch(e){}
    return names.filter(n => n.endsWith(EXT)).map(n => {
      const f = path.join(dirs.db, n), st = fsx.statSync(f), h = readHeaderOf(f, fsx) || {};
      return { name: n.slice(0, -EXT.length), modified: st.mtimeMs, size: st.size, savedAt: h.savedAt || '', records: h.records || 0, formatVersion: h.formatVersion == null ? 0 : h.formatVersion };
    }).sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
  }
  function resolveName(name){          // the exact existing name for a name typed in any letter case
    const n = cleanName(name); if(!n) return '';
    const hit = list().find(x => x.name.toLowerCase() === n.toLowerCase()); return hit ? hit.name : n;
  }
  function runSteps(data, from){
    let v = from, d = data;
    while(v < current){ const step = steps[v]; if(typeof step !== 'function') throw new Error('no upgrade step from format ' + v); d = step(d) || d; v++; }
    return d;
  }
  function newerMessage(v){ return 'This database was saved by a newer version of FleetPilot (its file format is ' + v + ', this program understands up to ' + current + '). Install the newest FleetPilot to open it. Nothing was changed and nothing will be written to it.'; }

  async function load(name){
    name = resolveName(name); if(!name) return { ok: false, reason: 'missing', error: 'no database name' };
    const file = fileFor(name); if(!exists(file)) return { ok: false, reason: 'missing', name };
    let parsed;
    try{ parsed = parseText(fsx.readFileSync(file, 'utf8')); }
    catch(e){
      if(!e.damaged) return { ok: false, reason: 'unreadable', name, error: plainError(e) };
      let setAside = '';          // the damaged file is moved away so that the next save can never overwrite it
      try{ mk(dirs.damaged); setAside = path.join(dirs.damaged, name + ' - ' + now().toISOString().replace(/[:.]/g, '-') + EXT); fsx.renameSync(file, setAside); }catch(e2){ setAside = ''; }
      return { ok: false, reason: 'damaged', name, error: e.message, setAside };
    }
    if(parsed.version > current){ locked.set(name.toLowerCase(), newerMessage(parsed.version)); return { ok: false, reason: 'newer', name, fileVersion: parsed.version, message: newerMessage(parsed.version) }; }
    let data = parsed.data, upgradedFrom = null, keptCopy = '';
    if(parsed.version < current){
      try{
        const stepped = runSteps(JSON.parse(JSON.stringify(data)), parsed.version);
        mk(dirs.copies);
        const keep = oldFormatPath(name, parsed.version);           // one copy of the old file, only now, named with its version
        if(!exists(keep)){ fsx.copyFileSync(file, keep); keptCopy = keep; }
        data = stepped; upgradedFrom = parsed.version;
        await queue(() => writeAtomic(file, serialize(name, data, appVersion, current, now)));
      }catch(e){ return { ok: false, reason: 'upgrade-failed', name, error: plainError(e) }; }
    }
    return { ok: true, name, data, savedAt: parsed.header.savedAt || '', formatVersion: current, upgradedFrom, keptCopy };
  }

  function prepareSave(name, data){
    name = cleanName(name);
    if(!name) return { fail: { ok: false, error: 'the database has no name' } };
    if(!data || typeof data !== 'object' || !Array.isArray(data.vehicles)) return { fail: { ok: false, error: 'nothing to save' } };
    const msg = locked.get(name.toLowerCase()); if(msg) return { fail: { ok: false, locked: true, error: msg } };
    return { name };
  }
  /* monthly copy: the first save of a new month keeps the file as it stood before that save (or, for a brand new file, the file just written) */
  function monthlyBefore(name){
    const month = monthKey(), copy = monthlyPath(name, month), file = fileFor(name);
    if(exists(copy)) return { done: true };
    if(!exists(file)) return { after: true, copy, month };
    if(!validFile(file)) return { done: false };           // never keep a damaged file as the monthly copy
    try{ mk(dirs.copies); fsx.copyFileSync(file, copy); return { done: true, made: copy, month }; }catch(e){ return { done: false, error: plainError(e) }; }
  }
  function afterWrite(name, file, pre){
    let made = pre.made || '', copyError = pre.error || '';
    if(pre.after){ try{ mk(dirs.copies); fsx.copyFileSync(file, pre.copy); made = pre.copy; }catch(e){ copyError = plainError(e); } }
    return { monthlyCopy: made ? path.basename(made) : '', copyError };
  }
  function diskFree(){ try{ if(typeof fsx.statfsSync === 'function'){ const s = fsx.statfsSync(root); return Number(s.bavail) * Number(s.bsize); } }catch(e){} return null; }

  function save(name, data){
    const p = prepareSave(name, data); if(p.fail) return Promise.resolve(p.fail);
    return queue(async () => {
      try{
        mk(dirs.db); const file = fileFor(p.name), text = serialize(p.name, data, appVersion, current, now);
        const pre = monthlyBefore(p.name);
        await writeAtomic(file, text);
        return Object.assign({ ok: true, name: p.name, savedAt: now().toISOString(), bytes: text.length, free: diskFree() }, afterWrite(p.name, file, pre));
      }catch(e){ return { ok: false, error: plainError(e), code: e && e.code || '' }; }
    });
  }
  /* the same save, but synchronous: for the moment the window is closing */
  function saveSync(name, data){
    const p = prepareSave(name, data); if(p.fail) return p.fail;
    try{
      mk(dirs.db); const file = fileFor(p.name), text = serialize(p.name, data, appVersion, current, now);
      const pre = monthlyBefore(p.name);
      writeAtomicSync(file, text);
      return Object.assign({ ok: true, name: p.name, savedAt: now().toISOString(), bytes: text.length, free: diskFree() }, afterWrite(p.name, file, pre));
    }catch(e){ return { ok: false, error: plainError(e), code: e && e.code || '' }; }
  }
  /* a new database: refuses a name that is already used (any letter case), never overwrites */
  async function create(name, data){
    const n = cleanName(name); if(!n) return { ok: false, error: 'Type a name for the new database.' };
    if(list().some(x => x.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'A database called "' + n + '" already exists.' };
    return save(n, data);
  }

  /* ---------- safety copies ---------- */
  const RE_MONTH = /^(.*) - monthly (\d{4}-\d{2})\.fpdb\.json$/, RE_OLD = /^(.*) - old format v(\d+)\.fpdb\.json$/;
  function copies(){
    let names = []; try{ names = fsx.readdirSync(dirs.copies); }catch(e){}
    const out = [];
    names.forEach(n => {
      let m = RE_MONTH.exec(n), kind = 'monthly', tag = '';
      if(m) tag = m[2]; else { m = RE_OLD.exec(n); kind = 'format'; if(m) tag = 'v' + m[2]; }
      if(!m) return;
      const f = path.join(dirs.copies, n), st = fsx.statSync(f), h = readHeaderOf(f, fsx) || {};
      out.push({ id: n, db: m[1], kind, tag, madeAt: st.mtimeMs, savedAt: h.savedAt || '', records: h.records || 0, size: st.size });
    });
    return out.sort((a, b) => b.madeAt - a.madeAt);
  }
  function readCopy(id){
    const base = path.basename(String(id || ''));
    if(base !== String(id) || !(RE_MONTH.test(base) || RE_OLD.test(base))) return { ok: false, error: 'not a copy of this program' };
    try{
      const parsed = parseText(fsx.readFileSync(path.join(dirs.copies, base), 'utf8'));
      if(parsed.version > current) return { ok: false, error: newerMessage(parsed.version) };
      return { ok: true, id: base, data: runSteps(JSON.parse(JSON.stringify(parsed.data)), parsed.version), savedAt: parsed.header.savedAt || '' };
    }catch(e){ return { ok: false, error: plainError(e) }; }
  }
  return { root, dirs, getSettings, setSettings, list, load, save, saveSync, create, copies, readCopy, diskFree, cleanName, monthKey, isLocked: n => locked.has(String(n).toLowerCase()) };
}

/* ---------- Electron wiring (needs Electron; not loaded by the tests) ---------- */
function registerLedgerFile(){
  const { app, ipcMain, shell, BrowserWindow } = require('electron');
  const root = path.join(app.getPath('appData'), 'FleetPilot');
  const store = createStore({ root });
  const safe = fn => async (...a) => { try{ return await fn(...a); }catch(e){ return { ok: false, error: plainError(e) }; } };

  /* two copies of the program writing one database would overwrite each other: a second start just brings the first to the front */
  if(!app.requestSingleInstanceLock()){ app.quit(); return store; }
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if(w){ if(w.isMinimized()) w.restore(); w.focus(); } });

  ipcMain.handle('db:settings', safe(() => ({ ok: true, settings: store.getSettings(), databases: store.list(), folder: root })));
  ipcMain.handle('db:setSettings', safe((ev, patch) => ({ ok: true, settings: store.setSettings(patch) })));
  ipcMain.handle('db:load', safe((ev, name) => store.load(name)));
  ipcMain.handle('db:save', safe((ev, name, data) => store.save(name, data)));
  ipcMain.handle('db:create', safe((ev, name, data) => store.create(name, data)));
  ipcMain.handle('db:copies', safe(() => ({ ok: true, copies: store.copies() })));
  ipcMain.handle('db:readCopy', safe((ev, id) => store.readCopy(id)));
  ipcMain.handle('db:showFolder', safe(() => { fs.mkdirSync(root, { recursive: true }); shell.openPath(root); return { ok: true }; }));
  ipcMain.on('db:saveSync', (ev, name, data) => { try{ ev.returnValue = store.saveSync(name, data); }catch(e){ ev.returnValue = { ok: false, error: plainError(e) }; } });

  /* closing a window: ask the page to write what is pending first (it also writes synchronously as it unloads), then close for real */
  app.on('browser-window-created', (e, w) => {
    let closing = false;
    w.on('close', ev => {
      if(closing) return;
      ev.preventDefault(); closing = true;
      const done = () => { try{ if(!w.isDestroyed()) w.close(); }catch(err){} };
      const timer = setTimeout(done, 6000);
      ipcMain.once('db:flushed', () => { clearTimeout(timer); done(); });
      try{ w.webContents.send('db:flush'); }catch(err){ clearTimeout(timer); done(); }
    });
  });
  return store;
}
module.exports = { createStore, registerLedgerFile, CURRENT_FORMAT, UPGRADES, FORMAT_NAME, APP_VERSION, countRecords, cleanName };
