/* The page's side of the database (inside the FleetPilot .exe). The SQLite work itself is done by electron/ledgerFile.cjs.
   Outside the .exe (plain browser / PWA) there is no bridge: hasDesktopDb() is false and the app keeps using the browser storage as before.

   START-UP  startDatabase(): opens the database chosen in Pilot (default: the last one used) BEFORE anything is shown.
             First start after the update (no file yet): whatever is in the old browser storage is moved into the new file ONCE
             (settings.migrated), after that the browser storage is only a fallback, offered when the file is missing or damaged.
   SAVING    DesktopDb.save(): one write per change (the page waits about half a second for further changes), once more when the window closes.
             A failed write is retried quietly; only a failure that lasts (two in a row) becomes a visible problem. */

export const DEFAULT_NAME = 'Main';
export const hasDesktopDb = b => !!(b && typeof b.dbLoad === 'function' && typeof b.dbSave === 'function' && typeof b.dbSettings === 'function');
const LOW_FREE = 300 * 1024 * 1024;
/* the disk is "nearly full" when under 300 MB are left, or under 20 times the size of the database file */
export const lowDisk = (free, size) => free != null && Number.isFinite(free) && (free < LOW_FREE || free < (Number(size) || 0) * 20);
export const mb = n => Math.max(1, Math.round(n / 1048576)) + ' MB';
const when = iso => { try{ return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }catch(e){ return String(iso || ''); } };

export async function startDatabase({ bridge, readBrowser, confirmFn, openOnce }){
  const out = { name: DEFAULT_NAME, data: null, source: 'empty', notices: [], blocked: null, needsFirstSave: false };
  const st = await bridge.dbSettings();
  if(!st || !st.ok) throw new Error((st && st.error) || 'the data folder could not be read');
  const { settings, databases } = st, find = n => databases.find(d => String(d.name).toLowerCase() === String(n || '').toLowerCase());
  out.folder = st.folder;
  let name = '';
  if(openOnce && find(openOnce)) name = find(openOnce).name;                              // chosen with "Open" in Pilot a moment ago
  else if(settings.startWith && settings.startWith !== 'last' && find(settings.startWith)) name = find(settings.startWith).name;
  else if(find(settings.lastUsed)) name = find(settings.lastUsed).name;
  else if(databases.length) name = databases.slice().sort((a, b) => b.modified - a.modified)[0].name;

  let r = null;
  if(name){
    out.name = name;
    r = await bridge.dbLoad(name);
    if(r && r.ok){ out.data = r.data; out.source = 'file'; out.name = r.name;
      if(r.movedFrom) out.notices.push({ level: 'info', kind: 'tosqlite', text: 'Your database "' + r.name + '" now lives in SQLite (databases\\' + r.name + '.db). The old file was kept, unchanged, in the old-files folder. Nothing was lost.' });
      if(r.upgradedFrom != null) out.notices.push({ level: 'info', kind: 'upgraded', text: 'Your database was brought up to this version of FleetPilot (file format ' + r.upgradedFrom + ' to ' + r.formatVersion + '). The old file was kept once in the copies folder. Nothing was lost.' });
      return out; }
    if(r && (r.reason === 'newer' || r.reason === 'unreadable' || r.reason === 'upgrade-failed')){
      out.blocked = { reason: r.reason, message: r.message || ('The database "' + name + '" could not be opened: ' + (r.error || 'unknown problem') + '. Nothing was changed and nothing will be written to it.') };
      return out;
    }
    if(r && r.reason === 'damaged'){
      out.notices.push({ level: 'info', kind: 'damaged', text: 'The database file "' + name + '" could not be read' + (r.setAside ? ' and was set aside (not deleted) in ' + r.setAside : '') + '.' });
      /* 1. the newest monthly copy of this database */
      try{
        const c = await bridge.dbCopies(), mine = ((c && c.copies) || []).filter(x => x.kind === 'monthly' && String(x.db).toLowerCase() === name.toLowerCase());
        if(mine[0] && confirmFn('The database file "' + name + '" could not be read.\n\nLoad the newest monthly safety copy (made ' + when(mine[0].madeAt) + ', data as of ' + when(mine[0].savedAt) + ')?\n\nCancel looks for another copy.')){
          const rc = await bridge.dbReadCopy(mine[0].id);
          if(rc && rc.ok){ out.data = rc.data; out.source = 'copy'; out.needsFirstSave = true; out.notices.push({ level: 'info', kind: 'fromcopy', text: 'Loaded the monthly copy of ' + when(mine[0].madeAt) + '. Work after ' + when(rc.savedAt) + ' is not in it.' }); return out; }
        }
      }catch(e){}
    }
  }
  /* no usable file: the old browser storage (first start after the update, or a fallback) */
  let browser = null; try{ browser = await readBrowser(); }catch(e){}
  const has = browser && browser.data && browser.records > 0;
  if(has && !settings.migrated){
    out.data = browser.data; out.source = 'browser'; out.needsFirstSave = true;
    out.notices.push({ level: 'info', kind: 'migrated', text: 'Your earlier work (saved ' + when(browser.savedAt) + ', ' + browser.records + ' records) was moved into the new database file. The browser storage is now only a fallback.' });
  }else if(has && settings.migrated && confirmFn('No database file was found, but this program\'s old browser storage still holds a copy from ' + when(browser.savedAt) + ' (' + browser.records + ' records).\n\nUse that copy? Cancel starts with an empty database.')){
    out.data = browser.data; out.source = 'browser'; out.needsFirstSave = true;
    out.notices.push({ level: 'info', kind: 'fallback', text: 'The database file was missing, so the copy in the browser storage from ' + when(browser.savedAt) + ' was used. Check your latest entries.' });
  }
  return out;
}

