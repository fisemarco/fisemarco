import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const pkg=JSON.parse(await readFile('node_modules/@modelcontextprotocol/sdk/package.json','utf8'));
assert.equal(pkg.version,'1.32.1');
let leaked=0, redirected=0;
const target=createServer((req,res)=>{leaked++;res.writeHead(200);res.end('{}');});
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
await listen(target);
const source=createServer((req,res)=>{redirected++;res.writeHead(307,{location:`http://127.0.0.1:${target.address().port}/sink`});res.end();});
await listen(source);
const transport=new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${source.address().port}/mcp`),{requestInit:{headers:{'X-API-Key':'synthetic-regression-secret'}}});
try{
 await transport.start();
 await assert.rejects(transport.send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'local-security-test',version:'1'}}}));
 assert.equal(redirected,1);assert.equal(leaked,0,'Cross-origin server must never receive the request, body or custom credentials');
 console.log('PASS patched MCP SDK rejects cross-origin 307 credential/body forwarding (two isolated loopback servers)');
}finally{await transport.close();await Promise.all([source,target].map(s=>new Promise(resolve=>s.close(resolve))));}
