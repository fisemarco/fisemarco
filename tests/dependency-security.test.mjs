import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url), braces=require('braces');
assert.equal(await realpath(require.resolve('braces')),resolve('vendor/braces/index.js'),'installed glob consumers must use the patched local package');
const fork=JSON.parse(await readFile('vendor/braces/package.json','utf8'));
assert.equal(fork.name,'@fisemarco/braces');assert.equal(fork.version,'3.0.3+fisemarco.1');assert.equal(fork.fisemarcoSecurityPatch.advisory,'GHSA-vfj7-8cjw-p6xm');
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
for(const [path,pkg] of Object.entries(lock.packages)){
 if(path.includes('node_modules/')&&path.endsWith('/braces'))assert.ok(pkg.link&&pkg.resolved==='vendor/braces','No vulnerable registry copy may remain: '+path);
 if(path.endsWith('/micromatch')){
  const consumer=createRequire(resolve(path,'package.json'));
  assert.equal(await realpath(consumer.resolve('braces')),resolve('vendor/braces/index.js'),path+' must resolve patched braces');
 }
}
const denied=fn=>assert.throws(fn,e=>e instanceof SyntaxError&&/maximum nesting depth|cyclic|node count/.test(e.message));
let checks=0;
for(const pattern of ['{'.repeat(4000)+'x'+'}'.repeat(4000),'('.repeat(4000)+'x'+')'.repeat(4000),'{'.repeat(4000)+'x']){
 for(const method of ['parse','compile','expand','stringify']){denied(()=>braces[method](pattern,{maxLength:65536,rangeLimit:false,maxDepth:Infinity}));checks++;}
 denied(()=>braces(pattern));checks++;
}
let ast={type:'text',value:'x'};for(let i=0;i<4000;i++)ast={type:'root',nodes:[ast]};
for(const method of ['compile','expand','stringify']){denied(()=>braces[method](ast));checks++;}
const cyclic={type:'root',nodes:[]};cyclic.nodes.push(cyclic);
for(const method of ['compile','expand','stringify']){denied(()=>braces[method](cyclic));checks++;}
const wide={type:'root',nodes:Array.from({length:65537},()=>({type:'text',value:'x'}))};
for(const method of ['compile','expand','stringify']){denied(()=>braces[method](wide));checks++;}
assert.deepEqual(braces.expand('src/{app,lib}/file-{01..03}.ts'),['src/app/file-01.ts','src/app/file-02.ts','src/app/file-03.ts','src/lib/file-01.ts','src/lib/file-02.ts','src/lib/file-03.ts']);checks++;
assert.equal(braces.compile('src/{app,lib}/**/*.{ts,tsx}'),'src/(app|lib)/**/*.(ts|tsx)');checks++;
assert.deepEqual(braces.expand('a{b,{c,d}}e'),['abe','ace','ade']);checks++;
for(const n of [10,64,120]){assert.equal(braces.stringify('('.repeat(n)+'x'+')'.repeat(n)),'('.repeat(n)+'x'+')'.repeat(n));checks++;}
const micromatch=require('micromatch');assert.deepEqual(micromatch(['src/a.ts','src/a.tsx','src/a.js'],['src/*.{ts,tsx}']),['src/a.ts','src/a.tsx']);checks++;
denied(()=>micromatch.braces('{'.repeat(4000)+'x'+'}'.repeat(4000)));checks++;
const fg=require('fast-glob');const files=await fg(['app/**/{page,route}.{ts,tsx}'],{cwd:process.cwd()});assert.ok(files.includes('app/mcp/route.ts'));assert.ok(files.includes('app/about/page.tsx')||files.includes('app/directory/page.tsx'));checks++;
// Exercise the updated native sharp/libvips binary used by the worker emulator.
const sharp=require('sharp');const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#d9824d"/></svg>')).png().toBuffer();assert.equal((await sharp(png).metadata()).width,8);checks++;
// CVE-2026-93749: reject malicious indexed source-map offsets before work.
const {SourceMapConsumer}=require('source-map-js');
for(const line of [-1,0.5,Number.MAX_SAFE_INTEGER,Infinity]){
 assert.throws(()=>new SourceMapConsumer({version:3,sections:[{offset:{line,column:0},map:{version:3,sources:[],names:[],mappings:''}}]}),/Section offset/);checks++;
}
const rsvg=sharp.versions.rsvg.split('.').map(Number);assert.ok(rsvg[0]>2||(rsvg[0]===2&&(rsvg[1]>63||(rsvg[1]===63&&rsvg[2]>=2))),'Native librsvg must include the CVE-2026-96889 fix');checks++;
console.log(`PASS ${checks} dependency security/compatibility checks: installed resolution, hostile patterns/ASTs, micromatch, filesystem globs and native SVG rendering`);
