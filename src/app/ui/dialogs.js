/* ---------- toasts ----------
   Stack in the bottom-right corner (#toast is the container). type is 'error'
   (orange-red, stays longer, announced assertively), 'success' (green) or 'info'.
   Hovering a toast pauses its timer; ✕ dismisses it. */
const TOAST_ICONS = { error: '⚠', success: '✓', info: 'ℹ' };
const TOAST_DURATION = { error: 7000, success: 3500, info: 3500 };
const TOAST_LIMIT = 4;
export function toast(msg, type='info'){
  const stack = document.getElementById('toast');
  if(!stack) return;
  if(!TOAST_ICONS[type]) type = 'info';
  // Repeating the same message (e.g. clicking Save twice) refreshes it instead of stacking copies.
  const same = [...stack.children].find(el=>el.dataset.msg === msg && el.dataset.type === type);
  if(same) same.remove();
  while(stack.children.length >= TOAST_LIMIT) stack.firstElementChild.remove();

  const item = document.createElement('div');
  item.className = `toast-item toast-${type}`;
  item.dataset.msg = msg; item.dataset.type = type;
  item.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const icon = document.createElement('span'); icon.className = 'toast-icon'; icon.textContent = TOAST_ICONS[type]; icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span'); text.className = 'toast-text'; text.textContent = msg;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'toast-close'; close.textContent = '✕'; close.setAttribute('aria-label', 'Dismiss notification');
  item.append(icon, text, close);
  stack.appendChild(item);
  void item.offsetWidth; // commit the hidden start state so the entrance transition runs
  item.classList.add('show');

  let timer = null;
  const dismiss = ()=>{
    clearTimeout(timer);
    item.classList.remove('show');
    setTimeout(()=>item.remove(), 250);
  };
  const start = ()=>{ clearTimeout(timer); timer = setTimeout(dismiss, TOAST_DURATION[type]); };
  close.addEventListener('click', dismiss);
  item.addEventListener('mouseenter', ()=>clearTimeout(timer));
  item.addEventListener('mouseleave', start);
  start();
}
/* ---------- in-app dialogs ----------
   Electron doesn't implement window.prompt() (it always returns null, which
   silently blocked every admin-PIN check in the desktop app), and its native
   window.confirm() can leave text inputs unfocusable on Windows afterwards. These
   render inside the page instead, so they behave the same in the browser and
   the .exe. appPrompt resolves to the entered string or null (cancelled);
   appConfirm resolves to true/false. */
export function appDialog({title, message='', input=null, okLabel='OK', cancelLabel='Cancel'}){
  return new Promise(resolve=>{
    const returnFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.style.zIndex = '10000';
    overlay.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" style="max-width:420px;">
      <div class="modal-head"><div><h2></h2></div></div>
      <div class="modal-body" style="margin-top:12px;">
        <p class="app-dialog-msg" style="white-space:pre-line;margin:0 0 14px;font-size:13.5px;line-height:1.5;color:var(--ink-dim);"></p>
        ${input ? '<input class="app-dialog-input" autocomplete="off" style="width:100%;box-sizing:border-box;padding:9px 10px;margin:0 0 14px;">' : ''}
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button type="button" class="btn app-dialog-cancel" style="width:auto;padding:8px 16px;margin:0;"></button>
          <button type="button" class="btn primary app-dialog-ok" style="width:auto;padding:8px 16px;margin:0;"></button>
        </div>
      </div></div>`;
    overlay.querySelector('h2').textContent = title;
    overlay.querySelector('.app-dialog-msg').textContent = message;
    overlay.querySelector('.app-dialog-msg').style.display = message ? '' : 'none';
    const okBtn = overlay.querySelector('.app-dialog-ok'), cancelBtn = overlay.querySelector('.app-dialog-cancel');
    okBtn.textContent = okLabel; cancelBtn.textContent = cancelLabel;
    const field = overlay.querySelector('.app-dialog-input');
    if(field){ field.type = input.type || 'text'; field.placeholder = input.placeholder || ''; }
    const close = value=>{
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if(returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
      resolve(value);
    };
    const ok = ()=> close(field ? field.value : true);
    const cancel = ()=> close(field ? null : false);
    const onKey = e=>{
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cancel(); }
      else if(e.key === 'Enter' && e.target !== cancelBtn){ e.preventDefault(); e.stopPropagation(); ok(); }
    };
    okBtn.addEventListener('click', ok);
    cancelBtn.addEventListener('click', cancel);
    overlay.addEventListener('mousedown', e=>{ if(e.target === overlay) cancel(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    setTimeout(()=> (field || okBtn).focus(), 0);
  });
}
export function appPrompt(title, message, {type='text', placeholder='', okLabel='OK'} = {}){
  return appDialog({title, message, input:{type, placeholder}, okLabel});
}
export function appConfirm(title, message, okLabel='OK'){
  return appDialog({title, message, okLabel});
}
