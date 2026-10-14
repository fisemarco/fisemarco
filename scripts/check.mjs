import {spawnSync} from 'node:child_process';
const steps=[['node_modules/typescript/bin/tsc','--noEmit','--noUnusedLocals','--noUnusedParameters'],...['authority.test.mjs','graph-traversal.test.mjs','hero-motion.test.mjs','intelligence.test.mjs','operator-credentials.test.mjs','monitoring.test.mjs','supabase-gateway.test.mjs','supabase.integration.mjs'].map(name=>['tests/'+name])];
for(const args of steps){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status)process.exit(r.status);}
