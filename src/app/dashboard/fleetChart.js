import { db, markDirty } from '../core/state.js';

/* ---------- dashboard chart: fleet status, pie or bar (admin's choice) ---------- */
export const CHART_COLORS = { Available:'#4F9E6E', Rented:'#E8A33D', Maintenance:'#D9695F', Inactive:'#5B6572' };
export function renderDashChart(){
  const seg = document.getElementById('dashChartSeg');
  const type = (db.settings && db.settings.chartType) || 'pie';
  seg.querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.c===type));

  const statuses = ['Available','Rented','Maintenance','Inactive'];
  const counts = statuses.map(s=> db.vehicles.filter(v=>v.status===s).length);
  const total = counts.reduce((a,b)=>a+b,0);

  const canvas = document.getElementById('dashChartCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const legend = document.getElementById('dashChartLegend');
  if(!total){
    legend.innerHTML = '<div class="hint" style="margin:0;">Add vehicles to see the fleet status breakdown.</div>';
    return;
  }

  if(type==='pie'){
    const cx=130, cy=130, r=110;
    let start = -Math.PI/2;
    statuses.forEach((s,i)=>{
      if(!counts[i]) return;
      const slice = (counts[i]/total) * Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,start,start+slice);
      ctx.closePath();
      ctx.fillStyle = CHART_COLORS[s];
      ctx.fill();
      start += slice;
    });
    ctx.beginPath(); ctx.arc(cx,cy,r*0.55,0,Math.PI*2);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--panel') || '#171F29';
    ctx.fill();
  } else {
    const maxC = Math.max(1, ...counts);
    const barW = 42, gap = 24, baseY = 230, top = 20;
    const startX = (canvas.width - (statuses.length*barW + (statuses.length-1)*gap))/2;
    statuses.forEach((s,i)=>{
      const h = (counts[i]/maxC) * (baseY-top);
      const x = startX + i*(barW+gap);
      ctx.fillStyle = CHART_COLORS[s];
      ctx.fillRect(x, baseY-h, barW, h || 1);
      ctx.fillStyle = '#8A93A3';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(counts[i]), x+barW/2, baseY-h-6);
    });
  }

  legend.innerHTML = statuses.map((s,i)=>{
    const pct = total ? Math.round(counts[i]/total*100) : 0;
    return `<div style="display:flex;align-items:center;gap:9px;margin-bottom:9px;font-size:13.5px;">
      <span style="width:11px;height:11px;border-radius:3px;background:${CHART_COLORS[s]};flex-shrink:0;"></span>
      <span style="flex:1;">${s}</span>
      <span style="font-family:var(--mono);color:var(--ink-dim);">${counts[i]} (${pct}%)</span>
    </div>`;
  }).join('');
}

export function initFleetChart(){
  document.getElementById('dashChartSeg').addEventListener('click', e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    db.settings.chartType = btn.dataset.c;
    markDirty();
    renderDashChart();
  });
}
