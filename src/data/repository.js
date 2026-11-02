/* Where the ledger is kept on this device. Two independent places are written on every save, so a failure of one never loses data:

     1. IndexedDB  (database "FleetLedgerAutosave", store "snapshots")
          - "latest"                    the newest copy
          - "backup-0" ... "backup-4"   a ring of earlier copies, so one bad write can never replace the only good copy
     2. localStorage  (key "fleetpilot.mirror.v1")   a second full copy, written synchronously (it also survives the window closing mid-save)

   Every copy carries a checksum and a record count. On start the newest copy that passes its checksum wins; if "latest" is damaged the
   newest good backup is used, and the caller is told it was a recovery. save() only fails when BOTH places refuse the data.
   Saves are queued one after another, so an older state can never be written over a newer one. */

const DATABASE_NAME = 'FleetLedgerAutosave';
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'latest';
const BACKUP_SLOTS = 5;
const BACKUP_EVERY_MS = 2 * 60 * 1000;      // a new backup at most every 2 minutes ...
const SHRINK_RATIO = 0.9;                    // ... or at once when the new copy holds clearly fewer records than the one it replaces
const MIRROR_KEY = 'fleetpilot.mirror.v1';
const LIST_KEYS = ['vehicles', 'drivers', 'clients', 'bookings', 'rentals', 'expenses', 'payments', 'invoices', 'driverAllowances', 'accounts', 'loans', 'insurance', 'chama', 'fuelAccount', 'coops', 'individuals'];

/* small, fast, dependency-free checksum (FNV-1a over the text, plus its length) */
export function checksum(text){
  let h = 0x811c9dc5;
  for(let i = 0; i < text.length; i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16) + ':' + text.length;
}
export function countRecords(state){
  let n = 0;
  if(state && typeof state === 'object') LIST_KEYS.forEach(k => { if(Array.isArray(state[k])) n += state[k].length; });
  return n;
}
/* a stored copy is usable when its text is intact and holds a ledger */
export function validRecord(rec){
  if(!rec || typeof rec.data !== 'string' || !rec.data) return false;
  if(rec.check && rec.check !== checksum(rec.data)) return false;
  try{ const s = JSON.parse(rec.data); return !!s && typeof s === 'object' && Array.isArray(s.vehicles); }catch(e){ return false; }
}
const newer = (a, b) => !b || (a && String(a.savedAt || '') >= String(b.savedAt || ''));

export class LocalFleetRepository {
  constructor(){
    this.databasePromise = null;
    this.queue = Promise.resolve();
    this.lastStatus = { idb: null, mirror: null, error: '' };   // null = not tried yet
  }

