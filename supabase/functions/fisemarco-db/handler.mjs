export const pinnedKey = { kty: "OKP", crv: "Ed25519", x: "REPLACE_WITH_YOUR_REGISTRY_PUBLIC_KEY_X" };
export const audience = "https://your-project-ref.supabase.co/functions/v1/fisemarco-db";
const encoder = new TextEncoder();
const decode = value => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")), ch => ch.charCodeAt(0));
const reply = (error,status) => Response.json({error},{status,headers:{"cache-control":"no-store"}});
export function createGateway({execute, key = pinnedKey, now = Date.now}) {
  return async request => {
    if (request.method !== "POST") return reply("Method not allowed.",405);
    const time=request.headers.get("x-ftai-db-time"), nonce=request.headers.get("x-ftai-db-nonce"), signature=request.headers.get("x-ftai-db-signature");
    if (!/^\d{13}$/.test(time??"") || Math.abs(now()-Number(time))>60000 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce??"") || !/^[a-zA-Z0-9_-]{86}$/.test(signature??"")) return reply("Unauthorized.",401);
    try {
      const reader=request.body?.getReader(); if(!reader)return reply("Invalid request.",400);
      let size=0;const chunks=[];
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024){await reader.cancel();return reply("Request too large.",413);}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const body=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
      const verifier=await crypto.subtle.importKey("jwk",key,{name:"Ed25519"},false,["verify"]);
      if(!await crypto.subtle.verify("Ed25519",verifier,decode(signature),encoder.encode(`FISEMARCO_DATABASE_V1\n${audience}\n${time}\n${nonce}\n${body}`)))return reply("Unauthorized.",401);
      const {statements}=JSON.parse(body);
      if(!Array.isArray(statements)||!statements.length||statements.length>200)return reply("Invalid statements.",400);
      for(const s of statements){
        if(!s||typeof s.query!=="string"||s.query.length>50000||!Array.isArray(s.parameters)||s.parameters.length>500||s.parameters.some(v=>v!==null&&typeof v!=="string"&&!(typeof v==="number"&&Number.isFinite(v))))return reply("Invalid statements.",400);
        const syntax=s.query.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, "");
        if(!/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(syntax)||/;|--|\/\*|\b(ALTER|CREATE|DROP|TRUNCATE|COPY|GRANT|REVOKE|CALL|LOAD)\b/i.test(syntax))return reply("Statement not permitted.",400);
      }
      const result=await execute(statements,nonce,now());
      return Response.json(result,{headers:{"cache-control":"no-store"}});
    }catch(error){if(error?.code==="FISEMARCO_REPLAY")return reply("Request already used.",409);console.error("FISEMARCO_DATABASE_FAILURE", /^[A-Z0-9_]{1,40}$/.test(error?.code || "") ? error.code : "UNKNOWN");return reply("Database operation unavailable.",503);}
  };
}
