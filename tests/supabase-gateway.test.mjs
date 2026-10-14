import assert from "node:assert/strict";
import {build} from "esbuild";
import {PGlite} from "@electric-sql/pglite";
import {createGateway,audience} from "../supabase/functions/fisemarco-db/handler.mjs";
const compiled=await build({entryPoints:["lib/postgres-query.ts"],bundle:true,platform:"node",format:"esm",write:false});
const {postgresQuery}=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const keys=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);
const publicKey=await crypto.subtle.exportKey("jwk",keys.publicKey);
const used=new Set();let calls=0;
const gateway=createGateway({key:publicKey,execute:async(statements,nonce)=>{if(used.has(nonce)){const e=Error();e.code="FISEMARCO_REPLAY";throw e;}used.add(nonce);calls++;return statements.map(()=>({results:[{ready:1}],success:true,meta:{changes:1}}));}});
async function request(statements,{nonce=crypto.randomUUID(),time=String(Date.now()),key=keys.privateKey}={}) {
  const body=JSON.stringify({statements});
  const signature=Buffer.from(await crypto.subtle.sign("Ed25519",key,new TextEncoder().encode(`FISEMARCO_DATABASE_V1\n${audience}\n${time}\n${nonce}\n${body}`))).toString("base64url");
  return new Request(audience,{method:"POST",headers:{"x-ftai-db-time":time,"x-ftai-db-nonce":nonce,"x-ftai-db-signature":signature},body});
}
const stmt=[{query:"UPDATE request_limits SET count=$1 WHERE key=$2",parameters:[1,"qa"]}];
assert.equal((await gateway(new Request(audience,{method:"POST"}))).status,401);
assert.equal((await gateway(new Request(audience))).status,405);
const nonce=crypto.randomUUID();assert.equal((await gateway(await request(stmt,{nonce}))).status,200);
assert.equal((await gateway(await request(stmt,{nonce}))).status,409);
assert.equal((await gateway(await request(stmt,{time:String(Date.now()-120000)}))).status,401);
const other=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);
assert.equal((await gateway(await request(stmt,{key:other.privateKey}))).status,401);
for(const query of ["DROP TABLE agents","SELECT 1; DELETE FROM agents","SELECT 1 -- comment"])assert.equal((await gateway(await request([{query,parameters:[]}]))).status,400);
assert.equal((await gateway(await request([{query:"SELECT ';' AS value",parameters:[]}]))).status,200);
assert.equal(calls,2);
console.log("PASS signed gateway rejects anonymous, forged, expired, replayed and forbidden operations; valid updates work");
const pg=new PGlite();
try {
 await pg.exec('CREATE TABLE sample("user" text PRIMARY KEY, report text, evidence text)');
 await pg.query('INSERT INTO sample VALUES ($1,$2,$3)',["owner",JSON.stringify({evaluationScore:0.96,latencyMs:12,cost:0.03,humanCorrection:true}),JSON.stringify({reviews:[{status:"validated"}]})]);
 const query=async(sql,params=[])=> (await pg.query(postgresQuery(sql),params)).rows;
 const stats=await query("SELECT AVG(json_extract(report,'$.evaluationScore')) evaluationScore, SUM(json_extract(report,'$.cost')) cost, SUM(CASE WHEN json_extract(report,'$.humanCorrection')=1 THEN 1 ELSE 0 END) humanCorrections FROM sample");
 assert.equal(stats[0].evaluationScore,0.96);assert.equal(stats[0].cost,0.03);assert.equal(stats[0].humanCorrections,1);
 assert.equal((await query("SELECT user FROM sample WHERE user IN (SELECT value FROM json_each(?))",['["owner"]']))[0].user,"owner");
 assert.equal((await query("SELECT user FROM sample n WHERE EXISTS(SELECT 1 FROM json_each(n.evidence,'$.reviews') r WHERE json_extract(r.value,'$.status')='validated')"))[0].user,"owner");
 await query("INSERT OR IGNORE INTO sample(user,report,evidence) VALUES (?,?,?)",["owner","{}","{}"]);
 assert.equal((await query("SELECT count(*) total FROM sample"))[0].total,1);
 assert.equal((await query("SELECT user, 'current' AS window FROM sample GROUP BY user,window"))[0].window,"current");
 assert.equal((await query("SELECT 'json_each(?)' literal"))[0].literal,"json_each(?)");
 assert.equal((await query("SELECT `user` FROM sample WHERE user=?",["owner"]))[0].user,"owner");
 console.log("PASS PostgreSQL JSON arrays, validation evidence, numeric/boolean metrics, quoted identifiers, aliases and duplicate suppression");
}finally{await pg.close();}

const adapterBuild=await build({entryPoints:["lib/supabase-http.ts"],bundle:true,platform:"node",format:"esm",write:false,banner:{js:'import {createRequire} from "node:module"; const require=createRequire(process.cwd()+"/package.json");'}});
const {supabaseHttpDatabase}=await import("data:text/javascript;base64,"+Buffer.from(adapterBuild.outputFiles[0].text).toString("base64"));
const privateKey=await crypto.subtle.exportKey("jwk",keys.privateKey);
const actualFetch=globalThis.fetch;
try {
  globalThis.fetch=async(url,options)=>{assert.equal(options.redirect,"manual");return gateway(new Request(url,options));};
  const db=supabaseHttpDatabase(audience,privateKey);
  assert.equal((await db.prepare("SELECT 1 AS ready").first()).ready,1);
  assert.equal((await db.prepare("UPDATE request_limits SET count=? WHERE key=?").bind(2,"qa").run()).success,true);
  assert.equal((await db.batch([db.prepare("SELECT 1"),db.prepare("SELECT 2")])).length,2);
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:"https://example.com"}});
  await assert.rejects(()=>db.prepare("SELECT 1").first(),/HTTP 302/);
  console.log("PASS actual HTTPS database adapter signs prepared statements, bindings and batches accepted by the gateway");
} finally {globalThis.fetch=actualFetch;}

const {readFile}=await import('node:fs/promises');
const securitySource=await readFile('lib/security.ts','utf8');
const quotaSQL=securitySource.match(/"(INSERT INTO request_limits[^"\n]+)"/)[1];
const quotaPg=new PGlite();
try {
 await quotaPg.exec('CREATE TABLE request_limits(id text PRIMARY KEY,count integer,expires bigint)');
 for(const count of [1,2])assert.equal((await quotaPg.query(postgresQuery(quotaSQL),['quota',123])).rows[0].count,count);
 assert.equal((await gateway(await request([{query:postgresQuery(quotaSQL),parameters:['quota',123]}]))).status,200);
 assert.equal((await gateway(await request([{query:'DO $$ BEGIN END $$',parameters:[]}]))).status,400);
 console.log('PASS actual runtime quota SQL increments atomically in PostgreSQL and is accepted by the signed gateway; standalone DO is denied');
} finally {await quotaPg.close();}
