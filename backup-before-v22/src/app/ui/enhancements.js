/* ---------- app-wide usability enhancements ----------
   Small behaviours that apply across every screen rather than to one feature. */

// The splash advertises "Click to skip" but only ever faded out on its own after 6s.
function initSplashSkip(){
  const splash = document.getElementById('introSplash');
  if(!splash) return;
  const skip = ()=>{
    splash.classList.add('skip');
    splash.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', skip, true);
  };
  splash.addEventListener('click', skip);
  document.addEventListener('keydown', skip, true);
  splash.addEventListener('animationend', e=>{
    if(e.animationName === 'introFadeOut') document.removeEventListener('keydown', skip, true);
  });
}

// Escape closes whichever modal is on top. The in-app dialog and the watchlist
// handle Escape themselves (and stop it), so this only sees the remaining ones.
function topOpenModal(){
  const open = document.querySelectorAll('.modal-overlay.show');
  return open[open.length - 1] || null;
}
function initEscapeToClose(){
  document.addEventListener('keydown', e=>{
    if(e.key !== 'Escape' || e.defaultPrevented) return;
    const modal = topOpenModal();
    if(!modal) return;
    const closeBtn = modal.querySelector('.modal-close, [id$="Close"]');
    if(closeBtn) closeBtn.click();
    else modal.classList.remove('show');
    e.preventDefault();
  });
}

// Pressing Enter in a record form saves it, like a regular <form> would.
function initEnterToSave(){
  document.addEventListener('keydown', e=>{
    if(e.key !== 'Enter' || e.isComposing || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    const field = e.target;
    if(!(field instanceof HTMLInputElement) || ['button', 'submit', 'checkbox', 'radio', 'file'].includes(field.type)) return;
    const form = field.closest('.form-grid');
    if(!form || topOpenModal()) return;
    const save = form.querySelector('[id^="btnAdd"]') || (form.parentElement && form.parentElement.querySelector('[id^="btnAdd"]'));
    if(!save || save.disabled) return;
    e.preventDefault();
    save.click();
  });
}

// Disables a button while its async handler runs, so a double-click can't start a
// second save/load (each one builds a whole workbook).
export function busyButton(handler){
  return async function(event){
    const button = event && event.currentTarget;
    if(button && button.getAttribute('aria-busy') === 'true') return;
    if(button){ button.setAttribute('aria-busy', 'true'); button.disabled = true; }
    try{ return await handler.call(this, event); }
    finally{ if(button){ button.removeAttribute('aria-busy'); button.disabled = false; } }
  };
}

export function initEnhancements(){
  initSplashSkip();
  initEscapeToClose();
  initEnterToSave();
}