export class DesktopDb {
  constructor(bridge, name){ this.b = bridge; this.name = name; this.failCount = 0; this.lastError = ''; this.blocked = ''; this.lowDisk = false; this.free = null; this.size = 0; this.marked = false; this.lastSavedAt = null; }
  async markUsed(){ if(this.marked) return; this.marked = true; try{ await this.b.dbSetSettings({ lastUsed: this.name, migrated: true }); }catch(e){ this.marked = false; } }
  _ok(r){ this.failCount = 0; this.lastError = ''; this.lastSavedAt = new Date(); this.size = r.bytes || this.size; this.free = r.free == null ? null : r.free; this.lowDisk = lowDisk(this.free, this.size); }
  _bad(r){ this.failCount++; this.lastError = (r && r.error) || 'the file could not be written'; if(r && r.locked) this.blocked = this.lastError; }
  async save(data){
    if(this.blocked) return { ok: false, locked: true, error: this.blocked };
    let r; try{ r = await this.b.dbSave(this.name, data); }catch(e){ r = { ok: false, error: String(e && e.message || e) }; }
    if(r && r.ok){ this._ok(r); await this.markUsed(); return r; }
    this._bad(r); return r || { ok: false, error: this.lastError };
  }
  /* for the moment the window closes: the page may be gone before an asynchronous write finishes */
  saveSync(data){
    if(this.blocked || typeof this.b.dbSaveSync !== 'function') return { ok: false, error: this.blocked || 'not available' };
    let r; try{ r = this.b.dbSaveSync(this.name, data); }catch(e){ r = { ok: false, error: String(e && e.message || e) }; }
    if(r && r.ok) this._ok(r); else this._bad(r);
    return r || { ok: false };
  }
  /* red only when the app truly cannot save: the same failure twice in a row, or a file it must not write to */
  problem(){ return this.blocked || (this.failCount >= 2 ? this.lastError : ''); }
  diskNote(){ return this.lowDisk && this.free != null ? 'The disk is nearly full (about ' + mb(this.free) + ' left). Free some space soon so FleetPilot can keep saving.' : ''; }
}

/* Pilot > Database: which one is in use, which one opens at start, open another, make a new one. Draws into el; api is given by ledger.js. */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function renderDbBox(el, api){
  let info; try{ info = await api.info(); }catch(e){ info = null; }
  if(!info || !info.ok){ el.innerHTML = '<span class="subtitle">The database list could not be read.</span>'; return; }
  const dbs = info.databases, start = info.settings.startWith;
  const opt = (v, l, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(l) + '</option>';
  el.innerHTML = '<div style="border:1px solid var(--line,#30363d);border-radius:8px;padding:9px 12px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;">'
    + '<span>Database in use: <b>' + esc(api.current()) + '</b></span>'
    + '<label>Shown at start <select data-dbstart style="width:auto;display:inline-block;">' + opt('last', 'The last one used', start === 'last' || !dbs.some(d => d.name === start)) + dbs.map(d => opt(d.name, d.name, start === d.name)).join('') + '</select></label>'
    + (dbs.length > 1 ? '<label>Open <select data-dbopen style="width:auto;display:inline-block;">' + dbs.filter(d => d.name !== api.current()).map(d => opt(d.name, d.name + ' (' + d.records + ' records)', false)).join('') + '</select></label> <button type="button" class="btn" data-dbgo style="width:auto;padding:5px 10px;">Open</button>' : '')
    + '<button type="button" class="btn" data-dbnew style="width:auto;padding:5px 10px;">New database…</button>'
    + '<button type="button" class="btn" data-dbfolder style="width:auto;padding:5px 10px;">Open the data folder</button></div>';
  el.onchange = async e => { const s = e.target.closest('[data-dbstart]'); if(s){ await api.setStart(s.value); api.toast(s.value === 'last' ? 'The last database used opens at start.' : '"' + s.value + '" opens at start.'); } };
  el.onclick = async e => {
    if(e.target.closest('[data-dbgo]')){ const sel = el.querySelector('[data-dbopen]'); if(sel && sel.value) await api.open(sel.value); return; }
    if(e.target.closest('[data-dbnew]')){ await api.create(); return; }
    if(e.target.closest('[data-dbfolder]')){ await api.showFolder(); }
  };
}
