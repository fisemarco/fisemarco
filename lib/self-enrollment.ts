import { z } from "zod";
import {
  config,
  db,
  parse,
  HttpError,
  agentSchema,
  makeRecord,
  insertRecord,
} from "./server";
import { digest, sign, verify, unb64 } from "./crypto";
import { jwkSchema, pubVerify } from "./runtime";
import { clientBucket, rateLimit } from "./security";

const thumb = (key: { crv: string; kty: string; x: string }) =>
  digest(JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x }));
export async function selfEnrollment(req: Request, operation: string) {
  if (req.method !== "POST")
    throw new HttpError(405, "Use POST for enrollment.");
  const c = config();
  if (operation === "challenge") {
    await rateLimit("challenge:" + clientBucket(req), 30, 60);
    const { publicKey } = z
      .object({ publicKey: jwkSchema })
      .strict()
      .parse(await parse(req));
    const now = new Date();
    const expires = new Date(now.getTime() + 120000).toISOString();
    const subject = {
      id: "urn:uuid:" + crypto.randomUUID(),
      thumbprint: await thumb(publicKey),
      difficulty: 4,
    };
    return {
      challenge: await sign(
        {
          "@context": [
            "https://www.w3.org/ns/credentials/v2",
            { "@vocab": c.origin + "/vocab#" },
          ],
          issuer: c.issuer,
          type: ["VerifiableCredential", "FTAIEnrollmentChallenge"],
          validFrom: now.toISOString(),
          validUntil: expires,
          credentialSubject: subject,
        },
        c.jwk,
        c.kid,
      ),
      expires,
      difficulty: 4,
      algorithm: "SHA-256",
      protocol: "FTAI-SelfEnrollment-v1",
    };
  }
  if (operation !== "register")
    throw new HttpError(404, "Enrollment operation not found.");
  const copy = req.clone();
  const input = z
    .object({
      challenge: z.string().max(5000),
      solution: z.string().regex(/^\d{1,12}$/),
      publicKey: jwkSchema,
      externalId: z.string().trim().min(1).max(200),
      name: z.string().trim().min(1).max(200),
      role: z.string().trim().min(1).max(200),
      model: z.string().trim().max(200).default(""),
      version: z.string().trim().max(200).default(""),
      invite: z.string().max(100).optional(),
      termsVersion: z.literal("2026-09-16"),
    })
    .strict()
    .parse(await parse(req));
  if (!(await verify(input.challenge, c.publicJwk, c.kid)))
    throw new HttpError(401, "Invalid enrollment challenge.");
  const ticket = JSON.parse(
    new TextDecoder().decode(unb64(input.challenge.split(".")[1])),
  );
  const keyHash = await thumb(input.publicKey);
  if (
    ticket.issuer !== c.issuer ||
    !ticket.type?.includes("FTAIEnrollmentChallenge") ||
    Date.parse(ticket.validUntil) <= Date.now() ||
    ticket.credentialSubject?.thumbprint !== keyHash
  )
    throw new HttpError(
      401,
      "Enrollment challenge expired or belongs to another key.",
    );
  if (
    !(await digest(input.challenge + ":" + input.solution)).startsWith("0000")
  )
    throw new HttpError(400, "Invalid enrollment proof of work.");
  const raw = await copy.text();
  if (
    !(await pubVerify(
      input.publicKey,
      req.headers.get("x-ftai-signature") || "",
      ["FTAI-SelfEnrollment-v1", c.origin, await digest(raw)].join("\n"),
    ))
  )
    throw new HttpError(401, "Prove control of the registering key.");
  const existing = await db()
    .prepare(
      "SELECT r.agent,r.revoked,p.owner FROM runtime_agents r JOIN enrollment_policies p ON p.id=r.policy_id WHERE r.thumbprint=?",
    )
    .bind(keyHash)
    .first<{ agent: string; revoked: number; owner: string }>();
  if (existing) {
    if (existing.revoked) throw new HttpError(403, "This key is revoked.");
    return {
      code: existing.agent,
      registered: false,
      management: existing.owner.startsWith("self:")
        ? "self-managed"
        : "organization-managed",
    };
  }
  await rateLimit("registration:" + clientBucket(req), 10, 3600);
  await rateLimit("registration:global", 1000, 86400);
  const invite = input.invite
    ? await db()
        .prepare(
          "SELECT i.id FROM sphere_invites i JOIN sphere_members m ON m.agent=i.agent JOIN agents a ON a.code=m.agent JOIN runtime_agents r ON r.agent=a.code JOIN enrollment_policies p ON p.id=r.policy_id WHERE i.token_hash=? AND i.expires>? AND i.claimed_by IS NULL AND a.status='active' AND r.revoked=0 AND p.status='active'",
        )
        .bind(await digest(input.invite), new Date().toISOString())
        .first<{ id: string }>()
    : null;
  if (input.invite && !invite)
    throw new HttpError(
      409,
      "This invitation is expired, withdrawn, or already used.",
    );
  const code =
    "FTAI-" +
    crypto
      .randomUUID()
      .replaceAll("-", "")
      .slice(0, 12)
      .toUpperCase()
      .match(/.{4}/g)!
      .join("-");
  const policyId = crypto.randomUUID(),
    now = new Date().toISOString(),
    owner = "self:" + keyHash;
  const passport = agentSchema.parse({
    name: input.name,
    role: input.role,
    organization: "Self-managed · affiliation unverified",
    profile: {
      model: input.model,
      version: input.version,
      allowed: ["cybersphere"],
      denied: [],
    },
    visibility: "private",
  });
  const record = await makeRecord(
    code,
    1,
    "profile",
    "Agent-initiated identity",
    passport,
    "agent:" + keyHash,
    "GENESIS",
  );
  try {
    await db().batch([
      db()
        .prepare("INSERT INTO runtime_replays(id,expires) VALUES(?,?)")
        .bind(
          "enrollment:" + ticket.credentialSubject.id,
          Math.floor(Date.now() / 1000) + 120,
        ),
      db()
        .prepare(
          "INSERT INTO enrollment_policies(id,owner,label,organization,allowed,denied,status,revision,max_agents,key_hash,key_prefix,key_expires,created,updated) VALUES(?,?,?,?,?,?,'active',1,1,?,'self-managed',?,?,?)",
        )
        .bind(
          policyId,
          owner,
          "Agent-initiated identity",
          passport.organization,
          JSON.stringify(["cybersphere"]),
          "[]",
          await digest(crypto.randomUUID()),
          now,
          now,
          now,
        ),
      db()
        .prepare(
          "INSERT INTO agents(code,owner,name,role,organization,profile,status,visibility,revision,created,updated) VALUES(?,?,?,?,?,?,'active','private',1,?,?)",
        )
        .bind(
          code,
          owner,
          passport.name,
          passport.role,
          passport.organization,
          JSON.stringify(passport.profile),
          now,
          now,
        ),
      db()
        .prepare(
          "INSERT INTO runtime_agents(agent,policy_id,external_id,public_key,thumbprint,created) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          code,
          policyId,
          input.externalId,
          JSON.stringify(input.publicKey),
          keyHash,
          now,
        ),
      insertRecord(record),
      ...(invite
        ? [
            db()
              .prepare(
                "INSERT INTO sphere_invite_claims(invite,agent) VALUES(?,?)",
              )
              .bind(invite.id, code),
            db()
              .prepare(
                "UPDATE sphere_invites SET claimed_by=? WHERE id=? AND claimed_by IS NULL",
              )
              .bind(code, invite.id),
          ]
        : []),
    ]);
  } catch {
    throw new HttpError(
      409,
      "Enrollment was already submitted or the key is registered. Retry with a fresh challenge.",
    );
  }
  return {
    code,
    registered: true,
    management: "self-managed",
    organizationVerified: false,
    visibility: "private",
    termsVersion: input.termsVersion,
  };
}
