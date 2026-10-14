// Read-only authenticated candidate probe. Credential stays in memory/stdin.
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
let input="";
const config=await new Promise((resolve,reject)=>{process.stdin.on("data",chunk=>{input+=chunk;if(input.includes("\n")){process.stdin.pause();try{resolve(JSON.parse(input.trim()));}catch{reject(Error("Invalid input."));}}});});
const response=await fetch(config.origin+"/api/v1/health?backend=supabase",{headers:{"OAI-Sites-Authorization":config.token},redirect:"manual",signal:AbortSignal.timeout(40000)});
input="";config.token=undefined;
console.log(JSON.stringify({status:response.status,result:await response.json()}));
process.exit(response.ok?0:1);
