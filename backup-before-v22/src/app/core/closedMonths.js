import { monthLabel } from './period.js';
import { db } from './state.js';
import { appConfirm } from '../ui/dialogs.js';

/* ---------- closed-month locking ----------
   The ledger no longer gets wiped at rollover (see startNewMonth) — every past
   record just keeps accumulating. To stop someone from casually changing a month
   that's already been saved/reported on, any record dated before the current
   open period's start counts as "closed" and needs an extra confirmation (on top
   of whatever admin PIN gate already applies) before it can be touched. */
export function isClosedMonth(dateStr){
  return !!(db.period && dateStr && dateStr < db.period.start);
}
export function monthOfDate(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  return monthLabel(d.getFullYear(), d.getMonth());
}
export function guardClosedMonth(dateStr, actionLabel, callback){
  if(!isClosedMonth(dateStr)){ callback(); return; }
  appConfirm('Closed month',
    `This record is in ${monthOfDate(dateStr)}, a closed month you've likely already saved/reported on.\n\nContinue to ${actionLabel}?`,
    'Continue').then(ok=>{ if(ok) callback(); });
}
/* Small inline lock icon for date cells in closed months, so it's visible at a
   glance in the table which rows need the extra confirmation to touch. */
export function lockBadge(dateStr){
  return isClosedMonth(dateStr) ? ` <span title="${monthOfDate(dateStr)} is closed — editing needs confirmation" style="cursor:default;">🔒</span>` : '';
}
