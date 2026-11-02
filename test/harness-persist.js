// real LocalFleetRepository (IndexedDB) + the fake workbook import, to test close / reopen
import { initTableTools } from '/src/tableTools.js';
import { LocalFleetRepository } from '/src/data/repository.js';
initTableTools();
import { initKeyNav } from '/src/keyNav.js';
initKeyNav();
window.fleetRepository = new LocalFleetRepository();

const toVal = v => v === undefined ? null : (typeof v === 'string' && v.startsWith('@@date:') ? new Date(v.slice(7)) : v);
window.ExcelJS = { Workbook: class { constructor(){ this.worksheets = []; this.xlsx = { load: async () => {
  const W = await (await fetch('/test/workbook.json')).json();
  this.worksheets = Object.entries(W).map(([name, rows]) => ({ name, rowCount: rows.length, columnCount: Math.max(...rows.map(r => r ? r.length : 0)),
    getRow: i => ({ getCell: c => ({ value: toVal((rows[i - 1] || [])[c - 1]) }) }) }));
} }; } } };
import('/src/ledger.js').catch(err => { document.body.insertAdjacentHTML('afterbegin', '<pre id="startfail">' + err.message + '</pre>'); console.error(err); });
