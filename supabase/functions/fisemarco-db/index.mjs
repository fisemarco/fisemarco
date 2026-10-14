import postgres from "npm:postgres@3.4.9";
import {createGateway} from "./handler.mjs";

Deno.serve(createGateway({execute: async(statements,nonce,time)=>{
  const url=Deno.env.get("FTAI_DATABASE_URL");
  if(!url)throw Error("Restricted database credential is required.");
  const ca=Deno.env.get("FTAI_DATABASE_CA");
  const sql=postgres(url,{ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},max:1,prepare:false,connect_timeout:10,idle_timeout:1,max_lifetime:30,connection:{search_path:"ftai_private,pg_catalog",statement_timeout:15000},types:{safeInteger:{to:20,from:[20],serialize:String,parse:value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error("Integer range exceeded.");return n;}}}});
  try{
    const [{role}]=await sql`SELECT current_user AS role`;
    if(role!=="ftai_runtime")throw Error("A restricted runtime role is required.");
    await sql`DELETE FROM gateway_replays WHERE expires < ${time}`;
    const inserted=await sql`INSERT INTO gateway_replays(nonce,expires) VALUES (${nonce},${time+120000}) ON CONFLICT DO NOTHING RETURNING nonce`;
    if(!inserted.length){const error=Error("Replay");error.code="FISEMARCO_REPLAY";throw error;}
    for(let attempt=0;;attempt++){
      try{return await sql.begin("isolation level serializable",async tx=>{const results=[];for(const s of statements){const rows=await tx.unsafe(s.query,s.parameters);results.push({results:[...rows],success:true,meta:{changes:rows.count}});}return results;});}
      catch(error){if(attempt>=2||!["40001","40P01"].includes(error.code))throw error;}
    }
  }finally{await sql.end({timeout:1});}
}}));
