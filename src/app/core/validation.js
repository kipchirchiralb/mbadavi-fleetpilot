/* ---------- shared money/date validation ----------
   parseFloat(...)||0 (used throughout this file for numeric inputs) quietly
   turns blanks/garbage into 0, but lets negative numbers straight through —
   so a mistyped "-500" fuel expense or payment would silently pass as valid
   and skew every downstream total, recovery, and report. These two checks are
   the actual gate: call isValidMoney() before accepting an amount a user typed,
   and isReasonableDate() before accepting a date, in the handlers that create
   money-moving records (expenses, payments). */
export function isValidMoney(v, {allowZero=false}={}){
  const n = Number(v);
  if(!Number.isFinite(n)) return false;
  return allowZero ? n>=0 : n>0;
}
export function isReasonableDate(dateStr){
  if(!dateStr) return false;
  const d = new Date(dateStr+'T00:00:00');
  if(isNaN(d)) return false;
  const year = d.getFullYear();
  return year>=2000 && year<=2100;
}
