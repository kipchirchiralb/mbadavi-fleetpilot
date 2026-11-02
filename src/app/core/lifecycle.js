import { localSavePending, localSaveTimer, saveAutosaveSnapshot } from './autosave.js';
import { checkMonthRollover, openRolloverModal } from './period.js';



export function initLifecycle(){
  window.addEventListener('beforeunload', e=>{
    if(localSavePending){ e.preventDefault(); e.returnValue=''; }
  });
  window.addEventListener('pagehide', ()=>{
    if(localSavePending){
      clearTimeout(localSaveTimer);
      void saveAutosaveSnapshot();
    }
  });
  document.getElementById('rolloverBanner').addEventListener('click', ()=>{
    const now = new Date();
    openRolloverModal(now.getFullYear(), now.getMonth());
  });
  setInterval(checkMonthRollover, 30*60*1000); // re-check every 30 min, for tabs left open across midnight
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden && localSavePending){
      clearTimeout(localSaveTimer);
      void saveAutosaveSnapshot();
    }
    if(!document.hidden) checkMonthRollover();
  });
}
