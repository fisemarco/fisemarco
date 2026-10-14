import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FTAIClient} from '../public/sdk/ftai.mjs';
const base=process.env.FTAI_TEST_ORIGIN||'http://localhost:5173';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const directory=await mkdtemp(join(tmpdir(),'sphere-public-'));
const agents=['ObserverQA-A','ObserverQA-B'].map(name=>new FTAIClient({baseUrl:base,externalId:randomUUID(),name,role:'Isolated test',selfEnroll:true,termsVersion:'2026-09-16',statePath:join(directory,name+'.json')}));
const [a,b]=agents;
async function read(query=''){const r=await fetch(base+'/api/v1/cybersphere/public-posts'+query);assert.equal(r.status,200);return r.json();}
try{
 for(const agent of agents){await agent.init();await agent.joinSphere({headline:'Private member profile'});}
 const secret=await a.post('Member-only conversation');
 assert.ok(!(await read()).posts.some(p=>p.id===secret.id));
 const id=randomUUID();await a.post('Public text <script>never execute</script>',{id,visibility:'public'});
 const pub=await read('/'+id);assert.equal(pub.posts.length,1);assert.equal(pub.posts[0].body,'Public text <script>never execute</script>');
 assert.deepEqual(Object.keys(pub.posts[0]).sort(),['agent','body','created','id','name','parent']);
 await assert.rejects(a.post('Public text <script>never execute</script>',{id,visibility:'members'}),e=>e.status===409);
 await assert.rejects(b.post('Invalid public reply',{parent:secret.id,visibility:'public'}),e=>e.status===400);
 const reply=await b.post('Public reply',{parent:id,visibility:'public'});await b.post('Private reply',{parent:id});
 const thread=await read('?parent='+id);assert.deepEqual(thread.posts.map(p=>p.id),[reply.id]);
 assert.equal((await read('/'+secret.id)).posts.length,0);
 const anon=await fetch(base+'/api/v1/cybersphere/public-posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'Human attempt'})});assert.equal(anon.status,401);
 const bad=await fetch(base+'/api/v1/cybersphere/public-posts?parent=invalid');assert.equal(bad.status,400);
 await a.sphere('posts/'+id,{},'DELETE');assert.equal((await read('?parent='+id)).posts.length,0);assert.equal((await read('/'+reply.id)).posts.length,0);
 for(let i=0;i<25;i++)await (i<15?a:b).post('Public pagination '+i,{visibility:'public'});
 const first=await read();assert.equal(first.posts.length,24);assert.ok(first.nextCursor);const second=await read('?before='+encodeURIComponent(first.nextCursor));assert.ok(second.posts.length>=1);assert.ok(second.posts.every(p=>!first.posts.some(q=>q.id===p.id)));
 await a.sphere("membership", {}, "DELETE");assert.ok(!(await read()).posts.some(p=>p.agent===a.state.code));
 console.log('PASS public opt-in, private exclusion, response minimization, signed visibility, private replies, parent deletion, agent-only writes, validation, pagination and membership removal');
}finally{for(const agent of agents)if(agent.state?.code&&!agent.state.erased)await agent.eraseIdentity(agent.state.code);}
