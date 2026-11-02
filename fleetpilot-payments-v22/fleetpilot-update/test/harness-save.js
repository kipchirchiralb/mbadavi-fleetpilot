import { initTableTools } from '/src/tableTools.js';
initTableTools();
const toVal = v => v === undefined ? null : (typeof v === 'string' && v.startsWith('@@date:') ? new Date(v.slice(7)) : v);
const loose = () => new Proxy(function(){}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : loose(), apply: () => loose(), set: () => true });
function mkRow(ws, values, n){ const r = { number: n, values, outlineLevel: 0, font: null, ws };
  r.getCell = c => new Proxy({ get value(){ return r.values[c - 1] === undefined ? null : r.values[c - 1]; }, set value(v){ r.values[c - 1] = v; } }, { get: (t, k) => k in t ? t[k] : loose(), set: (t, k, v) => { if(k === 'value') r.values[c - 1] = v; else t[k] = v; return true; } });
  return new Proxy(r, { get: (t, k) => k in t ? t[k] : loose(), set: (t, k, v) => { t[k] = v; return true; } }); }
function mkSheet(name){ const ws = { name, rows: [], properties: {}, views: [], columns: [] };
  ws.addRow = vals => { const r = mkRow(ws, Array.isArray(vals) ? vals.slice() : Object.values(vals), ws.rows.length + 1); ws.rows.push(r); return r; };
  ws.getRow = n => { while(ws.rows.length < n) ws.addRow([]); return ws.rows[n - 1]; };
  ws.eachRow = cb => ws.rows.forEach((r, i) => cb(r, i + 1));
  ws.getColumn = i => { ws.columns[i] = ws.columns[i] || {}; return ws.columns[i]; };
  Object.defineProperty(ws, 'rowCount', { get: () => ws.rows.length });
  return new Proxy(ws, { get: (t, k) => k in t ? t[k] : loose(), set: (t, k, v) => { t[k] = v; return true; } }); }
class Workbook { constructor(){ this.worksheets = []; this.xlsx = { writeBuffer: async () => ({ __wb: this }), load: async (buf) => { if(buf && buf.__wb){ this.worksheets = buf.__wb.worksheets; return; }
      const W = await (await fetch('/test/workbook.json')).json();
      this.worksheets = Object.entries(W).map(([name, rows]) => ({ name, rowCount: rows.length, columnCount: Math.max(...rows.map(r => r ? r.length : 0)), getRow: i => ({ getCell: c => ({ value: toVal((rows[i - 1] || [])[c - 1]) }) }) })); } }; window.__wbs = window.__wbs || []; window.__wbs.push(this); }
  addWorksheet(name){ const w = mkSheet(name); this.worksheets.push(w); return w; }
  getWorksheet(n){ return this.worksheets.find(w => w.name === n); }
  get creator(){ return ''; } set creator(v){} get created(){ return null; } set created(v){} }
window.ExcelJS = { Workbook };
window.fleetRepository = { save: async () => {}, load: async () => null };
import('/src/ledger.js').catch(err => { document.body.insertAdjacentHTML('afterbegin', '<pre id="startfail">' + err.message + '</pre>'); console.error(err); });
