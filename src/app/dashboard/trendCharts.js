import { fmt } from '../core/format.js';
import { ensurePeriod } from '../core/period.js';
import { db } from '../core/state.js';

/* ---------- dashboard: revenue status + cash flow ---------- */
/* The first graph is intentionally styled like the supplied reference:
   smooth filled curves with a previous/current comparison. It compares
   cumulative rental revenue day-by-day for the current open-file month
   against the previous month. */
export function monthRevenueSeries(offsetMonths){
  ensurePeriod();
  const base = new Date(db.period.year, db.period.month + offsetMonths, 1);
  const year = base.getFullYear(), month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const vals = Array(daysInMonth).fill(0);
  db.rentals.forEach(r=>{
    if(r.status==='Cancelled' || !r.pickup) return;
    const d = new Date(r.pickup+'T00:00:00');
    if(d.getFullYear()!==year || d.getMonth()!==month) return;
    vals[d.getDate()-1] += Number(r.amount)||0;
  });
  let running = 0;
  return vals.map(v => running += v);
}
export function monthShortLabelOffset(offsetMonths){
  ensurePeriod();
  const d = new Date(db.period.year, db.period.month + offsetMonths, 1);
  return d.toLocaleDateString(undefined,{month:'short'});
}
export function renderTrendCharts(){
  const current = monthRevenueSeries(0);
  const previous = monthRevenueSeries(-1);
  const days = Math.max(current.length, previous.length);
  const currentVals = Array.from({length:days},(_,i)=>current[i]||0);
  const previousVals = Array.from({length:days},(_,i)=>previous[i]||0);
  const currentTotal = current[current.length-1]||0;
  const previousTotal = previous[previous.length-1]||0;
  const lastDay = new Date().getDate();
  const currentLabel = monthShortLabelOffset(0);
  const previousLabel = monthShortLabelOffset(-1);

  document.getElementById('trendSubtitle').textContent =
    `${fmt(currentTotal)} current · ${fmt(previousTotal)} previous`;
  document.getElementById('cashFlowSubtitle').textContent =
    `${fmt(currentTotal-previousTotal)} revenue change vs previous month`;
  document.getElementById('trendChartSvg').innerHTML =
    buildAreaComparisonSvg(previousVals, currentVals, currentLabel, previousLabel, lastDay);

  /* Keep the existing cash-flow summary, but make it use the current month. */
  const expenses = {};
  for(let i=1;i<=currentVals.length;i++) expenses[i]=0;
  db.expenses.forEach(x=>{
    if(!x.date) return;
    const d = new Date(x.date+'T00:00:00');
    ensurePeriod();
    if(d.getFullYear()===db.period.year && d.getMonth()===db.period.month){
      expenses[d.getDate()] = (expenses[d.getDate()]||0) + (Number(x.amount)||0);
    }
  });
  const dailyNet = currentVals.map((v,i)=>{
    const day = i+1;
    const prev = i ? currentVals[i-1] : 0;
    return (v-prev) - (expenses[day]||0);
  });
  const flowDays = Array.from({length:currentVals.length},(_,i)=>i+1);
  document.getElementById('cashFlowSvg').innerHTML = buildBarChartSvg(dailyNet, flowDays);
}
export function shortFmt(v){
  const n = Math.round(v);
  if(Math.abs(n)>=1000000) return (n/1000000).toFixed(1)+'M';
  if(Math.abs(n)>=1000) return (n/1000).toFixed(1)+'k';
  return String(n);
}
export function smoothPath(vals,x,y){
  if(!vals.length) return '';
  if(vals.length===1) return `M${x(0).toFixed(1)},${y(vals[0]).toFixed(1)}`;
  let d=`M${x(0).toFixed(1)},${y(vals[0]).toFixed(1)}`;
  for(let i=1;i<vals.length;i++){
    const x0=x(i-1), x1=x(i);
    const y0=y(vals[i-1]), y1=y(vals[i]);
    const cp=(x1-x0)/3;
    d += ` C${(x0+cp).toFixed(1)},${y0.toFixed(1)} ${(x1-cp).toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}
export function buildAreaComparisonSvg(previousVals,currentVals,currentLabel,previousLabel,lastDay){
  const w=700,h=235,padL=48,padR=12,padT=16,padB=34;
  const n=Math.max(previousVals.length,currentVals.length,1);
  const realMax=Math.max(1,...previousVals,...currentVals);
  const plotW=w-padL-padR, plotH=h-padT-padB;
  const x=i=>padL+(i/(Math.max(1,n-1)))*plotW;
  const y=v=>padT+plotH-(v/realMax)*plotH;
  const baseY=padT+plotH;
  let grid='';
  for(let g=0;g<=4;g++){
    const gy=padT+plotH-(g/4)*plotH;
    grid += `<line x1="${padL}" y1="${gy}" x2="${w-padR}" y2="${gy}" style="stroke:var(--line);stroke-width:1;"/>`;
    grid += `<text x="${padL-8}" y="${gy+4}" text-anchor="end" font-size="10" font-family="var(--mono)" style="fill:var(--ink-faint);">${shortFmt((g/4)*realMax)}</text>`;
  }
  let labels='';
  const step=Math.max(1,Math.ceil(n/6));
  for(let i=0;i<n;i++){
    if(i%step===0 || i===n-1){
      labels += `<text x="${x(i).toFixed(1)}" y="${h-10}" text-anchor="middle" font-size="10" font-family="var(--mono)" style="fill:var(--ink-faint);">${i+1}</text>`;
    }
  }
  const prevPath=smoothPath(previousVals,x,y);
  const curPath=smoothPath(currentVals,x,y);
  const prevArea=`${prevPath} L${x(n-1).toFixed(1)},${baseY.toFixed(1)} L${x(0).toFixed(1)},${baseY.toFixed(1)} Z`;
  const curArea=`${curPath} L${x(n-1).toFixed(1)},${baseY.toFixed(1)} L${x(0).toFixed(1)},${baseY.toFixed(1)} Z`;
  const markerIndex=Math.min(Math.max(lastDay-1,0),n-1);

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img" aria-label="Revenue status comparison">
    <defs>
      <linearGradient id="prevRevenueFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:#2E9BE6;stop-opacity:.30"/>
        <stop offset="100%" style="stop-color:#2E9BE6;stop-opacity:.02"/>
      </linearGradient>
      <linearGradient id="curRevenueFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:var(--green);stop-opacity:.34"/>
        <stop offset="100%" style="stop-color:var(--green);stop-opacity:.03"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${prevArea}" style="fill:url(#prevRevenueFill);stroke:none;"/>
    <path d="${curArea}" style="fill:url(#curRevenueFill);stroke:none;"/>
    <path d="${prevPath}" style="fill:none;stroke:#2E9BE6;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"/>
    <path d="${curPath}" style="fill:none;stroke:var(--green);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"/>
    <line x1="${x(markerIndex).toFixed(1)}" y1="${padT}" x2="${x(markerIndex).toFixed(1)}" y2="${baseY}" style="stroke:var(--amber);stroke-width:1;stroke-dasharray:3 4;opacity:.7;"/>
    <circle cx="${x(markerIndex).toFixed(1)}" cy="${y(currentVals[markerIndex]||0).toFixed(1)}" r="4" style="fill:var(--green);stroke:var(--panel);stroke-width:2;"/>
    ${labels}
  </svg>`;
}
/* Day-of-month tick labels for the trend bar chart below — was referenced by
   buildBarChartSvg() but never actually defined, so every render of the
   dashboard trend chart threw a ReferenceError and crashed renderDashboard()
   entirely. Since renderDashboard() runs on every load AND on every markDirty()
   (i.e. every single add/edit/delete anywhere in the app), this was breaking
   the whole render pipeline on every data change, not just the chart. */
export function xLabels(days, x){
  const y = 200 - 26 + 14; // matches buildBarChartSvg's h=200, padB=26
  const step = days <= 10 ? 1 : (days <= 20 ? 5 : 5);
  let labels = '';
  for(let i=0; i<days; i++){
    if(i % step !== 0 && i !== days-1) continue;
    labels += `<text x="${x(i).toFixed(1)}" y="${y}" text-anchor="middle" style="font-size:9px;fill:var(--ink-faint);">${i+1}</text>`;
  }
  return labels;
}
export function buildBarChartSvg(netVals, days){
  const w=640,h=200,padL=44,padR=8,padT=10,padB=26;
  const maxAbs = Math.max(1, ...netVals.map(Math.abs));
  const plotW = w-padL-padR, plotH = h-padT-padB;
  const zeroY = padT + plotH/2;
  const gap = plotW/netVals.length, barW = gap*0.6;
  const x = i => padL + i*gap + gap/2;
  let bars = '';
  netVals.forEach((v,i)=>{
    if(!v) return;
    const bh = (Math.abs(v)/maxAbs)*(plotH/2);
    const bx = padL + i*gap + (gap-barW)/2;
    const by = v>=0 ? zeroY-bh : zeroY;
    bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(bh,1).toFixed(1)}" rx="1.5" style="fill:${v>=0?'var(--green)':'var(--red)'};"/>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
    <line x1="${padL}" y1="${zeroY}" x2="${w-padR}" y2="${zeroY}" style="stroke:var(--line);stroke-width:1;"/>
    ${bars}
    ${xLabels(days,x)}
  </svg>`;
}
