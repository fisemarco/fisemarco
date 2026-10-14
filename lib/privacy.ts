import { db, config, HttpError } from "./server";
import { sign } from "./crypto";

export async function exportPassport(code: string) {
  const row = await db()
    .prepare(
      "SELECT code,name,role,organization,profile,status,visibility,revision,created,updated FROM agents WHERE code=?",
    )
    .bind(code)
    .first();
  if (!row) throw new HttpError(404, "Passport not found.");
  const queries = [
    [
      "organisationAssignment",
      "SELECT organisation,classification,team FROM organisation_agents WHERE agent=?",
    ],
    ["authorityGrants", "SELECT * FROM authority_grants WHERE subject=?"],
    [
      "approvals",
      "SELECT id,organisation,grant_id,agent,request,input_hash,state,created,expires,decided,reason,receipt,consumed FROM authority_approvals WHERE agent=?",
    ],
    ["intelligenceExecutions", "SELECT * FROM intelligence_executions WHERE agent=?"],
    ["certificates", "SELECT * FROM agent_certificates WHERE agent=?"],
    ["authorityEvents", "SELECT * FROM authority_events WHERE agent=?"],
    ["records", "SELECT * FROM records WHERE agent=? ORDER BY sequence"],
    [
      "runtime",
      "SELECT agent,external_id,public_key,thumbprint,revoked,last_seen,runtime_status,heartbeat,created FROM runtime_agents WHERE agent=?",
    ],
    ["permits", "SELECT * FROM work_permits WHERE agent=?"],
    ["attestation", "SELECT * FROM runtime_attestations WHERE agent=?"],
    ["a2aTasks", "SELECT * FROM a2a_tasks WHERE agent=?"],
    ["notices", "SELECT * FROM sphere_notices WHERE agent=?"],
    ["membership", "SELECT * FROM sphere_members WHERE agent=?"],
    ["posts", "SELECT * FROM sphere_posts WHERE agent=?"],
    [
      "connections",
      "SELECT source,target,kind,created FROM sphere_edges WHERE source=?",
    ],
    [
      "invitations",
      "SELECT id,expires,claimed_by,created FROM sphere_invites WHERE agent=?",
    ],
  ];
  const data: Record<string, unknown> = {
    passport: row,
    exportedAt: new Date().toISOString(),
  };
  for (const [key, sql] of queries)
    data[key] = (await db().prepare(sql).bind(code).all()).results;
  return data;
}
/** Deliberate, terminal erasure. Identity codes are reserved; personal claims are removed. */
export async function erasePassport(code: string) {
  const runtime = await db()
    .prepare(
      "SELECT r.policy_id,p.owner FROM runtime_agents r JOIN enrollment_policies p ON p.id=r.policy_id WHERE r.agent=?",
    )
    .bind(code)
    .first<{ policy_id: string; owner: string }>();
  const c = config(),
    erased = new Date().toISOString();
  const receipt = await sign(
    {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        { "@vocab": c.origin + "/vocab#" },
      ],
      issuer: c.issuer,
      type: ["VerifiableCredential", "FTAIErasureReceipt"],
      validFrom: erased,
      credentialSubject: {
        code,
        erased,
        status: "retired",
        recordsRemoved: true,
        codeReusable: false,
      },
    },
    c.jwk,
    c.kid,
  );
  const emptyProfile = JSON.stringify({
    description: "",
    creator: "",
    operator: "",
    model: "",
    version: "",
    skills: [],
    allowed: [],
    denied: [],
    externalDid: "",
    endpoint: "",
  });
  await db().batch([
    db().prepare("DELETE FROM intelligence_executions WHERE agent=?").bind(code),
    db().prepare("DELETE FROM agent_certificates WHERE agent=?").bind(code),
    db().prepare("DELETE FROM authority_events WHERE agent=?").bind(code),
    db().prepare("DELETE FROM authority_approvals WHERE agent=?").bind(code),
    db().prepare("DELETE FROM authority_grants WHERE subject=?").bind(code),
    db().prepare("DELETE FROM organisation_agents WHERE agent=?").bind(code),
    db()
      .prepare("INSERT INTO erasure_authorizations(agent) VALUES(?)")
      .bind(code),
    db()
      .prepare("DELETE FROM sphere_edges WHERE source=? OR target=?")
      .bind(code, code),
    db().prepare("DELETE FROM sphere_notices WHERE agent=?").bind(code),
    db().prepare("DELETE FROM sphere_posts WHERE agent=?").bind(code),
    db()
      .prepare(
        "DELETE FROM sphere_invite_claims WHERE agent=? OR invite IN (SELECT id FROM sphere_invites WHERE agent=?)",
      )
      .bind(code, code),
    db()
      .prepare(
        "UPDATE sphere_invites SET claimed_by=NULL,expires=created WHERE claimed_by=?",
      )
      .bind(code),
    db().prepare("DELETE FROM sphere_invites WHERE agent=?").bind(code),
    db().prepare("DELETE FROM sphere_members WHERE agent=?").bind(code),
    db().prepare("DELETE FROM work_permits WHERE agent=?").bind(code),
    db().prepare("DELETE FROM oauth_tokens WHERE agent=?").bind(code),
    db().prepare("DELETE FROM a2a_tasks WHERE agent=?").bind(code),
    db().prepare("DELETE FROM runtime_attestations WHERE agent=?").bind(code),
    db().prepare("DELETE FROM runtime_agents WHERE agent=?").bind(code),
    db().prepare("DELETE FROM records WHERE agent=?").bind(code),
    db()
      .prepare(
        "UPDATE agents SET owner=?,name='Erased identity',role='Retired',organization='Removed',profile=?,status='retired',visibility='private',revision=0,updated=? WHERE code=?",
      )
      .bind("erased:" + crypto.randomUUID(), emptyProfile, erased, code),
    db()
      .prepare(
        "INSERT INTO privacy_erasures(agent,erased,receipt) VALUES(?,?,?)",
      )
      .bind(code, erased, receipt),
    ...(runtime?.owner.startsWith("self:")
      ? [
          db()
            .prepare("DELETE FROM enrollment_policies WHERE id=?")
            .bind(runtime.policy_id),
        ]
      : []),
    db().prepare("DELETE FROM erasure_authorizations WHERE agent=?").bind(code),
  ]);
  return {
    erased: true,
    code,
    receipt,
    retained:
      "Reserved code, original issue date and erasure receipt. No profile or work records remain in the live database.",
    limits:
      "Recipient-held exports and hosting backups are outside this live-database operation. The controller must apply its backup and rights-handling policy.",
  };
}
