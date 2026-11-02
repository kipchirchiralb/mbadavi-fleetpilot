import fs from 'node:fs';
import { analyze } from '../src/importer/index.js';
const W = JSON.parse(fs.readFileSync('workbook.json','utf8'));
const res = analyze(W, { today: '2026-10-24' });
const s = res.stats, ps = res.data.paymentStats;
console.log('invoices', s.invoices, s.invoicesTotal, 'unpaid', s.invoicesUnpaid);
console.log(res.checks.filter(c=>c.group==='Invoices').map(c=>(c.ok?'ok ':'OFF ')+c.label+' '+c.excel+'/'+c.imported).join('\n'));
console.log(JSON.stringify(ps,null,1));
console.log('payments', res.data.payments.length);
