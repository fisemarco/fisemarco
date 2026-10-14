import { db, config, HttpError } from "./server";
import { sign } from "./crypto";
import { inspectChain, type Grant } from "./authority";
export async function receipt(subject: unknown) {
  const c = config();
  const iat = Math.floor(Date.now() / 1000);
  return sign(
    {
      iss: c.issuer,
      iat,
      exp: iat + 300,
      vc: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        type: ["VerifiableCredential", "FTAIAuthorityReceipt"],
        credentialSubject: subject,
      },
    },
    c.jwk,
    c.kid,
  );
}
export async function chainFor(id: string, org: string) {
  const chain = (
    await db()
      .prepare(
        `WITH RECURSIVE ancestry AS (
    SELECT g.*,0 AS depth FROM authority_grants g WHERE g.id=? AND g.organisation=?
    UNION ALL
    SELECT g.*,a.depth+1 FROM authority_grants g JOIN ancestry a ON a.parent=g.id WHERE g.organisation=? AND a.depth<8
  ) SELECT * FROM ancestry ORDER BY depth`,
      )
      .bind(id, org, org)
      .all<Grant>()
  ).results;
  if (!chain.length) throw new HttpError(404, "Authority chain unavailable.");
  return chain;
}
export async function liveChainIssue(chain: Grant[]) {
  const issue = inspectChain(chain);
  if (issue) return issue;
  const subjects = [...new Set(chain.map((g) => g.subject))];
  const rows = (
    await db()
      .prepare(
        `SELECT a.code,a.status,r.revoked,p.status policy_status FROM agents a
    JOIN organisation_agents o ON o.agent=a.code
    LEFT JOIN runtime_agents r ON r.agent=a.code LEFT JOIN enrollment_policies p ON p.id=r.policy_id
    WHERE o.organisation=? AND a.code IN (SELECT value FROM json_each(?))`,
      )
      .bind(chain[0].organisation, JSON.stringify(subjects))
      .all<{
        code: string;
        status: string;
        revoked: number | null;
        policy_status: string | null;
      }>()
  ).results;
  if (
    rows.length !== subjects.length ||
    rows.some(
      (r) =>
        r.status !== "active" ||
        r.revoked !== 0 ||
        r.policy_status !== "active",
    )
  )
    return "A chain participant is unassigned, inactive, revoked or lacks an active runtime policy.";
  return null;
}
export async function member(org: string, user: string, write = false) {
  const m = await db()
    .prepare(
      "SELECT m.role,o.name AS organisation_name FROM organisation_members m JOIN organisations o ON o.id=m.organisation WHERE m.organisation=? AND m.user=?",
    )
    .bind(org, user)
    .first<{ role: string; organisation_name: string }>();
  if (!m) throw new HttpError(404, "Organisation unavailable.");
  if (write && !["owner", "admin"].includes(m.role))
    throw new HttpError(403, "Organisation administrator access is required.");
  return m;
}