  /* ---------- IndexedDB ---------- */
  openDatabase(){
    if(this.databasePromise) return this.databasePromise;
    if(typeof indexedDB === 'undefined'){ return Promise.reject(new Error('IndexedDB is unavailable')); }
    this.databasePromise = new Promise((resolve, reject) => {
      let request;
      try{ request = indexedDB.open(DATABASE_NAME, 1); }catch(err){ reject(err); return; }
      request.onupgradeneeded = () => {
        if(!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const dbh = request.result;
        dbh.onversionchange = () => { try{ dbh.close(); }catch(e){} this.databasePromise = null; };   // another tab upgraded it: reopen next time
        dbh.onclose = () => { this.databasePromise = null; };
        resolve(dbh);
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened'));
      request.onblocked = () => reject(new Error('The local ledger database is blocked'));
    }).catch(err => { this.databasePromise = null; throw err; });     // a failed open is retried on the next save, not remembered forever
    return this.databasePromise;
  }
  /* IndexedDB can hang (blocked upgrade, a stuck profile). A hang must not freeze loading or block every later save. */
  _timed(promise, ms, what){
    let t; const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(what + ' took too long')), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }
  _tx(database, mode){
    try{ return database.transaction(STORE_NAME, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); }
    catch(e){ return database.transaction(STORE_NAME, mode); }
  }
  _idbGet(key){ return this._timed(this._idbGetRaw(key), 8000, 'Reading the browser database'); }
  async _idbGetRaw(key){
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = this._tx(database, 'readonly'); const rq = tx.objectStore(STORE_NAME).get(key);
      rq.onsuccess = () => resolve(rq.result || null); rq.onerror = () => reject(rq.error); tx.onabort = () => reject(tx.error);
    });
  }
  /* write the new copy; the copy it replaces moves into the backup ring first, inside the same transaction (all or nothing) */
  _idbSave(rec){ return this._timed(this._idbSaveRaw(rec), 20000, 'Saving to the browser database'); }
  async _idbSaveRaw(rec){
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = this._tx(database, 'readwrite'); const store = tx.objectStore(STORE_NAME);
      const get = store.get(SNAPSHOT_KEY);
      get.onsuccess = () => {
        try{
          const old = get.result;
          let seq = 1;
          if(old && validRecord(old)){
            seq = (Number(old.seq) || 0) + 1;
            const shrink = rec.records < (old.records || 0) * SHRINK_RATIO, lastBackupMs = Number(old.lastBackupMs) || 0;
            rec.backupSeq = Number(old.backupSeq) || 0; rec.lastBackupMs = lastBackupMs;
            if(rec.forceBackup || shrink || Date.now() - lastBackupMs >= BACKUP_EVERY_MS){
              rec.backupSeq += 1;                                                    // a true ring: the oldest slot is overwritten first
              store.put(Object.assign({}, old, { id: 'backup-' + (rec.backupSeq % BACKUP_SLOTS) }));
              rec.lastBackupMs = Date.now();
            }
          } else if(old){ seq = (Number(old.seq) || 0) + 1; rec.backupSeq = Number(old.backupSeq) || 0; rec.lastBackupMs = 0; }   // a damaged "latest" is simply replaced; the ring still holds good copies
          const toStore = Object.assign({}, rec, { id: SNAPSHOT_KEY, seq }); delete toStore.forceBackup;
          store.put(toStore);
        }catch(err){ try{ tx.abort(); }catch(e){} reject(err); }
      };
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('The save was cancelled'));
    });
  }

  /* ---------- localStorage mirror ---------- */
  _mirrorRead(){
    try{ const t = localStorage.getItem(MIRROR_KEY); return t ? JSON.parse(t) : null; }catch(e){ return null; }
  }
  _mirrorWrite(rec){
    try{ localStorage.setItem(MIRROR_KEY, JSON.stringify(rec)); return true; }
    catch(e){ return false; }        // blocked, full, or private window
  }

  _record(state, meta){
    const data = JSON.stringify(state);
    return { savedAt: new Date().toISOString(), fileName: meta.fileName || null, workbookDirty: meta.workbookDirty !== false, data, check: checksum(data), records: countRecords(state) };
  }

  /* ---------- public ---------- */
  /* Save to both places. Resolves with { idb, mirror } (true/false each) when at least one worked; rejects only when both failed. */
  save(state, { fileName = null, workbookDirty = true, forceBackup = false } = {}){
    const run = async () => {
      /* The copy is made when this save actually runs, not when it was asked for: a save that waited behind another one (or behind the
         "window is closing" save) must never write an older picture of the ledger over a newer one. */
      const rec = this._record(state, { fileName, workbookDirty });
      if(forceBackup) rec.forceBackup = true;      // e.g. a whole file was just opened: keep what it replaces
      const out = { idb: false, mirror: false, error: '' };
      out.mirror = this._mirrorWrite(rec);                         // synchronous and independent of IndexedDB
      try{ await this._idbSave(rec); out.idb = true; }
      catch(err){
        out.error = (err && err.message) || String(err);
        /* storage full: free room by deleting the older automatic copies (never the newest), then try once more */
        if(err && (err.name === 'QuotaExceededError' || /quota|full/i.test(out.error))){
          try{ const n = await this.deleteOlderCopies(); if(n){ await this._idbSave(rec); out.idb = true; out.error = ''; out.trimmed = n; } }catch(e2){ out.error = (e2 && e2.message) || out.error; }
        }
        if(!out.mirror && out.idb){ try{ localStorage.removeItem(MIRROR_KEY); out.mirror = this._mirrorWrite(rec); }catch(e3){} }
      }
      this.lastStatus = out;
      if(!out.idb && !out.mirror){ const e = new Error('Neither IndexedDB nor browser storage accepted the save' + (out.error ? ': ' + out.error : '')); e.status = out; throw e; }
      return out;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});                                // a failed save never blocks the next one
    return p;
  }
  /* For the moment a window is closing: the mirror is written at once (synchronously), then IndexedDB is attempted. */
  saveNow(state, meta = {}){
    const rec = this._record(state, meta);
    const mirror = this._mirrorWrite(rec);
    this._idbSave(rec).then(() => { this.lastStatus = { idb: true, mirror, error: '' }; }, () => {});
    return mirror;
  }

  /* The best copy available: the newest one that passes its checksum, from IndexedDB (latest, then backups) or the mirror.
     Returns the record with .source = 'latest' | 'backup' | 'mirror' and .recovered = true when "latest" was damaged, or null when nothing usable exists. */
  async load(){
    let idbBest = null, damaged = false, idbError = null;
    try{
      const latest = await this._idbGet(SNAPSHOT_KEY);
      if(latest){ if(validRecord(latest)) idbBest = Object.assign({}, latest, { source: 'latest' }); else damaged = true; }
      if(!idbBest){
        const backups = [];
        for(let i = 0; i < BACKUP_SLOTS; i++){ try{ const b = await this._idbGet('backup-' + i); if(b && validRecord(b)) backups.push(b); }catch(e){} }
        backups.sort((a, b) => String(b.savedAt || '') < String(a.savedAt || '') ? -1 : 1);
        if(backups[0]) idbBest = Object.assign({}, backups[0], { source: 'backup' });
      }
    }catch(err){ idbError = err; }
    const mirror = this._mirrorRead(), mirrorOk = validRecord(mirror) ? Object.assign({}, mirror, { source: 'mirror' }) : null;
    let best = idbBest;
    if(mirrorOk && (!best || (newer(mirrorOk, best) && mirrorOk.savedAt !== best.savedAt))) best = mirrorOk;
    if(!best){ if(idbError && !mirror) throw idbError; return null; }
    best.recovered = best.source !== 'latest';
    best.latestDamaged = damaged;
    return best;
  }

  /* earlier automatic copies, newest first, for the "recover an earlier copy" list (data text left out) */
  async listBackups(){
    const out = [];
    try{ const l = await this._idbGet(SNAPSHOT_KEY); if(l && validRecord(l)) out.push({ id: SNAPSHOT_KEY, savedAt: l.savedAt, records: l.records || 0, fileName: l.fileName || '', size: (l.data || '').length }); }catch(e){}
    for(let i = 0; i < BACKUP_SLOTS; i++){ try{ const b = await this._idbGet('backup-' + i); if(b && validRecord(b)) out.push({ id: 'backup-' + i, savedAt: b.savedAt, records: b.records || 0, fileName: b.fileName || '', size: (b.data || '').length }); }catch(e){} }
    const m = this._mirrorRead(); if(validRecord(m)) out.push({ id: 'mirror', savedAt: m.savedAt, records: m.records || 0, fileName: m.fileName || '', size: (m.data || '').length });
    out.sort((a, b) => String(b.savedAt || '') < String(a.savedAt || '') ? -1 : 1);
    return out;
  }
  /* delete one automatic copy. The newest copy ('latest') is never deleted: it is the work itself. */
  async deleteCopy(id){
    if(id === 'mirror'){ try{ localStorage.removeItem(MIRROR_KEY); return true; }catch(e){ return false; } }
    if(!/^backup-\d+$/.test(String(id))) return false;
    const database = await this.openDatabase();
    return this._timed(new Promise((resolve, reject) => { const tx = this._tx(database, 'readwrite'); tx.objectStore(STORE_NAME).delete(id); tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }), 8000, 'Deleting a copy');
  }
  /* delete every earlier copy (all backup slots and the localStorage safety copy), keep the newest. Returns how many were deleted. */
  async deleteOlderCopies(){
    let n = 0;
    for(let i = 0; i < BACKUP_SLOTS; i++){ try{ if(await this._idbGet('backup-' + i)){ await this.deleteCopy('backup-' + i); n++; } }catch(e){} }
    return n;
  }
  /* how much room this site has and how much it uses (null when the browser does not say) */
  async storageInfo(){
    try{ if(navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); return { usage: e.usage || 0, quota: e.quota || 0 }; } }catch(e){}
    return null;
  }
  async loadCopy(id){
    const rec = id === 'mirror' ? this._mirrorRead() : await this._idbGet(id);
    return validRecord(rec) ? rec : null;
  }
}
