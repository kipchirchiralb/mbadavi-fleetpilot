import { db, markDirty } from '../core/state.js';
import { appPrompt, toast } from '../ui/dialogs.js';

/* ---------- admin pin gate ---------- */

// Once the correct PIN has been entered once in this tab (or set for the first
// time), critical actions are unlocked for the rest of this session — no need
// to re-enter it for every subsequent edit/delete. Resets on page reload, same
// as rolloverPromptShownThisSession below.
export let adminUnlockedThisSession = false;
export async function hashPin(pin){
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function looksLikeHashedPin(v){ return typeof v==='string' && /^[0-9a-f]{64}$/.test(v); }
// Files saved before hashing was added may still carry a plain-text PIN. Upgrade
// it transparently the first time such a file is loaded, so it's never written
// back out in plain text again.
export async function migratePinIfNeeded(targetDb){
  const pin = targetDb && targetDb.settings && targetDb.settings.adminPin;
  if(pin && !looksLikeHashedPin(pin)){
    targetDb.settings.adminPin = await hashPin(pin);
    markDirty();
  }
}
// Asks for a new PIN twice and returns its hash, or null if cancelled/invalid.
export async function askNewPin(title, intro){
  const pin = await appPrompt(title, intro + '\n\nUse at least 4 characters.', {type:'password', okLabel:'Next'});
  if(pin === null) return null;
  if(pin.trim().length < 4){ toast('PIN must be at least 4 characters — nothing changed', 'error'); return null; }
  const again = await appPrompt('Confirm admin PIN', 'Enter the same PIN again.', {type:'password', okLabel:'Save PIN'});
  if(again === null) return null;
  if(again.trim() !== pin.trim()){ toast('PINs didn\'t match — nothing changed', 'error'); return null; }
  return hashPin(pin.trim());
}
export async function checkAdminPin(actionLabel, callback){
  if(!db.settings) db.settings = { adminPin: null };
  if(adminUnlockedThisSession){ callback(); return; }
  if(!db.settings.adminPin){
    const h = await askNewPin('Set admin PIN', 'No admin PIN is set yet. Set one now to protect critical changes (cancelling, editing, deleting).');
    if(!h){ toast('Action cancelled — an admin PIN is required', 'error'); return; }
    db.settings.adminPin = h;
    markDirty();
    adminUnlockedThisSession = true;
    toast('Admin PIN set', 'success');
    callback();
    return;
  }
  const entered = await appPrompt('Admin PIN required', 'Enter admin PIN to ' + actionLabel + '.', {type:'password', okLabel:'Unlock'});
  if(entered === null) return;
  if(await hashPin(entered.trim()) === db.settings.adminPin){ adminUnlockedThisSession = true; callback(); }
  else { toast('Incorrect PIN — action blocked', 'error'); }
}

export function initAdminPin(){
  // This PIN is a deterrent against accidental edits/cancellations, not a full
  // access-control system (there's no separate login/identity layer here). What
  // it does guarantee: the PIN itself is never stored or exported in plain text.
  // It's hashed (SHA-256) before it touches db.settings.adminPin, so opening the
  // saved .xlsx or the page's dev tools doesn't hand someone the PIN outright.
  if(!db.settings) db.settings = { adminPin: null };
  document.getElementById('btnAdminPin').addEventListener('click', async ()=>{
    if(!db.settings) db.settings = { adminPin: null };
    const hadPin = !!db.settings.adminPin;
    if(hadPin){
      const current = await appPrompt('Change admin PIN', 'Enter your current admin PIN.', {type:'password', okLabel:'Next'});
      if(current === null) return;
      if(await hashPin(current.trim()) !== db.settings.adminPin){ toast('Incorrect PIN', 'error'); return; }
    }
    const h = hadPin
      ? await askNewPin('New admin PIN', 'Enter the new admin PIN.')
      : await askNewPin('Set admin PIN', 'Set an admin PIN to protect critical changes (cancelling, editing, deleting).');
    if(!h) return;
    db.settings.adminPin = h;
    adminUnlockedThisSession = true;
    markDirty();
    toast(hadPin ? 'Admin PIN updated' : 'Admin PIN set', 'success');
  });
}
