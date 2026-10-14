import type { AgentRow, KeyRow, RecordRow } from "./rows";
import type { RegistryDatabase } from "./database-types";
import { postgresDatabase } from "./postgres";
import { supabaseHttpDatabase } from "./supabase-http";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { digest, sign, verify, unb64 } from "./crypto";
import type { Agent, WorkRecord } from "./model";
import { HttpError } from "./http-error";
export { HttpError } from "./http-error";
export function db(): RegistryDatabase {
  const settings = env as unknown as Record<string, string | undefined>;
  if (settings.FTAI_DB_PROVIDER === "maintenance")
    throw new HttpError(
      503,
      "The registry is undergoing database maintenance. Please retry shortly.",
    );
  if (settings.FTAI_DB_PROVIDER === "supabase") {
    if (settings.FTAI_SUPABASE_GATEWAY_URL) return supabaseHttpDatabase(settings.FTAI_SUPABASE_GATEWAY_URL, config().jwk);
    if (!settings.FTAI_DATABASE_URL)
      throw new HttpError(
        503,
        "Supabase server credentials are not configured.",
      );
    return postgresDatabase(
      settings.FTAI_DATABASE_URL,
      settings.FTAI_DATABASE_CA,
    );
  }
  if (settings.FTAI_DB_PROVIDER && settings.FTAI_DB_PROVIDER !== "d1")
    throw new HttpError(503, "Unsupported database provider.");
  if (!env.DB)
    throw new HttpError(
      503,
      "The registry is temporarily unavailable. Please try again.",
    );
  return env.DB;
}
export function config() {
  const e = env as unknown as Record<string, string | undefined>;
  if (!e.FTAI_SIGNING_JWK || !e.FTAI_ORIGIN)
    throw new HttpError(
      503,
      "Passport signing is unavailable. Please try again later.",
    );
  const jwk = JSON.parse(e.FTAI_SIGNING_JWK);
  // Identity issuer remains tied to the original origin across domain changes.
  const identityOrigin = e.FTAI_ORIGIN;
  const origin = e.FTAI_PUBLIC_ORIGIN || identityOrigin;
  const publicUrl = new URL(origin);
  if (publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) throw new HttpError(503, "Invalid public service origin.");
  const issuer = `did:web:${new URL(identityOrigin).host.replace(/:/g, "%3A")}`;
  const publicJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
  return { jwk, publicJwk, origin, issuer, kid: issuer + "#registry-key-1" };
}
export async function auth(req: Request, write = false, keysAllowed = true) {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && keysAllowed) {
    const key = await db()
      .prepare("SELECT * FROM api_keys WHERE hash=? AND expires>?")
      .bind(await digest(bearer.slice(7)), new Date().toISOString())
      .first<KeyRow>();
    if (!key || (write && key.scope !== "write"))
      throw new HttpError(
        403,
        "This API key is invalid, expired, or does not permit writing.",
      );
    return { id: key.owner, label: `API key: ${key.label}`, api: true };
  }
  const id = req.headers.get("oai-authenticated-user-id");
  const email = req.headers.get("oai-authenticated-user-email");
  if (!id || !email)
    throw new HttpError(401, "Sign in to access your workspace.");
  if (write) {
    const origin = req.headers.get("origin");
    if (!origin || origin !== new URL(req.url).origin)
      throw new HttpError(
        403,
        "This action must be submitted from this website.",
      );
  }
  return { id, label: "Workspace owner", api: false };
}
export const textField = z.string().trim().min(1).max(200);
const short = z.string().trim().max(200).default("");
const safeUrl = z
  .union([
    z.literal(""),
    z
      .string()
      .url()
      .max(2000)
      .refine((s) => new URL(s).protocol === "https:", "Use an HTTPS URL"),
  ])
  .default("");
export const profileSchema = z.object({
  description: z.string().trim().max(2000).default(""),
  creator: short,
  operator: short,
  model: short,
  version: short,
  skills: z.array(textField).max(30).default([]),
  allowed: z.array(textField).max(30).default([]),
  denied: z.array(textField).max(30).default([]),
  externalDid: z
    .string()
    .trim()
    .max(500)
    .refine(
      (s) => !s || /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/.test(s),
      "Enter a valid DID",
    )
    .default(""),
  endpoint: safeUrl,
});
export const agentSchema = z.object({
  name: textField,
  role: textField,
  organization: textField,
  profile: profileSchema,
  status: z.enum(["active", "suspended", "retired"]).default("active"),
  visibility: z.enum(["private", "shared"]).default("private"),
});
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Enter a real date",
  );
