import { z } from "zod";
import { db, config, HttpError, getRecords, checkChain } from "./server";
import { sign, unb64 } from "./crypto";
import type { AgentRow, RuntimeRow, PolicyRow } from "./rows";
import { member, chainFor, liveChainIssue } from "./enterprise-core";
export const certificateScheme = "FTAI-Runtime-Identity/1";
export async function assessAgent(org: string, agent: string) {
  const assigned = await db()
    .prepare(
      "SELECT agent FROM organisation_agents WHERE organisation=? AND agent=?",
    )
    .bind(org, agent)
    .first();
  if (!assigned)
    throw new HttpError(404, "Agent is not assigned to this organisation.");
  const a = await db()
    .prepare("SELECT * FROM agents WHERE code=?")
    .bind(agent)
    .first<AgentRow>();
  const r = await db()
    .prepare("SELECT * FROM runtime_agents WHERE agent=?")
    .bind(agent)
    .first<RuntimeRow>();
  const p = r
    ? await db()
        .prepare("SELECT * FROM enrollment_policies WHERE id=?")
        .bind(r.policy_id)
        .first<PolicyRow>()
    : null;
  const integrity = a ? await checkChain(a, await getRecords(agent)) : null;
  const checks = [
    {
      id: "active-identity",
      pass: a?.status === "active",
      basis: "Current registry lifecycle state",
    },
    {
      id: "runtime-key",
      pass: !!r && !r.revoked,
      basis: "Enrolled proof-of-possession key is not revoked",
    },
    {
      id: "active-policy",
      pass: p?.status === "active",
      basis: "Current enrollment policy state",
    },
    {
      id: "recent-heartbeat",
      pass: !!r?.last_seen && Date.now() - Date.parse(r.last_seen) < 300000,
      basis: "Authenticated runtime contacted registry within five minutes",
    },
    {
      id: "record-integrity",
      pass: !!integrity && integrity.valid === true,
      basis: "Registry signed record chain validates",
    },
  ];
  return {
    scheme: certificateScheme,
    agent,
    organisation: org,
    eligible: checks.every((c) => c.pass),
    checks,
    keyThumbprint: r?.thumbprint ?? null,
    revision: a?.revision ?? null,
    assessedAt: new Date().toISOString(),
    scope:
      "Technical identity and cooperative runtime registration only. Does not certify competence, output safety, legal ownership, EU compliance or ISO conformity.",
  };
}
type Certificate = {
  id: string;
  organisation: string;
  agent: string;
  scheme: string;
  issued: string;
  expires: string;
  revoked: number;
  reason: string | null;
  credential: string;
};
async function currentCertificate(org: string, c: Certificate) {
  try {
    const assessment = await assessAgent(org, c.agent);
    const issued = JSON.parse(
      new TextDecoder().decode(unb64(c.credential.split(".")[1])),
    ).vc.credentialSubject;
    return assessment.eligible &&
      assessment.keyThumbprint === issued.keyThumbprint &&
      assessment.revision === issued.revision
      ? "current"
      : "requirements-no-longer-met";
  } catch {
    return "requirements-no-longer-met";
  }
}
export async function certificates(
  org: string,
  user: string,
  method: string,
  body: unknown,
  id?: string,
  query: unknown = {},
) {
  await member(
    org,
    user,
    method !== "GET" &&
      !(
        method === "POST" &&
        typeof body === "object" &&
        body !== null &&
        "issue" in body &&
        body.issue === false
      ),
  );
  if (method === "GET") {
    const q = z
      .object({
        after: z.string().max(100).default(""),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .strict()
      .parse(query);
    const cursor = q.after
      ? q.after.split("|")
      : ["9999-12-31T23:59:59.999Z", "ffffffff-ffff-ffff-ffff-ffffffffffff"];
    if (cursor.length !== 2)
      throw new HttpError(400, "Invalid certificate cursor");
    z.string().datetime().parse(cursor[0]);
    z.string().uuid().parse(cursor[1]);
    const rows = (
      await db()
        .prepare(
          "SELECT * FROM agent_certificates WHERE organisation=? AND (issued<? OR (issued=? AND id<?)) ORDER BY issued DESC,id DESC LIMIT ?",
        )
        .bind(org, cursor[0], cursor[0], cursor[1], q.limit + 1)
        .all<Certificate>()
    ).results;
    return {
      scheme: certificateScheme,
      next:
        rows.length > q.limit
          ? rows[q.limit - 1].issued + "|" + rows[q.limit - 1].id
          : null,
      certificates: await Promise.all(
        rows.slice(0, q.limit).map(async (c) => ({
          ...c,
          status: c.revoked
            ? "revoked"
            : Date.parse(c.expires) <= Date.now()
              ? "expired"
              : await currentCertificate(org, c),
        })),
      ),
    };
  }
  if (method === "DELETE" && id) {
    const { reason } = z
      .object({ reason: z.string().trim().min(3).max(500) })
      .strict()
      .parse(body);
    const result = await db()
      .prepare(
        "UPDATE agent_certificates SET revoked=1,reason=? WHERE id=? AND organisation=?",
      )
      .bind(reason, id, org)
      .run();
    if (!result.meta.changes)
      throw new HttpError(404, "Certificate unavailable.");
    return { revoked: true };
  }
  if (method !== "POST" || id)
    throw new HttpError(405, "Unsupported certificate operation.");
  const input = z
    .object({
      agent: z.string().regex(/^FTAI-(?:[A-F0-9]{4}-){2}[A-F0-9]{4}$/),
      issue: z.boolean().default(false),
    })
    .strict()
    .parse(body);
  const assessment = await assessAgent(org, input.agent);
  if (!input.issue) return assessment;
  if (!assessment.eligible)
    throw new HttpError(
      409,
      "Technical criteria are not met. Run assessment for individual results.",
    );
  const existing = await db()
    .prepare(
      "SELECT id FROM agent_certificates WHERE organisation=? AND agent=? AND revoked=0 AND expires>?",
    )
    .bind(org, input.agent, new Date().toISOString())
    .first();
  if (existing)
    throw new HttpError(
      409,
      "A current certificate already exists; revoke it before reissuing.",
    );
  const c = config(),
    iat = Math.floor(Date.now() / 1000),
    certId = crypto.randomUUID();
  const credential = await sign(
    {
      iss: c.issuer,
      jti: certId,
      sub: input.agent,
      iat,
      exp: iat + 86400,
      vc: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        type: ["VerifiableCredential", "FTAIRuntimeIdentityCertificate"],
        credentialSubject: assessment,
        credentialStatus: {
          type: "FTAIAuthenticatedLiveStatus",
          id: `${c.origin}/api/v1/organisations/${org}/certifications`,
        },
      },
    },
    c.jwk,
    c.kid,
  );
  const inserted = await db()
    .prepare(
      "INSERT INTO agent_certificates(id,organisation,agent,scheme,issued,expires,credential) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM agent_certificates WHERE organisation=? AND agent=? AND revoked=0 AND expires>?)",
    )
    .bind(
      certId,
      org,
      input.agent,
      certificateScheme,
      new Date(iat * 1000).toISOString(),
      new Date((iat + 86400) * 1000).toISOString(),
      credential,
      org,
      input.agent,
      new Date().toISOString(),
    )
    .run();
  if (!inserted.meta.changes)
    throw new HttpError(
      409,
      "A certificate was issued concurrently. Refresh the list.",
    );
  return { id: certId, credential, assessment };
}
export async function graphHandshake(org: string, user: string, body: unknown) {
  await member(org, user);
  const { grant } = z.object({ grant: z.string().uuid() }).strict().parse(body);
  const chain = await chainFor(grant, org);
  const assessment = await assessAgent(org, chain[0].subject);
  const error = await liveChainIssue(chain);
  return {
    agent: chain[0].subject,
    chain: chain.map((g) => ({
      id: g.id,
      parent: g.parent,
      subject: g.subject,
      expires: g.expires,
    })),
    authority: error ? "invalid" : "valid-declared-chain",
    reason: error,
    assessment,
    executionAuthorized: false,
  };
}
