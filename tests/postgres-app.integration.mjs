// Execute the real HTTP handlers and SDK suites against isolated PostgreSQL.
// No production database, credential, network request or user record is used.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
const base='http://localhost:5173';
const pg=new PGlite();
const actualFetch=globalThis.fetch;
const root=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
globalThis.__fisemarcoStagingEnv={FTAI_ORIGIN:'https://legacy-issuer.example.invalid',FTAI_PUBLIC_ORIGIN:base,FTAI_SIGNING_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',root.privateKey)),FTAI_CONTROLLER_NAME:'Staging operator',FTAI_PRIVACY_CONTACT:'qa@example.invalid',FTAI_MODERATOR_IDS:'pg-staging-owner'};
try {
 await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE FUNCTION public.rls_auto_enable() RETURNS void LANGUAGE sql AS 'SELECT';");
 for(const name of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await pg.exec(await readFile('supabase/migrations/'+name,'utf8'));
 await pg.exec('SET ROLE ftai_runtime; SET search_path=ftai_private,pg_catalog;');
 const compiled=await build({stdin:{contents:`export {GET as api} from './app/api/v1/[[...path]]/route'; export {POST as token} from './app/oauth/token/route'; export {POST as revoke} from './app/oauth/revoke/route'; export {POST as a2a} from './app/a2a/route'; export {POST as mcp} from './app/api/mcp/route'; export {POST as builderMcp} from './app/mcp/route'; export {GET as card} from './app/.well-known/agent-card.json/route'; export {GET as jwks} from './app/.well-known/jwks.json/route'; export {GET as did} from './app/.well-known/did.json/route'; export {GET as discovery} from './app/.well-known/ftai-passport.json/route'; export {GET as authorization} from './app/.well-known/oauth-authorization-server/route'; export {GET as resource} from './app/.well-known/oauth-protected-resource/[...resource]/route'; export {PgStatement} from './lib/postgres'; export {postgresQuery} from './lib/postgres-query';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,banner:{js:'import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");'},plugins:[{name:'isolated-worker-environment',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'environment',namespace:'staging'}));b.onLoad({filter:/.*/,namespace:'staging'},()=>({contents:'export const env=globalThis.__fisemarcoStagingEnv;',loader:'js'}));}}]});
 const app=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const execute=statements=>pg.transaction(async tx=>{
   const results=[];
   for(const statement of statements){
     const query=app.postgresQuery(statement.query);
     try {const r=await tx.query(query,statement.parameters);for(const row of r.rows)for(const f of r.fields)if(f.dataTypeID===20&&row[f.name]!==null)row[f.name]=Number(row[f.name]);results.push({results:r.rows,success:true,meta:{changes:r.affectedRows||0}});}
     catch(e){console.error('STAGING SQL failure:',e.message,query);throw e;}
   }
   return results;
 });
 globalThis.__fisemarcoStagingEnv.DB={prepare:query=>new app.PgStatement(execute,query),batch:execute};
 globalThis.fetch=async(input,init)=>{
   let req=new Request(input,init);const url=new URL(req.url);
   assert.equal(url.origin,base,'Staging must not contact an external service.');
   if(url.pathname==='/signin-with-chatgpt')return new Response(null,{status:302,headers:{'set-cookie':'pg_staging_session=owner; HttpOnly; SameSite=Lax','location':'/'}});
   const headers=new Headers(req.headers);headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
   if(headers.get('cookie')?.includes('pg_staging_session=owner')){headers.set('oai-authenticated-user-id','pg-staging-owner');headers.set('oai-authenticated-user-email','qa@example.invalid');}
   req=new Request(req,{headers});
   if(url.pathname.startsWith('/api/v1/'))return app.api(req);
   const routes={'/oauth/token':'token','/oauth/revoke':'revoke','/a2a':'a2a','/api/mcp':'mcp','/mcp':'builderMcp','/.well-known/agent-card.json':'card','/.well-known/jwks.json':'jwks','/.well-known/did.json':'did','/.well-known/ftai-passport.json':'discovery','/.well-known/oauth-authorization-server':'authorization'};
   if(routes[url.pathname])return app[routes[url.pathname]](req);
   if(url.pathname.startsWith('/.well-known/oauth-protected-resource/'))return app.resource(req,{params:Promise.resolve({resource:url.pathname.replace('/.well-known/oauth-protected-resource/','').split('/')})});
   if(/^\/[a-zA-Z0-9/_.-]+$/.test(url.pathname)&&!url.pathname.includes('..')){try{return new Response(await readFile('public'+url.pathname));}catch{}}
   return new Response('Not found',{status:404});
 };
 const list=(process.env.FTAI_PG_SUITES||'registry,runtime,standards,testnet').split(',');
 for(const suite of list){assert.ok(['registry','runtime','standards','testnet','public-sphere'].includes(suite));await pg.query('DELETE FROM request_limits');console.log('POSTGRES APPLICATION SUITE:',suite);await import('./'+suite+'.integration.mjs');}
 console.log('PASS real application handlers and SDK suites on isolated PostgreSQL; legacy identity issuer preserved with a different service origin');
} finally {globalThis.fetch=actualFetch;delete globalThis.__fisemarcoStagingEnv;await pg.close();}