const recordBase = {
  id: z.string().uuid(),
  title: textField,
  evidenceUrl: safeUrl,
  evidenceHash: z
    .string()
    .regex(/^$|^[a-fA-F0-9]{64}$/)
    .default(""),
  notes: z.string().max(4000).default(""),
};
export const recordSchema = z.discriminatedUnion("kind", [
  z.object({
    ...recordBase,
    kind: z.literal("employment"),
    employer: textField,
    role: textField,
    startDate: date,
    endDate: z.union([date, z.literal("")]).default(""),
    compensation: short,
  }),
  z.object({
    ...recordBase,
    kind: z.literal("employment_end"),
    employmentId: z.string().uuid(),
    endDate: date,
  }),
  z.object({
    ...recordBase,
    kind: z.literal("task"),
    employmentId: z.string().uuid().or(z.literal("")).default(""),
    outcome: z.enum(["success", "failed", "partial"]),
    durationSeconds: z.number().int().min(0).max(31536000),
    intervention: z.boolean(),
    version: textField,
  }),
  z.object({
    ...recordBase,
    kind: z.literal("benchmark"),
    suite: textField,
    score: z.number().min(0).max(100),
    samples: z.number().int().min(1).max(100000000),
    version: textField,
  }),
  z.object({
    ...recordBase,
    kind: z.literal("credential"),
    issuer: textField,
    credentialId: short,
    issued: date,
    expires: z.union([date, z.literal("")]).default(""),
  }),
  z.object({
    ...recordBase,
    kind: z.literal("incident"),
    severity: z.enum(["low", "medium", "high", "critical"]),
    state: z.enum(["open", "resolved"]),
    version: textField,
  }),
  z.object({
    ...recordBase,
    kind: z.literal("incident_resolution"),
    incidentId: z.string().uuid(),
  }),
  z.object({
    ...recordBase,
    kind: z.literal("version"),
    version: textField,
    model: textField,
  }),
  z.object({
    ...recordBase,
    kind: z.literal("review"),
    employer: textField,
    rating: z.number().min(1).max(5),
    employmentId: z.string().uuid(),
  }),
  z.object({
    ...recordBase,
    kind: z.literal("correction"),
    targetId: z.string().uuid(),
  }),
]);
export async function parse(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Send JSON with Content-Type: application/json.");
  const limit = 65536;
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new HttpError(
      413,
      "The record is too large. Use a link or SHA-256 hash for evidence.",
    );
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "A JSON body is required.");
  let size = 0;
  let txt = "";
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "The record is too large.");
    }
    txt += decoder.decode(value, { stream: true });
  }
  txt += decoder.decode();
  try {
    return JSON.parse(txt);
  } catch {
    throw new HttpError(400, "Enter valid JSON.");
  }
}
export function agentView(row: AgentRow, owner?: string): Agent {
  const c = config();
  const { owner: recordOwner, ...publicRow } = row;
  return {
    ...publicRow,
    canEdit: recordOwner === owner,
    profile: JSON.parse(row.profile),
    did: c.issuer + ":api:v1:agents:" + row.code,
  };
}
export async function getAgent(code: string, owner?: string, edit = false) {
  if (!owner) throw new HttpError(401, "Sign in to view this passport.");
  const row = await db()
    .prepare("SELECT * FROM agents WHERE code=?")
    .bind(code)
    .first<AgentRow>();
  if (
    !row ||
    (edit && row.owner !== owner) ||
    (row.owner !== owner && row.visibility !== "shared")
  )
    throw new HttpError(
      404,
      "Passport not found or not shared with this audience.",
    );
  return row;
}
export async function getRecords(code: string) {
  const { results } = await db()
    .prepare("SELECT * FROM records WHERE agent=? ORDER BY sequence ASC")
    .bind(code)
    .all<RecordRow>();
  const rs = results.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  const withdrawn = new Set(
    rs.filter((r) => r.kind === "correction").map((r) => r.payload.targetId),
  );
  return rs.map((r) => ({
    ...r,
    withdrawn: withdrawn.has(r.id),
  })) as WorkRecord[];
}
export function credential(
  subject: unknown,
  id: string,
  time: string,
): Record<string, unknown> {
  const c = config();
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      {
        ftai: `${c.origin}/vocab#`,
        record: { "@id": "ftai:record", "@type": "@json" },
      },
    ],
    id: `urn:uuid:${id}`,
    type: ["VerifiableCredential"],
    issuer: c.issuer,
    validFrom: time,
    credentialSubject: subject,
  };
}
export async function makeRecord(
  agent: string,
  sequence: number,
  kind: string,
  title: string,
  payload: unknown,
  actor: string,
  previousHash: string,
  id = crypto.randomUUID(),
) {
  const created = new Date().toISOString();
  const content = {
    id,
    agent,
    sequence,
    kind,
    title,
    payload,
    actor,
    created,
    previous_hash: previousHash,
  };
  const hash = await digest(JSON.stringify(content));
  const c = config();
  const vc = credential(
    { id: c.issuer + ":api:v1:agents:" + agent, record: { ...content, hash } },
    id,
    created,
  );
  return { ...content, hash, jws: await sign(vc, c.jwk, c.kid) };
}
export function insertRecord(r: Awaited<ReturnType<typeof makeRecord>>) {
  return db()
    .prepare(
      "INSERT INTO records(id,agent,sequence,kind,title,payload,actor,created,previous_hash,hash,jws) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      r.id,
      r.agent,
      r.sequence,
      r.kind,
      r.title,
      JSON.stringify(r.payload),
      r.actor,
      r.created,
      r.previous_hash,
      r.hash,
      r.jws,
    );
}
export async function append(
  row: AgentRow,
  kind: string,
  title: string,
  payload: unknown,
  actor: string,
  id?: string,
  update?: z.infer<typeof agentSchema>,
) {
  const prior = await db()
    .prepare(
      "SELECT hash FROM records WHERE agent=? ORDER BY sequence DESC LIMIT 1",
    )
    .bind(row.code)
    .first<RecordRow>();
  const r = await makeRecord(
    row.code,
    row.revision + 1,
    kind,
    title,
    payload,
    actor,
    prior?.hash || "GENESIS",
    id,
  );
  const q = update
    ? db()
        .prepare(
          "UPDATE agents SET name=?,role=?,organization=?,profile=?,status=?,visibility=?,revision=revision+1,updated=? WHERE code=? AND revision=?",
        )
        .bind(
          update.name,
          update.role,
          update.organization,
          JSON.stringify(update.profile),
          update.status,
          update.visibility,
          r.created,
          row.code,
          row.revision,
        )
    : db()
        .prepare(
          "UPDATE agents SET revision=revision+1,updated=? WHERE code=? AND revision=?",
        )
        .bind(r.created, row.code, row.revision);
  try {
    await db().batch([insertRecord(r), q]);
  } catch (e) {
    console.error("Append failed", e instanceof Error ? e.name : "unknown");
    throw new HttpError(
      409,
      "This passport changed while saving. Refresh and try again; your input is preserved.",
    );
  }
  return r;
}
export async function checkChain(row: AgentRow, rs: WorkRecord[]) {
  const c = config();
  let previous = "GENESIS";
  let valid = true;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    const content = {
      id: r.id,
      agent: r.agent,
      sequence: r.sequence,
      kind: r.kind,
      title: r.title,
      payload: r.payload,
      actor: r.actor,
      created: r.created,
      previous_hash: r.previous_hash,
    };
    const hash = await digest(JSON.stringify(content));
    const vc = JSON.parse(new TextDecoder().decode(unb64(r.jws.split(".")[1])));
    if (
      r.sequence !== i + 1 ||
      r.previous_hash !== previous ||
      r.hash !== hash ||
      JSON.stringify(vc.credentialSubject?.record) !==
        JSON.stringify({ ...content, hash }) ||
      !(await verify(r.jws, c.publicJwk, c.kid))
    )
      valid = false;
    previous = r.hash;
  }
  let projected: z.infer<typeof agentSchema> | null = null;
  for (const r of rs) {
    if (r.kind === "profile") {
      const parsed = agentSchema.safeParse(r.payload);
      if (parsed.success) projected = parsed.data;
      else valid = false;
    } else if (r.kind === "version" && projected) {
      if (
        typeof r.payload.version !== "string" ||
        typeof r.payload.model !== "string"
      )
        valid = false;
      else {
        projected.profile.version = r.payload.version;
        projected.profile.model = r.payload.model;
      }
    }
  }
  if (
    !projected ||
    (["name", "role", "organization", "status", "visibility"] as const).some(
      (k) => projected[k] !== row[k],
    ) ||
    JSON.stringify(projected.profile) !== row.profile
  )
    valid = false;
  return {
    valid: valid && rs.length === row.revision && rs.length > 0,
    records: rs.length,
    head: previous,
    checkedAt: new Date().toISOString(),
    issuer: c.issuer,
    meaning:
      "Signature and record integrity only. Claims are owner-reported or runtime-reported, not independently verified.",
  };
}
