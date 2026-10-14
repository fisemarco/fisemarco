import assert from 'node:assert/strict';
import {build} from 'esbuild';
const out=await build({entryPoints:['lib/monitoring.ts'],bundle:true,format:'esm',write:false});
const {outcomeTrend}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
function rows(cf,cs,pf,ps){return [['current','failed',cf],['current','success',cs],['previous','failed',pf],['previous','success',ps]].map(([window,outcome,count])=>({agent:'a',window,outcome,count}));}
assert.equal(outcomeTrend('a',[]).failureRateIncrease,null);
assert.match(outcomeTrend('a',rows(19,0,0,19)).alert,/Insufficient/);
assert.match(outcomeTrend('a',rows(14,6,10,10)).alert,/increased/);
assert.match(outcomeTrend('a',rows(13,7,10,10)).alert,/No threshold/);
assert.equal(outcomeTrend('b',rows(14,6,10,10)).current.n,0);
console.log('PASS monitoring sample floors, exact 20-point drift boundary, non-alerts and agent isolation');
