import {
  createOrganisation,
  assignOrganisationAgent,
} from "./organisation-actions";
import { trustGraph } from "./trust-graph";
import { descendingCursor, descendingPage } from "./pagination";
import { certificates, graphHandshake } from "./certification";
import { z } from "zod";
import { auth, db, parse, HttpError } from "./server";
import { digest } from "./crypto";
import { receipt, chainFor, member } from "./enterprise-core";
import {
  runtimeGovernance,
  organisationGovernance,
  operatorStatus,
} from "./governance";
import {
  constraintsSchema,
  actionSchema,
  inspectChain,
  attenuates,
  evaluateAuthority,
} from "./authority";
const now = () => new Date().toISOString();
const idSchema = z.string().uuid();
const codeSchema = z.string().regex(/^FTAI-(?:[A-F0-9]{4}-){2}[A-F0-9]{4}$/);
async function grantPage(org: string, query: unknown) {
  const q = descendingCursor(query, 200);
  const rows = (
    await db()
      .prepare(
        "SELECT * FROM authority_grants WHERE organisation=? AND (created<? OR (created=? AND id<?)) ORDER BY created DESC,id DESC LIMIT ?",
      )
      .bind(org, q.created, q.created, q.id, q.limit + 1)
      .all<{ id: string; created: string }>()
  ).results;
  const page = descendingPage(rows, q.limit);
  return { grants: page.items, next: page.next };
}
export async function enterprise(req: Request, path: string[]) {
  const method = req.method;
  if (
    ["authorize", "delegate", "approval-request", "approval-consume"].includes(
      path[1],
    ) &&
    method === "POST"
  )
    return runtimeGovernance(req, path[1]);
  const user = await auth(req, method !== "GET", false);
  const body = method === "GET" ? {} : await parse(req);
  if (path[1] === "join" && method === "POST") {
    const { token } = z
      .object({ token: z.string().min(40).max(200) })
      .strict()
      .parse(body);
    const hash = await digest(token);
    const invitation = await db()
      .prepare(
        "SELECT id,organisation FROM organisation_invites WHERE hash=? AND expires>?",
      )
      .bind(hash, now())
      .first<{ id: string; organisation: string }>();
    if (!invitation)
      throw new HttpError(
        400,
        "Invitation is expired, revoked or already used.",
      );
    const results = await db().batch([
      db()
        .prepare(
          "INSERT OR IGNORE INTO organisation_members(organisation,user,role,joined) SELECT organisation,?,role,? FROM organisation_invites WHERE id=? AND hash=? AND expires>?",
        )
        .bind(user.id, now(), invitation.id, hash, now()),
      db()
        .prepare("DELETE FROM organisation_invites WHERE id=? AND hash=?")
        .bind(invitation.id, hash),
    ]);
    if (!results[0].meta.changes)
      throw new HttpError(
        409,
        "You are already a member or this invitation was used.",
      );
    return { joined: true, organisation: invitation.organisation };
  }
  if (!path[1]) {
    if (method === "GET")
      return {
        organisations: (
          await db()
            .prepare(
              "SELECT o.id,o.name,o.created,m.role FROM organisations o JOIN organisation_members m ON m.organisation=o.id WHERE m.user=? ORDER BY o.created DESC",
            )
            .bind(user.id)
            .all()
        ).results,
      };
    if (method === "POST") {
      return createOrganisation(user.id, body);
    }
  }
  const org = idSchema.parse(path[1]);
  const membership = await member(org, user.id, method !== "GET");
  if (path[2] === "grants" && !path[3] && method === "GET")
    return grantPage(org, Object.fromEntries(new URL(req.url).searchParams));
  if (path[2] === "graph" && method === "GET")
    return trustGraph(
      org,
      user.id,
      Object.fromEntries(new URL(req.url).searchParams),
    );
  if (path[2] === "handshake" && method === "POST")
    return graphHandshake(org, user.id, body);
  if (path[2] === "certifications")
    return certificates(
      org,
      user.id,
      method,
      body,
      path[3],
      Object.fromEntries(new URL(req.url).searchParams),
    );
  if (
    ["approvals", "monitoring", "verification", "assurance"].includes(path[2])
  )
    return organisationGovernance(
      req,
      path,
      org,
      user.id,
      membership.role,
      body,
    );
  if (!path[2] && method === "GET") {
    const organisation = await db()
      .prepare("SELECT id,name,created FROM organisations WHERE id=?")
      .bind(org)
      .first();
    const agents = (
      await db()
        .prepare(
          "SELECT a.code,a.name,a.role,a.status,o.classification,o.team FROM organisation_agents o JOIN agents a ON a.code=o.agent WHERE o.organisation=? ORDER BY a.name",
        )
        .bind(org)
        .all()
    ).results;
    const grants = await grantPage(org, {});
    const members = (
      await db()
        .prepare(
          "SELECT user,role,joined FROM organisation_members WHERE organisation=?",
        )
        .bind(org)
        .all<{ user: string; role: string; joined: string }>()
    ).results;
    return {
      organisation,
      role: membership.role,
      agents,
      grants: grants.grants,
      nextGrantCursor: grants.next,
      grantLimit: 200,
      invitations:
        membership.role === "owner"
          ? (
              await db()
                .prepare(
                  "SELECT id,role,expires FROM organisation_invites WHERE organisation=? AND expires>? ORDER BY expires",
                )
                .bind(org, now())
                .all()
            ).results
          : [],
      members: await Promise.all(
        members.map(async (m) => ({
          id: await digest(org + ":" + m.user),
          role: m.role,
          joined: m.joined,
          self: m.user === user.id,
        })),
      ),
      assurance: (await operatorStatus(org)).status,
    };
  }
  if (path[2] === "members" && path[3] && method === "DELETE") {
    const target = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(path[3]);
    const members = (
      await db()
        .prepare(
          "SELECT user,role FROM organisation_members WHERE organisation=?",
        )
        .bind(org)
        .all<{ user: string; role: string }>()
    ).results;
    const found = (
      await Promise.all(
        members.map(async (m) => ({
          ...m,
          id: await digest(org + ":" + m.user),
        })),
      )
    ).find((m) => m.id === target);
    if (!found || found.role === "owner")
      throw new HttpError(400, "The organisation owner cannot be removed.");
    if (membership.role !== "owner")
      throw new HttpError(403, "Only the owner can remove members.");
    await db()
      .prepare(
        "DELETE FROM organisation_members WHERE organisation=? AND user=? AND role!='owner'",
      )
      .bind(org, found.user)
      .run();
    return { removed: true };
  }
  if (path[2] === "invitations" && method === "POST") {
    if (membership.role !== "owner")
      throw new HttpError(403, "Only the owner can invite members.");
    const { role } = z
      .object({ role: z.enum(["admin", "auditor"]) })
      .strict()
      .parse(body);
    const token = crypto.randomUUID() + crypto.randomUUID();
    const id = crypto.randomUUID();
    const expires = new Date(Date.now() + 86400000).toISOString();
    await db()
      .prepare(
        "INSERT INTO organisation_invites(id,organisation,hash,role,expires) VALUES(?,?,?,?,?)",
      )
      .bind(id, org, await digest(token), role, expires)
      .run();
    return { id, token, expires, delivery: "not-sent" };
  }
  if (path[2] === "invitations" && path[3] && method === "DELETE") {
    if (membership.role !== "owner")
      throw new HttpError(403, "Only the owner can revoke invitations.");
    await db()
      .prepare("DELETE FROM organisation_invites WHERE organisation=? AND id=?")
      .bind(org, idSchema.parse(path[3]))
      .run();
    return { revoked: true };
  }
  if (path[2] === "agents" && method === "POST") {
    return assignOrganisationAgent(org, user.id, body);
  }
  if (path[2] === "agents" && path[3] && method === "DELETE") {
    const code = codeSchema.parse(path[3]);
    await db().batch([
      db()
        .prepare(
          "UPDATE authority_grants SET revoked=1 WHERE organisation=? AND subject=?",
        )
        .bind(org, code),
      db()
        .prepare(
          "DELETE FROM organisation_agents WHERE organisation=? AND agent=?",
        )
        .bind(org, code),
    ]);
    return { removed: true };
  }
  if (path[2] === "grants" && !path[3] && method === "POST") {
    const input = z
      .object({
        subject: codeSchema,
        parent: idSchema.nullable(),
        constraints: constraintsSchema,
        expires: z.string().datetime(),
      })
      .strict()
      .parse(body);
    if (
      Date.parse(input.expires) <= Date.now() ||
      Date.parse(input.expires) > Date.now() + 90 * 86400000
    )
      throw new HttpError(400, "Expiry must be within the next 90 days.");
    const subject = await db()
      .prepare(
        "SELECT a.status FROM organisation_agents o JOIN agents a ON a.code=o.agent WHERE o.agent=? AND o.organisation=?",
      )
      .bind(input.subject, org)
      .first<{ status: string }>();
    if (subject?.status !== "active")
      throw new HttpError(
        400,
        "Assign an active agent to this organisation first.",
      );
    if (input.parent) {
      const chain = await chainFor(input.parent, org);
      const problem = inspectChain(chain);
      if (
        problem ||
        chain.length >= 8 ||
        chain.some((n) => n.subject === input.subject)
      )
        throw new HttpError(
          400,
          problem || "The chain is too deep or repeats the subject.",
        );
      if (
        !attenuates(JSON.parse(chain[0].constraints), input.constraints) ||
        Date.parse(input.expires) > Date.parse(chain[0].expires)
      )
        throw new HttpError(
          400,
          "Child constraints must be a subset of the parent's authority and expiry.",
        );
    }
    const id = crypto.randomUUID();
    const created = now();
    const proof = await receipt({
      id,
      organisation: org,
      ...input,
      created,
      operatorAssurance: "declared",
      issuedBy: "organisation-administrator",
      issuedByMember: await digest(org + ":" + user.id),
    });
    await db()
      .prepare(
        "INSERT INTO authority_grants(id,organisation,parent,subject,constraints,expires,revoked,created,receipt) VALUES(?,?,?,?,?,?,0,?,?)",
      )
      .bind(
        id,
        org,
        input.parent,
        input.subject,
        JSON.stringify(input.constraints),
        input.expires,
        created,
        proof,
      )
      .run();
    return { id, receipt: proof };
  }
  if (path[2] === "grants" && path[3] && method === "DELETE") {
    await db()
      .prepare(
        "UPDATE authority_grants SET revoked=1 WHERE id=? AND organisation=?",
      )
      .bind(idSchema.parse(path[3]), org)
      .run();
    return {
      revoked: true,
      descendants: "Denied on their next live chain check.",
    };
  }
  if (path[2] === "evaluate" && method === "POST") {
    const input = z
      .object({ grant: idSchema, request: actionSchema })
      .strict()
      .parse(body);
    const chain = await chainFor(input.grant, org);
    return {
      ...evaluateAuthority(chain, input.request),
      simulation: true,
      executionPermit: false,
      chain: chain.map((n) => ({
        id: n.id,
        subject: n.subject,
        parent: n.parent,
        expires: n.expires,
        revoked: !!n.revoked,
      })),
    };
  }
  if (!path[2] && method === "DELETE") {
    if (membership.role !== "owner")
      throw new HttpError(403, "Only the owner can delete the organisation.");
    const input = z.object({ confirm: idSchema }).strict().parse(body);
    if (input.confirm !== org)
      throw new HttpError(400, "Confirm the organisation ID.");
    await db().prepare("DELETE FROM organisations WHERE id=?").bind(org).run();
    return {
      deleted: true,
      passports: "Individual passports remain with their existing owners.",
    };
  }
  throw new HttpError(404, "Organisation operation not found.");
}
