import { escapeHTML } from './format.js';
import { renderAll } from '../app.js';
import { db, markDirty, rolloverPromptShownThisSession, setCurrentFileHandle, setCurrentFileName, setRolloverPromptShown } from './state.js';
import { setPeriodType, setDashCardsAllTime } from '../reports/periodRange.js';
import { toast } from '../ui/dialogs.js';

/* ---------- monthly period tracking ---------- */
export function pad2(n){ return String(n).padStart(2,'0'); }
/* Date.prototype.toISOString() always converts to UTC first. For anyone in a timezone
   ahead of UTC (e.g. East Africa, UTC+3), local midnight is still the PREVIOUS calendar
   day in UTC — so `someDate.toISOString().slice(0,10)` silently returns yesterday's date,
   and for a date built at day 1 / hour 0 (as the monthly period helpers do) that means it
   returns the last day of the PREVIOUS month every single time. Use this instead whenever
   a Date object needs to become a "YYYY-MM-DD" string that still means the same calendar
   day it was created for. */
export function toLocalISO(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
export function monthLabel(y,m){ return ['January','February','March','April','May','June','July','August','September','October','November','December'][m] + ' ' + y; }
export function monthBounds(y,m){
  const start = `${y}-${pad2(m+1)}-01`;
  const lastDay = new Date(y, m+1, 0).getDate();
  const end = `${y}-${pad2(m+1)}-${pad2(lastDay)}`;
  return {start, end};
}
/* Legacy files (saved before period tracking existed) carry no periodStart — infer the
   month they represent from the latest activity date in the file, rather than assuming
   "now" (which would be wrong for an old file opened later). Falls back to the real
   current month only when the file has no dated records at all (a brand-new database). */
export function inferPeriodFromData(targetDb){
  const dates = [];
  (targetDb.rentals||[]).forEach(r=>{ if(r.pickup) dates.push(r.pickup); });
  (targetDb.expenses||[]).forEach(x=>{ if(x.date) dates.push(x.date); });
  (targetDb.bookings||[]).forEach(bk=>{ if(bk.bookedOn) dates.push(bk.bookedOn); });
  let ref;
  if(dates.length){
    dates.sort();
    ref = new Date(dates[dates.length-1]+'T00:00:00');
  } else {
    ref = new Date();
  }
  const {start,end} = monthBounds(ref.getFullYear(), ref.getMonth());
  return { year:ref.getFullYear(), month:ref.getMonth(), start, end, label: monthLabel(ref.getFullYear(), ref.getMonth()) };
}
/* Sets the shared Dashboard/Reports period (used by both panels) to Monthly, pointed
   at whichever month the open file's data actually falls in — the same "latest dated
   entry" logic inferPeriodFromData already uses for db.period. Falls back to today's
   real month when the file has no dated records yet. Called on startup and every time
   a file is loaded, so opening an old saved month shows that month's real figures
   straight away instead of an empty "today" that has no data in it. The period can
   still be changed afterwards via either panel's selector. */
export function resetPeriodToDataDefault(){
  const inferred = inferPeriodFromData(db);
  const refDate = toLocalISO(new Date(inferred.year, inferred.month, 1));
  ['rep_start','rep_end','dash_rep_start','dash_rep_end'].forEach(id=>{ document.getElementById(id).value=''; });
  document.getElementById('rep_ref').value = refDate;
  document.getElementById('dash_rep_ref').value = refDate;
  setPeriodType('monthly');
  // A freshly opened/loaded file also puts the Dashboard cards back on all-time
  // totals, same as pressing "Restore cards to default" — matches Reports' own
  // reset-to-this-file's-data behavior here.
  setDashCardsAllTime(true);
}
export function ensurePeriod(){
  if(!db.period){
    const now = new Date();
    const {start,end} = monthBounds(now.getFullYear(), now.getMonth());
    db.period = { year:now.getFullYear(), month:now.getMonth(), start, end, label: monthLabel(now.getFullYear(), now.getMonth()) };
  }
}
/* Auto-detects when the real calendar month has moved past the open file's period,
   and — per the confirm-before-switching workflow — surfaces a banner plus (once per
   session) an actual confirmation dialog, rather than switching files on its own. */
export function checkMonthRollover(){
  ensurePeriod();
  const now = new Date();
  const isNewMonth = (now.getFullYear() > db.period.year) || (now.getFullYear()===db.period.year && now.getMonth() > db.period.month);
  const banner = document.getElementById('rolloverBanner');
  if(!isNewMonth){ if(banner) banner.style.display = 'none'; return; }
  const label = monthLabel(now.getFullYear(), now.getMonth());
  if(banner){
    banner.style.display = '';
    document.getElementById('rolloverBannerText').textContent = `${label} has started →`;
  }
  if(!rolloverPromptShownThisSession){
    setRolloverPromptShown(true);
    openRolloverModal(now.getFullYear(), now.getMonth());
  }
}
/* Bookings have no "Completed" state (they're either still live or Cancelled).
   Used only for the informational "still open" count in the rollover modal now —
   nothing is actually filtered out of the ledger anymore, see startNewMonth. */
export function getCarryoverBookings(){
  return db.bookings.filter(bk=>bk.status!=='Cancelled');
}
export function openRolloverModal(y,m){
  const existing = document.getElementById('rolloverModalOverlay');
  if(existing) existing.remove();
  const label = monthLabel(y,m);
  const stillOpenBookings = getCarryoverBookings();
  const stillOpenRentals = db.rentals.filter(r=>r.status==='Active');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.id = 'rolloverModalOverlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:480px;">
      <div class="modal-head">
        <div><h2>Start ${label}?</h2>
        <p>Currently working in: <b>${escapeHTML(db.period ? db.period.label : '—')}</b></p></div>
        <button class="modal-close" id="rolloverModalClose">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--ink-dim);line-height:1.55;margin:0 0 14px;">
          It's now ${label}. Nothing gets deleted — this file keeps every booking, rental,
          expense, payment and allowance you've ever entered, the same way a multi-month
          statement would. Starting ${label} just moves the "open" period forward;
          ${escapeHTML(db.period ? db.period.label : 'the current month')} becomes a closed month, which
          locks it behind a confirmation prompt if you (or someone else) ever need to edit
          something in it later.
        </p>
        <div class="hint" style="margin:0 0 16px;">
          Still open going into ${label}: <b>${stillOpenBookings.length}</b> booking(s) not yet cancelled,
          <b>${stillOpenRentals.length}</b> rental(s) still Active.
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="btn" id="rolloverLater" style="width:auto;padding:9px 16px;margin:0;">Not now</button>
          <button class="btn primary" id="rolloverGo" style="width:auto;padding:9px 16px;margin:0;">Start ${label} →</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = ()=> overlay.remove();
  overlay.querySelector('#rolloverModalClose').addEventListener('click', close);
  overlay.querySelector('#rolloverLater').addEventListener('click', close);
  overlay.querySelector('#rolloverGo').addEventListener('click', ()=>{ close(); startNewMonth(y,m); });
}
export function startNewMonth(y,m){
  const {start,end} = monthBounds(y,m);
  const label = monthLabel(y,m);
  const prevLabel = db.period ? db.period.label : null;
  /* Nothing is deleted or filtered here anymore. Bookings, rentals, expenses,
     payments and driver allowances all just keep accumulating — this file behaves
     like a running ledger (the same shape as a multi-month export), not a
     per-month workspace that gets cleared out. The only thing that changes is
     which period counts as "open": everything before db.period.start becomes a
     closed month, which locks it behind an extra confirmation (see
     guardClosedMonth) rather than removing it. */
  db.period = { year:y, month:m, start, end, label };
  setCurrentFileHandle(null);
  setCurrentFileName(`Fleet Ledger - ${label}.xlsx`);
  markDirty();
  renderAll();
  const banner = document.getElementById('rolloverBanner');
  if(banner) banner.style.display = 'none';
  toast(`Started ${label}.${prevLabel ? ' '+prevLabel+' is now locked (still editable with confirmation).' : ''} Nothing was deleted. Click Save to create this month's file.`, 'success');
}
