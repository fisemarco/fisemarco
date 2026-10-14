import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status)process.exit(r.status);}
if(!existsSync('.env')){
 const {privateKey}=generateKeyPairSync('ed25519');
 writeFileSync('.env','FTAI_ORIGIN=http://localhost:5173\nFTAI_SIGNING_JWK='+JSON.stringify(privateKey.export({format:'jwk'}))+'\nFTAI_DB_PROVIDER=d1\nFTAI_CONTROLLER_NAME=Local development operator\nFTAI_PRIVACY_CONTACT=developer@example.invalid\n',{mode:0o600});
 console.log('Created a new ignored local signing identity. Keep .env private.');
}else console.log('Preserving existing .env.');
run(['scripts/run-framework.mjs','build']);
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
for(const binding of config.d1_databases||[])binding.migrations_dir=path.join(root,'drizzle');
mkdirSync('.sites-runtime',{recursive:true});writeFileSync('.sites-runtime/local-migrations.json',JSON.stringify(config,null,2));
run(['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','.sites-runtime/local-migrations.json','--persist-to','.wrangler/state']);
console.log('Local schema prepared. Run npm run dev.');
