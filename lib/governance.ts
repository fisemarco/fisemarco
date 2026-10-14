import { z } from "zod";
import { descendingCursor, descendingPage } from "./pagination";
import { outcomeTrend } from "./monitoring";
import { assuranceChecklist } from "./assurance-controls";
import { env } from "cloudflare:workers";
import { db, HttpError, config } from "./server";
import { digest } from "./crypto";
import { validateOperatorCredential } from "./operator-credentials";
import { runtimeAuth } from "./runtime";
import { receipt, chainFor } from "./enterprise-core";
import {
  actionSchema,
  constraintsSchema,
  evaluateAuthority,
  inspectChain,
  attenuates,
  type Grant,
} from "./authority";
const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const iso = () => new Date().toISOString();
type Context = Awaited<ReturnType<typeof runtimeAuth>>;
type Approval = {
  id: string;
  organisation: string;
  grant_id: string;
  agent: string;
  request: string;
  input_hash: string;
  state: string;
  expires: string;
  approver: string | null;
  receipt: string | null;
};
export const taskAuthoritySchema = z
  .object({ grant: uuid, request: actionSchema, approval: uuid.optional() })
  .strict();
export async function checkTaskAuthority(
  ctx: Context,
  binding: z.infer<typeof taskAuthoritySchema> | null | undefined,
  task: { action: string; resource: string; inputHash: string },
  consume = false,
) {
  const assigned = await db()
    .prepare("SELECT organisation FROM organisation_agents WHERE agent=?")
    .bind(ctx.row.code)
    .first<{ organisation: string }>();
  if (!binding) {
    if (assigned)
      throw new HttpError(
        403,
        "Organisation agents require a bounded authority grant for every task permit.",
      );
    return;
  }
  if (
    binding.request.action !== task.action ||
    binding.request.resource !== task.resource ||
    !hash.safeParse(task.inputHash).success
  )
    throw new HttpError(
      403,
      "Authority must match the task action, resource and input fingerprint.",
    );
  const { g, result } = await live(ctx, binding.grant, binding.request);
  if (result.decision === "DENY") throw new HttpError(403, result.reason);
  if (result.decision === "ESCALATE") {
    if (!binding.approval)
      throw new HttpError(
        403,
        "A completed exact-task human approval is required.",
      );
    const a = await db()
      .prepare(
        "SELECT * FROM authority_approvals WHERE id=? AND organisation=? AND grant_id=? AND agent=? AND state='approved' AND expires>? AND EXISTS(SELECT 1 FROM organisation_members m WHERE m.organisation=authority_approvals.organisation AND m.user=authority_approvals.approver AND m.role IN ('owner','admin'))",
      )
      .bind(binding.approval, g.organisation, g.id, ctx.row.code, iso())
      .first<Approval>();
    if (
      !a ||
      a.request !== JSON.stringify(binding.request) ||
      a.input_hash !== task.inputHash
    )
      throw new HttpError(
        403,
        "An unused matching approval by a current administrator is required.",
      );
    if (consume) {
      const time = iso();
      const used = await db()
        .prepare(
          "UPDATE authority_approvals SET state='consumed',consumed=? WHERE id=? AND state='approved' AND expires>? AND EXISTS(SELECT 1 FROM organisation_members m WHERE m.organisation=authority_approvals.organisation AND m.user=authority_approvals.approver AND m.role IN ('owner','admin'))",
        )
        .bind(time, a.id, time)
        .run();
      if (!used.meta.changes)
        throw new HttpError(409, "Approval was already consumed or withdrawn.");
      await event(g.organisation, ctx.row.code, "approval-consumed", "ALLOW", {
        approval: a.id,
        grant: g.id,
        request: binding.request,
        inputHash: task.inputHash,
        consumed: time,
        via: "runtime-permit",
      });
    }
  }
}
const runtimeInput = z.object({ grant: uuid, request: actionSchema }).strict();
function active(ctx: Context, action?: string) {
  const profile = JSON.parse(ctx.row.profile);
  if (
    ctx.row.status !== "active" ||
    ctx.policy.status !== "active" ||
    (action &&
      (!JSON.parse(ctx.policy.allowed).includes(action) ||
        JSON.parse(ctx.policy.denied).includes(action) ||
        !profile.allowed.includes(action) ||
        profile.denied.includes(action)))
  )
    throw new HttpError(
      403,
      "The runtime or its policy does not permit this operation.",
    );
}
async function live(
  ctx: Context,
  grant: string,
  request: z.infer<typeof actionSchema>,
) {
  const g = await db()
    .prepare("SELECT * FROM authority_grants WHERE id=? AND subject=?")
    .bind(grant, ctx.row.code)
    .first<Grant>();
  if (!g) throw new HttpError(404, "Grant unavailable for this runtime.");
  const chain = await chainFor(g.id, g.organisation);
  let result = evaluateAuthority(chain, request);
  for (const node of chain) {
    const a = await db()
      .prepare(
        "SELECT a.status FROM agents a JOIN organisation_agents o ON o.agent=a.code WHERE a.code=? AND o.organisation=?",
      )
      .bind(node.subject, g.organisation)
      .first<{ status: string }>();
    if (a?.status !== "active")
      result = {
        decision: "DENY",
        reason: "An authority-chain agent is inactive or no longer assigned.",
      };
  }
  try {
    active(ctx, request.action);
  } catch {
    result = {
      decision: "DENY",
      reason: "The runtime policy or passport does not permit this action.",
    };
  }
  return { g, chain, result };
}
async function event(
  org: string,
  agent: string,
  kind: string,
  decision: string,
  data: unknown,
) {
  const id = crypto.randomUUID(),
    created = iso();
  const record = {
    id,
    organisation: org,
    agent,
    kind,
    decision,
    data,
    created,
    source: "registry-observed",
  };
  const proof = await receipt(record);
  await db()
    .prepare(
      "INSERT INTO authority_events(id,organisation,agent,kind,decision,data,created,receipt) VALUES(?,?,?,?,?,?,?,?)",
    )
    .bind(id, org, agent, kind, decision, JSON.stringify(data), created, proof)
    .run();
  return proof;
}
export async function runtimeGovernance(req: Request, operation: string) {
  const ctx = await runtimeAuth(req);
  if (operation === "delegate") {
    active(ctx);
    const input = z
      .object({
        parent: uuid,
        subject: z.string().regex(/^FTAI-(?:[A-F0-9]{4}-){2}[A-F0-9]{4}$/),
        constraints: constraintsSchema,
        expires: z.string().datetime(),
      })
      .strict()
      .parse(ctx.input);
    const parent = await db()
      .prepare("SELECT * FROM authority_grants WHERE id=? AND subject=?")
      .bind(input.parent, ctx.row.code)
      .first<Grant>();
    if (!parent)
      throw new HttpError(404, "Parent grant is not owned by this runtime.");
    const chain = await chainFor(parent.id, parent.organisation);
    const problem = inspectChain(chain);
    if (
      problem ||
      chain.length >= 8 ||
      chain.some((n) => n.subject === input.subject) ||
      !attenuates(JSON.parse(parent.constraints), input.constraints) ||
      Date.parse(input.expires) > Date.parse(parent.expires) ||
      Date.parse(input.expires) <= Date.now()
    )
      throw new HttpError(
        400,
        problem ||
          "Delegation must narrow scope and expiry without repeating a subject.",
      );
    for (const code of [...chain.map((n) => n.subject), input.subject]) {
      const a = await db()
        .prepare(
          "SELECT a.status FROM agents a JOIN organisation_agents o ON o.agent=a.code WHERE a.code=? AND o.organisation=?",
        )
        .bind(code, parent.organisation)
        .first<{ status: string }>();
      if (a?.status !== "active")
        throw new HttpError(
          403,
          "All delegates must be active members of this workforce.",
        );
    }
    // A runtime cannot delegate actions that its own current policy denies.
    for (const action of input.constraints.actions) active(ctx, action);
    const id = crypto.randomUUID(),
      created = iso();
    const proof = await receipt({
      id,
      organisation: parent.organisation,
      ...input,
      created,
      issuedBy: ctx.row.code,
      requestProof: ctx.proof,
    });
    await db()
      .prepare(
        "INSERT INTO authority_grants(id,organisation,parent,subject,constraints,expires,revoked,created,receipt) VALUES(?,?,?,?,?,?,0,?,?)",
      )
      .bind(
        id,
        parent.organisation,
        parent.id,
        input.subject,
        JSON.stringify(input.constraints),
        input.expires,
        created,
        proof,
      )
      .run();
    await event(parent.organisation, ctx.row.code, "delegation", "ISSUED", {
      id,
      subject: input.subject,
      parent: parent.id,
    });
    return { id, receipt: proof };
  }
  if (operation === "approval-request") {
    const input = runtimeInput.extend({ inputHash: hash }).parse(ctx.input);
    const { g, result } = await live(ctx, input.grant, input.request);
    if (result.decision !== "ESCALATE")
      throw new HttpError(
        409,
        result.decision === "DENY"
          ? result.reason
          : "This action does not require escalation.",
      );
    const id = crypto.randomUUID(),
      created = iso(),
      expires = new Date(
        Math.min(Date.parse(g.expires), Date.now() + 3600000),
      ).toISOString();
    await db()
      .prepare(
        "INSERT INTO authority_approvals(id,organisation,grant_id,agent,request,input_hash,state,created,expires) VALUES(?,?,?,?,?,?,'pending',?,?)",
      )
      .bind(
        id,
        g.organisation,
        g.id,
        ctx.row.code,
        JSON.stringify(input.request),
        input.inputHash,
        created,
        expires,
      )
      .run();
    await event(g.organisation, ctx.row.code, "approval-request", "PENDING", {
      id,
      grant: g.id,
    });
    return { id, state: "pending", expires };
  }
  if (operation === "approval-consume") {
    const input = runtimeInput
      .extend({ approval: uuid, inputHash: hash })
      .parse(ctx.input);
    const { g, result } = await live(ctx, input.grant, input.request);
    if (result.decision === "DENY") throw new HttpError(403, result.reason);
    const a = await db()
      .prepare(
        "SELECT * FROM authority_approvals WHERE id=? AND organisation=? AND agent=? AND grant_id=?",
      )
      .bind(input.approval, g.organisation, ctx.row.code, g.id)
      .first<Approval>();
    if (
      !a ||
      a.request !== JSON.stringify(input.request) ||
      a.input_hash !== input.inputHash
    )
      throw new HttpError(
        403,
        "Approval does not match this exact action and task input.",
      );
    // Atomic compare-and-set also rechecks the approver's current role. One winner under concurrent requests.
    const consumed = iso();
    const changed = await db()
      .prepare(
        "UPDATE authority_approvals SET state='consumed',consumed=? WHERE id=? AND state='approved' AND expires>? AND EXISTS (SELECT 1 FROM organisation_members m WHERE m.organisation=authority_approvals.organisation AND m.user=authority_approvals.approver AND m.role IN ('owner','admin')) AND NOT EXISTS (SELECT 1 FROM authority_grants g WHERE g.id IN (SELECT value FROM json_each(?)) AND (g.revoked=1 OR g.expires<=?))",
      )
      .bind(
        consumed,
        a.id,
        consumed,
        JSON.stringify((await chainFor(g.id, g.organisation)).map((n) => n.id)),
        consumed,
      )
      .run();
    if (!changed.meta.changes)
      throw new HttpError(
        409,
        "Approval is expired, revoked, used, or its approver no longer has authority.",
      );
    const proof = await event(
      g.organisation,
      ctx.row.code,
      "approval-consumed",
      "ALLOW",
      {
        approval: a.id,
        grant: g.id,
        request: input.request,
        inputHash: input.inputHash,
        consumed,
      },
    );
    return {
      decision: "ALLOW",
      approval: a.id,
      consumed,
      receipt: proof,
      executionPermit: false,
    };
  }
  const input = runtimeInput.parse(ctx.input);
  const { g, chain, result } = await live(ctx, input.grant, input.request);
  const decision = {
    ...result,
    agent: ctx.row.code,
    grant: g.id,
    chain: chain.map((n) => n.id),
    request: input.request,
    checkedAt: iso(),
    operatorAssurance: (await operatorStatus(g.organisation)).status,
    rootAuthorityAssurance: "declared",
    executionPermit: false,
  };
  return {
    ...decision,
    receipt: await event(
      g.organisation,
      ctx.row.code,
      "authority-check",
      result.decision,
      decision,
    ),
  };
}
async function checkAttestation(credential: string, org: string) {
  const settings = env as unknown as Record<string, string | undefined>;
  return validateOperatorCredential(
    credential,
    org,
    config().origin,
    JSON.parse(settings.FTAI_OPERATOR_VERIFIERS || "[]"),
    JSON.parse(settings.FTAI_REVOKED_OPERATOR_ATTESTATIONS || "[]"),
  );
}
export async function operatorStatus(org: string) {
  const row = await db()
    .prepare(
      "SELECT credential FROM operator_attestations WHERE organisation=?",
    )
    .bind(org)
    .first<{ credential: string }>();
  if (!row) return { status: "declared", attestation: null };
  try {
    return {
      status: "independently-attested",
      attestation: await checkAttestation(row.credential, org),
    };
  } catch {
    return { status: "unverified-or-expired", attestation: null };
  }
}
export async function organisationGovernance(
  req: Request,
  path: string[],
  org: string,
  user: string,
  role: string,
  body: unknown,
) {
  const operation = path[2];
  if (operation === "assurance") {
    if (req.method === "GET") {
      const controls = (
        await db()
          .prepare(
            "SELECT control,status,notes,evidence_url,evidence_hash,reviewer,updated FROM assurance_controls WHERE organisation=?",
          )
          .bind(org)
          .all()
      ).results;
      const report = {
        organisation: org,
        generatedAt: iso(),
        assessment: "operator-self-assessment",
        certified: false,
        controls: assuranceChecklist.map((c) => ({
          ...c,
          ...controls.find((r) => r.control === c.id),
        })),
      };
      return { ...report, receipt: await receipt(report) };
    }
    if (req.method === "POST" && ["owner", "admin"].includes(role)) {
      const input = z
        .object({
          control: z
            .string()
            .refine((v) => assuranceChecklist.some((c) => c.id === v)),
          status: z.enum(["not-started", "in-progress", "ready-for-review"]),
          notes: z.string().trim().min(5).max(2000),
          evidenceUrl: z
            .string()
            .url()
            .max(2000)
            .refine((v) => v.startsWith("https://"))
            .or(z.literal("")),
          evidenceHash: hash.or(z.literal("")),
        })
        .strict()
        .parse(body);
      if (
        input.status === "ready-for-review" &&
        (!input.evidenceUrl || !input.evidenceHash)
      )
        throw new HttpError(
          400,
          "Ready-for-review controls need an HTTPS evidence reference and SHA-256 hash.",
        );
      await db()
        .prepare(
          "INSERT INTO assurance_controls(organisation,control,status,notes,evidence_url,evidence_hash,reviewer,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(organisation,control) DO UPDATE SET status=excluded.status,notes=excluded.notes,evidence_url=excluded.evidence_url,evidence_hash=excluded.evidence_hash,reviewer=excluded.reviewer,updated=excluded.updated",
        )
        .bind(
          org,
          input.control,
          input.status,
          input.notes,
          input.evidenceUrl,
          input.evidenceHash,
          await digest(org + ":" + user),
          iso(),
        )
        .run();
      return { saved: true, certified: false };
    }
    throw new HttpError(
      403,
      "An organisation administrator must update assessment evidence.",
    );
  }

  if (operation === "verification") {
    if (req.method === "GET") return operatorStatus(org);
    if (role !== "owner")
      throw new HttpError(
        403,
        "Only the organisation owner can manage operator evidence.",
      );
    if (req.method === "DELETE") {
      await db()
        .prepare("DELETE FROM operator_attestations WHERE organisation=?")
        .bind(org)
        .run();
      return { removed: true };
    }
    if (req.method === "POST") {
      const { credential } = z
        .object({ credential: z.string().min(100).max(16000) })
        .strict()
        .parse(body);
      const data = await checkAttestation(credential, org);
      await db()
        .prepare(
          "INSERT INTO operator_attestations(organisation,credential,created) VALUES(?,?,?) ON CONFLICT(organisation) DO UPDATE SET credential=excluded.credential,created=excluded.created",
        )
        .bind(org, credential, iso())
        .run();
      return { status: "independently-attested", attestation: data };
    }
  }
  if (operation === "approvals") {
    if (req.method === "GET") {
      const q = descendingCursor(
        Object.fromEntries(new URL(req.url).searchParams),
        200,
      );
      const rows = (
        await db()
          .prepare(
            "SELECT id,grant_id,agent,request,input_hash,state,created,expires,decided,reason,receipt,consumed FROM authority_approvals WHERE organisation=? AND (created<? OR (created=? AND id<?)) ORDER BY created DESC,id DESC LIMIT ?",
          )
          .bind(org, q.created, q.created, q.id, q.limit + 1)
          .all<{ id: string; created: string }>()
      ).results;
      const page = descendingPage(rows, q.limit);
      return { approvals: page.items, next: page.next };
    }
    if (req.method !== "POST")
      throw new HttpError(405, "Use POST to record an approval decision.");
    if (!["owner", "admin"].includes(role))
      throw new HttpError(403, "Approver access required.");
    const id = uuid.parse(path[3]);
    const input = z
      .object({
        decision: z.enum(["approved", "rejected", "revoked"]),
        reason: z.string().trim().min(5).max(1000),
      })
      .strict()
      .parse(body);
    const a = await db()
      .prepare(
        "SELECT * FROM authority_approvals WHERE id=? AND organisation=?",
      )
      .bind(id, org)
      .first<Approval>();
    if (!a) throw new HttpError(404, "Approval unavailable.");
    const chain = await chainFor(a.grant_id, org);
    if (input.decision === "approved" && inspectChain(chain))
      throw new HttpError(409, "The grant is no longer valid.");
    const decided = iso(),
      proof = await receipt({
        id,
        organisation: org,
        agent: a.agent,
        grant: a.grant_id,
        request: JSON.parse(a.request),
        inputHash: a.input_hash,
        decision: input.decision,
        reason: input.reason,
        approver: await digest(org + ":" + user),
        decided,
        expires: a.expires,
      });
    const changed = await db()
      .prepare(
        "UPDATE authority_approvals SET state=?,approver=?,decided=?,reason=?,receipt=? WHERE id=? AND organisation=? AND expires>? AND (state='pending' OR (state='approved' AND ?='revoked'))",
      )
      .bind(
        input.decision,
        user,
        decided,
        input.reason,
        proof,
        id,
        org,
        decided,
        input.decision,
      )
      .run();
    if (!changed.meta.changes)
      throw new HttpError(
        409,
        "This approval was already decided, consumed or expired.",
      );
    await event(org, a.agent, "approval-decision", input.decision, {
      id,
      reason: input.reason,
      approver: await digest(org + ":" + user),
    });
    return { id, state: input.decision, receipt: proof };
  }
  if (operation === "monitoring" && req.method === "GET") {
    const since = new Date(Date.now() - 86400000).toISOString();
    const events = (
      await db()
        .prepare(
          "SELECT * FROM authority_events WHERE organisation=? ORDER BY created DESC LIMIT 200",
        )
        .bind(org)
        .all()
    ).results;
    const summary = (
      await db()
        .prepare(
          "SELECT agent,decision,COUNT(*) AS count FROM authority_events WHERE organisation=? AND created>? AND kind='authority-check' GROUP BY agent,decision",
        )
        .bind(org, since)
        .all()
    ).results;
    const workforce = (
      await db()
        .prepare(
          "SELECT a.code,a.name,a.status,a.revision,r.last_seen,r.runtime_status,r.revoked FROM organisation_agents o JOIN agents a ON a.code=o.agent LEFT JOIN runtime_agents r ON r.agent=a.code WHERE o.organisation=?",
        )
        .bind(org)
        .all()
    ).results;
    const activity = (
      await db()
        .prepare(
          "SELECT r.agent,CASE WHEN r.created>? THEN 'current' ELSE 'previous' END AS window,json_extract(r.payload,'$.outcome') AS outcome,COUNT(*) AS count FROM records r JOIN organisation_agents o ON o.agent=r.agent WHERE o.organisation=? AND r.kind='task' AND r.created>? AND json_extract(r.payload,'$.provenance')='authenticated-runtime' GROUP BY r.agent,window,outcome",
        )
        .bind(since, org, new Date(Date.now() - 2 * 86400000).toISOString())
        .all<{
          agent: string;
          window: string;
          outcome: string;
          count: number;
        }>()
    ).results;
    const trends = workforce.map((a) => outcomeTrend(String(a.code), activity));
    return {
      events,
      summary,
      workforce,
      trends,
      windowStart: since,
      limit: 200,
      source:
        "Registry-observed decisions and authenticated runtime heartbeats. These do not prove external tool behaviour.",
    };
  }
  throw new HttpError(404, "Governance operation unavailable.");
}
