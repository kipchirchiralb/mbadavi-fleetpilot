import './errors.js';   // first, so an error anywhere after it is caught and shown
import ExcelJS from 'exceljs';
import { registerSW } from 'virtual:pwa-register';
import { LocalFleetRepository } from './data/repository.js';
import { initTableTools } from './tableTools.js';
import { initKeyNav } from './keyNav.js';

window.ExcelJS = ExcelJS;
window.fleetRepository = new LocalFleetRepository();
initTableTools();
initKeyNav();

// Service workers only work on http(s)/localhost. Inside the Electron .exe
// (file://) there is nothing to register, so skip it and never let it block the app.
if (location.protocol === 'http:' || location.protocol === 'https:') {
  try {
    registerSW({ immediate: true });
  } catch (err) {
    console.warn('Service worker registration skipped:', err);
  }
}

setTimeout(() => document.body.classList.remove('fp-loading'), 15000);   // never leave the screen hidden if start-up goes wrong
import('./ledger.js').catch((err) => {
  console.error('FleetPilot failed to start:', err);
  document.body.classList.remove('fp-loading');
  const banner = document.createElement('div');
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 14px;' +
    'background:#7a1f1f;color:#fff;font:14px system-ui,sans-serif;';
  banner.textContent = 'FleetPilot failed to start: ' + (err && err.message ? err.message : err);
  document.body.appendChild(banner);
});
