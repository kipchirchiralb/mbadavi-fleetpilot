import { renderDashboard } from '../dashboard/cards.js';
import { renderAnalysis } from '../reports/analysis.js';
import { renderReports } from '../reports/reports.js';

/* ---------- nav ---------- */
/* ---------- auto full screen on first interaction ---------- */

/* ---------- full screen toggle ---------- */
export const btnFullscreen = document.getElementById('btnFullscreen');

export function initShell(){
  document.getElementById('nav').addEventListener('click', e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    document.getElementById('panel-'+btn.dataset.panel).classList.add('active');
    document.body.dataset.panel = btn.dataset.panel;
    if(btn.dataset.panel==='reports') renderReports();
    if(btn.dataset.panel==='dashboard') renderDashboard();
    if(btn.dataset.panel==='analysis') renderAnalysis();
  });
  btnFullscreen.addEventListener('click', ()=>{
    if(!document.fullscreenElement){
      (document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(()=>{}));
      document.body.classList.add('fs-active');
      btnFullscreen.textContent = '⤡';
      btnFullscreen.title = 'Exit full screen';
    } else {
      document.exitFullscreen && document.exitFullscreen().catch(()=>{});
    }
  });
  document.addEventListener('fullscreenchange', ()=>{
    if(!document.fullscreenElement){
      document.body.classList.remove('fs-active');
      btnFullscreen.textContent = '⛶';
      btnFullscreen.title = 'Full screen';
    }
  });
  /* Browsers block requestFullscreen() on page load; it must be triggered by
     a user gesture. This fires it on the very first click/tap anywhere on
     the page (skipping the explicit fullscreen button itself, which already
     has its own handler above), so the app effectively "opens" full screen
     as soon as the user touches it. */
  (function(){
    function firstInteractionFullscreen(e){
      if(e.target.closest && e.target.closest('#btnFullscreen')) return;
      if(!document.fullscreenElement){
        (document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(()=>{}));
        document.body.classList.add('fs-active');
        btnFullscreen.textContent = '⤡';
        btnFullscreen.title = 'Exit full screen';
      }
      document.removeEventListener('click', firstInteractionFullscreen, true);
    }
    document.addEventListener('click', firstInteractionFullscreen, true);
  })();
}
