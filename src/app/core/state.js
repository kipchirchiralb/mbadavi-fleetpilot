import { scheduleAutosave } from './autosave.js';
import { renderDashboard } from '../dashboard/cards.js';
import { renderFileStatus } from '../features/fileIO.js';
import { renderWatchlist } from '../features/watchlist.js';

/* ---------- state ---------- */
export let db = { vehicles: [], drivers: [], clients: [], bookings: [], rentals: [], expenses: [], payments: [], driverAllowances: [], settings: { adminPin: null, chartType: 'pie' }, nextId: 1, period: null, lastModified: null };
export let dirty = false;
export let currentFileName = null;
export let currentFileHandle = null; // File System Access API handle, when supported
export let rolloverPromptShownThisSession = false;
export function uid(){ return db.nextId++; }
export function markDirty(){
  dirty = true;
  db.lastModified = new Date().toISOString();
  scheduleAutosave();
  renderFileStatus();
  /* Every data-changing action in this app already calls markDirty() right after
     it edits db (vehicles, rentals, expenses, payments, drivers, allowances,
     settings, etc). Refreshing the dashboard cards here — in one place — instead
     of relying on each individual call site to remember renderDashboard()
     guarantees the cards always reflect the current db state, even if the
     dashboard panel isn't the one on screen right now. That removes the class of
     bug where a card goes stale because some edit path forgot to refresh it.
     Guarded in case markDirty() ever fires before the dashboard DOM exists. */
  if(document.getElementById('dashCards')){
    renderDashboard();
  }
  renderWatchlist();
}
export function setDb(value){ db = value; }
export function setDirty(value){ dirty = value; }
export function setCurrentFileName(value){ currentFileName = value; }
export function setCurrentFileHandle(value){ currentFileHandle = value; }
export function setRolloverPromptShown(value){ rolloverPromptShownThisSession = value; }
