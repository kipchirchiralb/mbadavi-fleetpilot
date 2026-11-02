/* ---------- shared "jump to this record" navigation ----------
   Used by the watchlist and global search: switches to the right sidebar
   panel, then either scrolls/highlights the matching table row (when the
   record has one, identified by a [data-id] element) or, for alerts that
   point at an action rather than a row (e.g. "go add a payment for this
   rental"), pre-fills and highlights the relevant form field instead. */
export function flashEl(el, ms){
  if(!el) return;
  const orig = el.style.background;
  el.style.background = 'var(--amber-dim)';
  setTimeout(()=>{ el.style.background = orig; }, ms||1800);
}
export function scrollToForm(formId, ms){
  const el = document.getElementById(formId);
  if(!el) return;
  el.scrollIntoView({behavior:'smooth', block:'start'});
  const orig = el.style.boxShadow;
  el.style.transition = 'box-shadow .3s ease';
  el.style.boxShadow = '0 0 0 2px var(--amber)';
  setTimeout(()=>{ el.style.boxShadow = orig; }, ms||1600);
}
export function closeOverlaysForNav(){
  const searchBox = document.getElementById('globalSearchBox'); if(searchBox) searchBox.style.display = 'none';
  const wlOverlay = document.getElementById('watchlistOverlay'); if(wlOverlay) wlOverlay.classList.remove('show');
}
export function navigateToRecord(panel, opts){
  opts = opts || {};
  document.querySelector(`.nav button[data-panel="${panel}"]`)?.click();
  closeOverlaysForNav();
  setTimeout(()=>{
    if(opts.selectId){
      const sel = document.getElementById(opts.selectId);
      if(sel){
        if(opts.value!=null) sel.value = opts.value;
        scrollToForm(opts.formId || (sel.closest('.form-grid')||{}).id);
        sel.focus();
      }
      return;
    }
    const activePanel = document.querySelector('.panel.active');
    const target = activePanel ? activePanel.querySelector(`[data-id="${opts.id}"]`) : null;
    const tr = target ? target.closest('tr') : null;
    if(tr){ tr.scrollIntoView({behavior:'smooth', block:'center'}); flashEl(tr); }
  }, 60);
}
