import fs from 'node:fs';
import { analyze } from '../src/importer/index.js';
const res = analyze(JSON.parse(fs.readFileSync('workbook.json','utf8')), { today:'2026-10-24' });
const d = res.data;
console.log('coop', d.coopMatch, 'walkins', d.walkins.length, d.walkins[0], 'ochwada blocks', d.ochwada.length, 'rent', d.standingRent);
console.log('unmatched coop review', res.review.filter(r=>/^COOP_/.test(r.code)).reduce((a,r)=>(a[r.code]=(a[r.code]||0)+1,a),{}));
console.log('ochwada checks', res.checks.filter(c=>c.group==='OCHWADA').map(c=>`${c.label}: ${c.excel} vs ${c.imported}${c.ok?'':' OFF'}`));
