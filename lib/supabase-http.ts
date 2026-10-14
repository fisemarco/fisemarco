import type { RegistryDatabase, Statement, DatabaseResult } from "./database-types";
import { PgStatement } from "./postgres";
import { postgresQuery } from "./postgres-query";
import { b64 } from "./crypto";

/** Server-only signed HTTPS transport. No browser or service-role key is used. */
export function supabaseHttpDatabase(endpoint: string, signingJwk: JsonWebKey): RegistryDatabase {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.hostname.endsWith(".supabase.co") || url.pathname !== "/functions/v1/fisemarco-db") throw Error("Invalid Supabase database gateway.");
  const execute = async (statements: {query: string; parameters: (string | number | null)[]}[]) => {
    let stage = "translation";
    try {
    const body = JSON.stringify({statements: statements.map(s => ({query: postgresQuery(s.query), parameters: s.parameters}))});
    if (new TextEncoder().encode(body).length > 1024 * 1024) throw Error("Database request exceeds the gateway limit.");
    const timestamp = String(Date.now()), nonce = crypto.randomUUID();
    stage = "key import";
    const key = await crypto.subtle.importKey("jwk", signingJwk, {name:"Ed25519"}, false, ["sign"]);
    const message = new TextEncoder().encode(`FISEMARCO_DATABASE_V1\n${url.href}\n${timestamp}\n${nonce}\n${body}`);
    stage = "signature";
    const signature = b64(new Uint8Array(await crypto.subtle.sign("Ed25519", key, message)));
    stage = "request";
    const response = await fetch(url.href, {method:"POST", redirect:"manual", signal:AbortSignal.timeout(30000), headers:{"content-type":"application/json", "x-ftai-db-time":timestamp, "x-ftai-db-nonce":nonce, "x-ftai-db-signature":signature}, body});
    if (!response.ok) throw Error(`Supabase gateway returned HTTP ${response.status}.`);
    stage = "response decoding";
    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.length !== statements.length || data.some(r => !r || r.success !== true || !Array.isArray(r.results) || r.results.some((row: unknown) => !row || typeof row !== "object" || Array.isArray(row)) || !Number.isSafeInteger(r.meta?.changes) || r.meta.changes < 0)) throw Error("Invalid Supabase database response.");
    return data as DatabaseResult<Record<string, unknown>>[];
    } catch (error) {
      if (error instanceof Error) Object.assign(error, { gatewayPhase: stage });
      throw error;
    }
  };
  return {
    prepare: query => new PgStatement(execute as ConstructorParameters<typeof PgStatement>[0], query),
    batch: (statements: Statement[]) => {
      if (statements.some(s => !(s instanceof PgStatement))) throw Error("Mixed database statements are not supported.");
      return execute(statements as PgStatement[]);
    },
  };
}
