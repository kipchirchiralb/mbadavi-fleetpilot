// Like harness-main.js, but ExcelJS is the REAL library so Save really writes an .xlsx; the fake 1-byte file is still read from workbook.json.
import { initTableTools } from '/src/tableTools.js';
initTableTools();
import { initKeyNav } from '/src/keyNav.js';
initKeyNav();
const Real = window.ExcelJS;
const toVal = v => v === undefined ? null : (typeof v === 'string' && v.startsWith('@@date:') ? new Date(v.slice(7)) : v);
async function mockLoad(self){
  const W = await (await fetch('/test/workbook.json')).json();
  const sheets = Object.entries(W).map(([name, rows]) => ({ name, rowCount: rows.length, columnCount: Math.max(...rows.map(r => r ? r.length : 0)),
    getRow: i => ({ getCell: c => ({ value: toVal((rows[i - 1] || [])[c - 1]) }) }) }));
  Object.defineProperty(self, 'worksheets', { value: sheets, configurable: true });
}
window.ExcelJS = { Workbook: class extends Real.Workbook { constructor(){ super(); const rx = this.xlsx, self = this;
  Object.defineProperty(this, 'xlsx', { value: { writeBuffer: (...a) => rx.writeBuffer(...a), load: async buf => { if(buf && buf.byteLength === 1) return mockLoad(self); return rx.load(buf); } } }); } } };
window.fleetRepository = { save: async () => {}, load: async () => null };
import('/src/ledger.js').catch(err => { document.body.insertAdjacentHTML('afterbegin', '<pre id="startfail">' + err.message + '</pre>'); console.error(err); });
