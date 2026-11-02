import { currentFileName, db, dirty, setCurrentFileHandle, setCurrentFileName, setDb, setDirty, setRolloverPromptShown } from './state.js';
import { migratePinIfNeeded } from '../features/adminPin.js';
import { renderFileStatus } from '../features/fileIO.js';
import { appConfirm, toast } from '../ui/dialogs.js';

export let localSaveTimer = null;
export let localSavePending = false;
export let localSaveError = false;
export let localSaveRevision = 0;
/* ---------- local-first persistence (IndexedDB) ---------- */
export function scheduleAutosave(){
  localSavePending = true;
  localSaveError = false;
  localSaveRevision++;
  clearTimeout(localSaveTimer);
  localSaveTimer = setTimeout(saveAutosaveSnapshot, 500);
  renderFileStatus();
}
export async function persistLocalDatabase(){
  scheduleAutosave();
  await saveAutosaveSnapshot();
}
export async function saveAutosaveSnapshot(){
  clearTimeout(localSaveTimer);
  localSaveTimer = null;
  const revision = localSaveRevision;
  try{
    await window.fleetRepository.save(db, { fileName: currentFileName, workbookDirty: dirty });
    localSaveError = false;
    if(revision === localSaveRevision) localSavePending = false;
    renderFileStatus();
    if(revision !== localSaveRevision) scheduleAutosave();
  }catch(err){
    localSaveError = true;
    console.error('Local save failed:', err);
    renderFileStatus();
  }
}
export async function readAutosaveSnapshot(){
  try{ return await window.fleetRepository.load(); }
  catch(err){ console.error('Could not load the local ledger:', err); return null; }
}
export async function restoreLocalDatabase(){
  const snap = await readAutosaveSnapshot();
  if(!snap || !snap.data) return;
  let recovered;
  try{ recovered = JSON.parse(snap.data); }catch(e){ return; }
  if(!recovered || !Array.isArray(recovered.vehicles)) return;
  ['vehicles','drivers','clients','bookings','rentals','expenses','payments','driverAllowances'].forEach(key=>{
    if(!Array.isArray(recovered[key])) recovered[key] = [];
  });
  setDb(recovered);
  if(!db.settings) db.settings = { adminPin:null, chartType:'pie' };
  setCurrentFileName(snap.fileName || null);
  setCurrentFileHandle(null);
  setDirty(snap.workbookDirty !== false);
  setRolloverPromptShown(false);
  await migratePinIfNeeded(db);
  if(snap.savedAt) toast('Loaded your locally saved ledger from ' + new Date(snap.savedAt).toLocaleString(), 'success');
}
/* Guards against silently loading a file that's older than unsaved work
   already sitting in this tab (e.g. someone else emailed back a copy of the
   ledger from before your latest edits). Doesn't attempt to merge — just warns
   before it discards what's on screen, same spirit as the browser's native
   "unsaved changes" prompt on tab close. */
export async function confirmLoadOverUnsaved(loadedDb){
  if((!dirty && !localSavePending) || !db.lastModified) return true;
  const loadedNewer = loadedDb.lastModified && loadedDb.lastModified > db.lastModified;
  if(loadedNewer) return true; // the file being opened already reflects more recent work than what's on screen
  return appConfirm('Unsaved changes',
    "You have unsaved changes in this session that are newer than the file you're about to open.\n\n" +
    "Loading it will replace what's on screen (an autosave backup of your current session is kept, but it's simplest to Save first).\n\nLoad anyway?",
    'Load anyway'
  );
}
