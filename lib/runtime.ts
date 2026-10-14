import { taskAuthoritySchema, checkTaskAuthority } from "./governance";
import type {
  AgentRow,
  PermitRow,
  PolicyRow,
  RecordRow,
  RuntimeRow,
} from "./rows";
import { identitySeal } from "./identity";
import { z } from "zod";
import {
  auth,
  db,
  config,
  parse,
  HttpError,
  agentSchema,
  profileSchema,
  recordSchema,
  agentView,
  getAgent,
  makeRecord,
  insertRecord,
  append,
  credential,
} from "./server";
import { b64, unb64, digest, sign } from "./crypto";

export const RUNTIME_VERSION = "1.0";
const enc = new TextEncoder();
const iso = () => new Date().toISOString();
const freshToken = () =>
  "fte_" +
  crypto.randomUUID().replaceAll("-", "") +
  crypto.randomUUID().replaceAll("-", "");
const policySchema = z.object({
  label: z.string().trim().min(1).max(80),
  organization: z.string().trim().min(1).max(200),
  allowed: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  denied: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  maxAgents: z.number().int().min(1).max(10000).default(100),
  status: z.enum(["active", "paused"]).default("active"),
});
export const jwkSchema = z
  .object({
    kty: z.literal("OKP"),
    crv: z.literal("Ed25519"),
    x: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()
  .refine(
    (k) => unb64(k.x).length === 32 && b64(unb64(k.x)) === k.x,
    "Use a canonical Ed25519 public key.",
  );
function policyView(p: PolicyRow) {
  const { owner, key_hash, ...rest } = p;
  void owner;
  void key_hash;
  return {
    ...rest,
    allowed: JSON.parse(p.allowed),
    denied: JSON.parse(p.denied),
  };
}
export async function pubVerify(
  publicKey: JsonWebKey,
  signature: string,
  message: string,
) {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      publicKey,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      unb64(signature),
      enc.encode(message),
    );
  } catch {
    return false;
  }
}
export async function requestMessage(
  code: string,
  method: string,
  path: string,
  time: string,
  nonce: string,
  body: string,
) {
  return [
    "FTAI-Request-v1",
    config().origin,
    code,
    method,
    path,
    time,
    nonce,
    await digest(body),
  ].join("\n");
}
export async function runtimeAuth(req: Request) {
  const code = req.headers.get("x-ftai-agent") || "";
  const time = req.headers.get("x-ftai-timestamp") || "";
  const nonce = req.headers.get("x-ftai-nonce") || "";
  const signature = req.headers.get("x-ftai-signature") || "";
  if (
    !/^FTAI-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(code) ||
    !/^\d{10}$/.test(time) ||
    Math.abs(Date.now() / 1000 - Number(time)) > 60 ||
    !z.string().uuid().safeParse(nonce).success ||
    signature.length > 200
  )
    throw new HttpError(401, "A fresh signed agent request is required.");
  if (req.method !== "GET") await parse(req.clone() as unknown as Request);
  // Sign the exact request bytes. The parsed clone above enforces the body-size limit first.
  const raw = req.method === "GET" ? "" : await req.text();
  const runtime = await db()
    .prepare("SELECT * FROM runtime_agents WHERE agent=?")
    .bind(code)
    .first<RuntimeRow>();
  if (!runtime || runtime.revoked)
    throw new HttpError(
      403,
      "This runtime identity is unregistered or revoked.",
    );
  const url = new URL(req.url);
  const message = await requestMessage(
    code,
    req.method,
    url.pathname + url.search,
    time,
    nonce,
    raw,
  );
  if (!(await pubVerify(JSON.parse(runtime.public_key), signature, message)))
    throw new HttpError(401, "Agent signature verification failed.");
  try {
    await db().batch([
      db()
        .prepare("DELETE FROM runtime_replays WHERE expires<?")
        .bind(Math.floor(Date.now() / 1000)),
      db()
        .prepare("INSERT INTO runtime_replays(id,expires) VALUES(?,?)")
        .bind(
          await digest(code + ":" + nonce),
          Math.floor(Date.now() / 1000) + 120,
        ),
    ]);
  } catch {
    throw new HttpError(409, "This signed request has already been used.");
  }
  const row = await db()
    .prepare("SELECT * FROM agents WHERE code=?")
    .bind(code)
    .first<AgentRow>();
  const policy = await db()
    .prepare("SELECT * FROM enrollment_policies WHERE id=?")
    .bind(runtime.policy_id)
    .first<PolicyRow>();
  if (!row || !policy)
    throw new HttpError(403, "Runtime registration is unavailable.");
  return {
    runtime,
    row,
    policy,
    input: raw ? JSON.parse(raw) : {},
    actor: "agent:" + runtime.thumbprint,
    proof: {
      algorithm: "Ed25519",
      publicKeyThumbprint: runtime.thumbprint,
      signature,
      timestamp: time,
      nonce,
      requestPath: url.pathname + url.search,
      bodyHash: await digest(raw),
    },
  };
}
function activeGate(
  ctx: Awaited<ReturnType<typeof runtimeAuth>>,
  action?: string,
) {
  if (ctx.row.status !== "active")
    throw new HttpError(
      403,
      "The passport is " + ctx.row.status + ". Work is blocked.",
    );
  if (ctx.policy.status !== "active")
    throw new HttpError(
      403,
      "This organization policy is paused. Work is blocked.",
    );
  if (ctx.runtime.revoked)
    throw new HttpError(403, "The runtime key is revoked.");
  if (action) {
    const allowed = JSON.parse(ctx.policy.allowed);
    const denied = JSON.parse(ctx.policy.denied);
    const profile = JSON.parse(ctx.row.profile);
    if (
      !allowed.includes(action) ||
      denied.includes(action) ||
      !profile.allowed.includes(action) ||
      profile.denied.includes(action)
    )
      throw new HttpError(
        403,
        "This action is not allowed by both the organization policy and the agent passport.",
      );
  }
}
const taskSchema = z.object({
  authority: taskAuthoritySchema.optional(),
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  action: z.string().trim().min(1).max(200),
  resource: z.string().trim().max(1000).default(""),
  inputHash: z
    .string()
    .regex(/^$|^[a-f0-9]{64}$/)
    .default(""),
});
export async function policyApi(req: Request, path: string[]) {
  const user = await auth(req, req.method !== "GET", false);
  const method = req.method;
  if (method === "GET" && !path[1]) {
    const policies = await db()
      .prepare(
        "SELECT p.*, (SELECT COUNT(*) FROM runtime_agents r WHERE r.policy_id=p.id) AS enrolled FROM enrollment_policies p WHERE owner=? ORDER BY created DESC",
      )
      .bind(user.id)
      .all<PolicyRow>();
    const agents = await db()
      .prepare(
        "SELECT r.agent,r.policy_id,r.external_id,r.thumbprint,r.revoked,r.last_seen,r.runtime_status,r.created,a.name,a.role,a.status,a.organization,p.label AS policy_label,p.status AS policy_status FROM runtime_agents r JOIN agents a ON a.code=r.agent JOIN enrollment_policies p ON p.id=r.policy_id WHERE p.owner=? ORDER BY r.created DESC",
      )
      .bind(user.id)
      .all<RuntimeRow>();
    const permits = await db()
      .prepare(
        "SELECT w.id,w.agent,w.title,w.action,w.state,w.created,w.started,w.completed,w.expires,w.outcome_id FROM work_permits w JOIN enrollment_policies p ON p.id=w.policy_id WHERE p.owner=? ORDER BY w.created DESC LIMIT 50",
      )
      .bind(user.id)
      .all<PermitRow>();
    return {
      policies: policies.results.map(policyView),
      agents: agents.results,
      permits: permits.results,
    };
  }
  if (method === "POST" && !path[1]) {
    const input = policySchema.parse(await parse(req));
    const key = freshToken();
    const now = iso();
    const keyExpires = new Date(Date.now() + 90 * 86400000).toISOString();
    const id = crypto.randomUUID();
    const count = await db()
      .prepare("SELECT COUNT(*) AS n FROM enrollment_policies WHERE owner=?")
      .bind(user.id)
      .first<{ n: number }>();
    if ((count?.n || 0) >= 50)
      throw new HttpError(
        429,
        "This workspace has reached its 50-policy limit. Reuse or update an existing policy.",
      );
    await db()
      .prepare(
        "INSERT INTO enrollment_policies(id,owner,label,organization,allowed,denied,status,revision,max_agents,key_hash,key_prefix,key_expires,created,updated) VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?,?)",
      )
      .bind(
        id,
        user.id,
        input.label,
        input.organization,
        JSON.stringify(input.allowed),
        JSON.stringify(input.denied),
        input.status,
        input.maxAgents,
        await digest(key),
        key.slice(0, 12),
        keyExpires,
        now,
        now,
      )
      .run();
    return { id, key, keyExpires };
  }
  const policy = await db()
    .prepare("SELECT * FROM enrollment_policies WHERE id=? AND owner=?")
    .bind(path[1] || "", user.id)
    .first<PolicyRow>();
  if (!policy) throw new HttpError(404, "Enrollment policy not found.");
  if (method === "PATCH" && path.length === 2) {
    const body = await parse(req);
    const input = policySchema.parse(body);
    if (body.revision !== policy.revision)
      throw new HttpError(409, "This policy changed. Refresh before saving.");
    if (input.organization !== policy.organization)
      throw new HttpError(
        400,
        "Create a separate policy for a different organization.",
      );
    const r = await db()
      .prepare(
        "UPDATE enrollment_policies SET label=?,allowed=?,denied=?,status=?,max_agents=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?",
      )
      .bind(
        input.label,
        JSON.stringify(input.allowed),
        JSON.stringify(input.denied),
        input.status,
        input.maxAgents,
        iso(),
        policy.id,
        user.id,
        policy.revision,
      )
      .run();
    if (!r.meta.changes)
      throw new HttpError(409, "This policy changed. Refresh before saving.");
    return { updated: true };
  }
  if (method === "POST" && path[2] === "rotate") {
    const key = freshToken();
    const keyExpires = new Date(Date.now() + 90 * 86400000).toISOString();
    await db()
      .prepare(
        "UPDATE enrollment_policies SET key_hash=?,key_prefix=?,key_expires=?,updated=? WHERE id=?",
      )
      .bind(await digest(key), key.slice(0, 12), keyExpires, iso(), policy.id)
      .run();
    return { id: policy.id, key, keyExpires };
  }
  if (method === "POST" && path[2] === "replace-key") {
    const { agent, publicKey } = z
      .object({ agent: z.string(), publicKey: jwkSchema })
      .strict()
      .parse(await parse(req));
    const runtime = await db()
      .prepare("SELECT * FROM runtime_agents WHERE agent=? AND policy_id=?")
      .bind(agent, policy.id)
      .first<RuntimeRow>();
    if (!runtime) throw new HttpError(404, "Runtime not found.");
    const row = await getAgent(agent, user.id, true);
    const thumbprint = await digest(
      JSON.stringify({
        crv: publicKey.crv,
        kty: publicKey.kty,
        x: publicKey.x,
      }),
    );
    if (thumbprint === runtime.thumbprint)
      throw new HttpError(
        400,
        "Generate a new key. Reusing a revoked key is not allowed.",
      );
    const prior = await db()
      .prepare(
        "SELECT hash FROM records WHERE agent=? ORDER BY sequence DESC LIMIT 1",
      )
      .bind(agent)
      .first<RecordRow>();
    const event = await makeRecord(
      agent,
      row.revision + 1,
      "runtime_access",
      "Runtime signing key replaced",
      {
        previousThumbprint: runtime.thumbprint,
        newThumbprint: thumbprint,
        action: "replace-key",
      },
      "owner:" + (await digest(user.id)).slice(0, 16),
      prior?.hash || "GENESIS",
    );
    try {
      await db().batch([
        insertRecord(event),
        db()
          .prepare(
            "UPDATE agents SET revision=revision+1,updated=? WHERE code=? AND revision=?",
          )
          .bind(event.created, agent, row.revision),
        db()
          .prepare(
            "UPDATE runtime_agents SET public_key=?,thumbprint=?,revoked=0,runtime_status='unknown',last_seen=NULL,heartbeat=NULL WHERE agent=? AND policy_id=?",
          )
          .bind(JSON.stringify(publicKey), thumbprint, agent, policy.id),
      ]);
    } catch {
      throw new HttpError(
        409,
        "This key is already registered or the passport changed. Refresh and retry.",
      );
    }
    return { replaced: true, agent };
  }
  if (method === "POST" && path[2] === "revoke-agent") {
    const { agent } = z.object({ agent: z.string() }).parse(await parse(req));
    const runtime = await db()
      .prepare("SELECT * FROM runtime_agents WHERE agent=? AND policy_id=?")
      .bind(agent, policy.id)
      .first<RuntimeRow>();
    if (!runtime) throw new HttpError(404, "Runtime agent not found.");
    if (runtime.revoked) return { revoked: true };
    const row = await getAgent(agent, user.id, true);
    const prior = await db()
      .prepare(
        "SELECT hash FROM records WHERE agent=? ORDER BY sequence DESC LIMIT 1",
      )
      .bind(agent)
      .first<RecordRow>();
    const event = await makeRecord(
      agent,
      row.revision + 1,
      "runtime_access",
      "Runtime signing key revoked",
      { thumbprint: runtime.thumbprint, action: "revoke-key" },
      "owner:" + (await digest(user.id)).slice(0, 16),
      prior?.hash || "GENESIS",
    );
    try {
      await db().batch([
        insertRecord(event),
        db()
          .prepare(
            "UPDATE agents SET revision=revision+1,updated=? WHERE code=? AND revision=?",
          )
          .bind(event.created, agent, row.revision),
        db()
          .prepare(
            "UPDATE runtime_agents SET revoked=1 WHERE agent=? AND policy_id=?",
          )
          .bind(agent, policy.id),
      ]);
    } catch {
      throw new HttpError(
        409,
        "The passport changed. Refresh and retry revocation.",
      );
    }
    return { revoked: true };
  }

  throw new HttpError(404, "Enrollment operation not found.");
}
export async function enroll(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!token.startsWith("fte_"))
    throw new HttpError(
      401,
      "An organization-issued enrollment key is required.",
    );
  const policy = await db()
    .prepare(
      "SELECT * FROM enrollment_policies WHERE key_hash=? AND key_expires>? AND status=?",
    )
    .bind(await digest(token), iso(), "active")
    .first<PolicyRow>();
  if (!policy)
    throw new HttpError(
      403,
      "This enrollment key is invalid, expired, or paused.",
    );
  const rawRequest = req.clone();
  const input = z
    .object({
      externalId: z.string().trim().min(1).max(200),
      name: z.string().trim().min(1).max(200),
      role: z.string().trim().min(1).max(200),
      profile: profileSchema,
      publicKey: jwkSchema,
    })
    .strict()
    .parse(await parse(req));
  const raw = await rawRequest.text();
  const message = [
    "FTAI-Enrollment-v1",
    config().origin,
    await digest(raw),
  ].join("\n");
  if (
    !(await pubVerify(
      input.publicKey,
      req.headers.get("x-ftai-signature") || "",
      message,
    ))
  )
    throw new HttpError(
      401,
      "Prove control of the submitted agent signing key.",
    );
  const thumbprint = await digest(
    JSON.stringify({
      crv: input.publicKey.crv,
      kty: input.publicKey.kty,
      x: input.publicKey.x,
    }),
  );
  const existing = await db()
    .prepare("SELECT * FROM runtime_agents WHERE policy_id=? AND external_id=?")
    .bind(policy.id, input.externalId)
    .first<RuntimeRow>();
  if (existing) {
    if (existing.thumbprint !== thumbprint)
      throw new HttpError(
        409,
        "This runtime ID already belongs to another signing key. Restore the original key or choose a new runtime ID.",
      );
    if (existing.revoked)
      throw new HttpError(403, "This runtime identity has been revoked.");
    return {
      code: existing.agent,
      registered: false,
      organization: policy.organization,
      protocolVersion: RUNTIME_VERSION,
    };
  }
  const code =
    "FTAI-" +
    crypto
      .randomUUID()
      .replaceAll("-", "")
      .slice(0, 12)
      .toUpperCase()
      .match(/.{4}/g)!
      .join("-");
  const profile = {
    ...input.profile,
    allowed: JSON.parse(policy.allowed),
    denied: JSON.parse(policy.denied),
  };
  const passport = agentSchema.parse({
    name: input.name,
    role: input.role,
    organization: policy.organization,
    profile,
    status: "active",
    visibility: "private",
  });
  const now = iso();
  const record = await makeRecord(
    code,
    1,
    "profile",
    "Automatically enrolled by runtime",
    passport,
    "agent:" + thumbprint,
    "GENESIS",
  );
  try {
    await db().batch([
      db()
        .prepare(
          "INSERT INTO agents(code,owner,name,role,organization,profile,status,visibility,revision,created,updated) SELECT ?,?,?,?,?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM enrollment_policies p WHERE p.id=? AND p.status=? AND p.key_hash=? AND p.key_expires>? AND (SELECT COUNT(*) FROM runtime_agents r WHERE r.policy_id=p.id)<p.max_agents)",
        )
        .bind(
          code,
          policy.owner,
          passport.name,
          passport.role,
          passport.organization,
          JSON.stringify(profile),
          "active",
          "private",
          now,
          now,
          policy.id,
          "active",
          policy.key_hash,
          now,
        ),
      db()
        .prepare(
          "INSERT INTO runtime_agents(agent,policy_id,external_id,public_key,thumbprint,created) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          code,
          policy.id,
          input.externalId,
          JSON.stringify(input.publicKey),
          thumbprint,
          now,
        ),
      insertRecord(record),
    ]);
  } catch {
    const raced = await db()
      .prepare(
        "SELECT * FROM runtime_agents WHERE policy_id=? AND external_id=?",
      )
      .bind(policy.id, input.externalId)
      .first<RuntimeRow>();
    if (raced?.thumbprint === thumbprint && !raced.revoked)
      return {
        code: raced.agent,
        registered: false,
        organization: policy.organization,
        protocolVersion: RUNTIME_VERSION,
      };
    throw new HttpError(
      409,
      "Enrollment capacity, runtime ID, or signing key conflict. Ask the operator to review the policy.",
    );
  }
  return {
    code,
    registered: true,
    organization: policy.organization,
    protocolVersion: RUNTIME_VERSION,
  };
}
export async function runtimeApi(req: Request, path: string[]) {
  if (path[1] === "enroll" && req.method === "POST") return enroll(req);
  const ctx = await runtimeAuth(req);
  const { row, runtime, policy, input, actor, proof } = ctx;
  const endpoint = path[1];
  if (endpoint === "me" && req.method === "GET") {
    return {
      agent: agentView(row),
      identity: await identitySeal(row.code),
      policy: {
        id: policy.id,
        organization: policy.organization,
        status: policy.status,
        allowed: JSON.parse(policy.allowed),
        denied: JSON.parse(policy.denied),
      },
      runtime: { lastSeen: runtime.last_seen, status: runtime.runtime_status },
      protocolVersion: RUNTIME_VERSION,
    };
  }
  if (endpoint === "heartbeat" && req.method === "POST") {
    const report = z
      .object({
        status: z.enum(["idle", "running", "degraded", "offline"]),
        details: z.string().max(1000).default(""),
      })
      .strict()
      .parse(input);
    await db()
      .prepare(
        "UPDATE runtime_agents SET last_seen=?,runtime_status=?,heartbeat=? WHERE agent=?",
      )
      .bind(iso(), report.status, JSON.stringify({ report, proof }), row.code)
      .run();
    return {
      received: true,
      serverTime: iso(),
      passportStatus: row.status,
      policyStatus: policy.status,
    };
  }
  if (endpoint === "sync" && req.method === "POST") {
    activeGate(ctx);
    const reported = z
      .object({
        name: z.string().trim().min(1).max(200),
        role: z.string().trim().min(1).max(200),
        profile: profileSchema.omit({ allowed: true, denied: true }),
      })
      .strict()
      .parse(input);
    const current = JSON.parse(row.profile);
    const next = agentSchema.parse({
      name: reported.name,
      role: reported.role,
      organization: row.organization,
      profile: {
        ...reported.profile,
        allowed: current.allowed,
        denied: current.denied,
      },
      status: row.status,
      visibility: row.visibility,
    });
    if (
      JSON.stringify(next.profile) === row.profile &&
      next.name === row.name &&
      next.role === row.role
    )
      return { updated: false, revision: row.revision };
    const record = await append(
      row,
      "profile",
      "Runtime metadata synchronized",
      next,
      actor,
      undefined,
      next,
    );
    return { updated: true, revision: record.sequence };
  }
  if (endpoint === "authorize" && req.method === "POST") {
    const task = taskSchema.parse(input);
    activeGate(ctx, task.action);
    await checkTaskAuthority(ctx, task.authority, task);
    const enforced = await db()
      .prepare(
        "SELECT p.document FROM intelligence_policies p JOIN organisation_agents a ON a.organisation=p.organisation WHERE a.agent=? ORDER BY p.version DESC LIMIT 1",
      )
      .bind(row.code)
      .first<{ document: string }>();
    if (enforced && JSON.parse(enforced.document).mode === "enforce") {
      const decision = await db()
        .prepare(
          "SELECT id FROM intelligence_executions WHERE id=? AND agent=? AND state='resolved' AND expires>? AND input_hash=? AND json_extract(decision,'$.action')=? AND json_extract(decision,'$.resource')=?",
        )
        .bind(
          task.taskId,
          row.code,
          iso(),
          task.inputHash,
          task.action,
          task.resource,
        )
        .first();
      if (!decision)
        throw new HttpError(
          403,
          "Enforce mode requires a matching Intelligence Control decision before a work permit.",
        );
    }
    const existing = await db()
      .prepare("SELECT * FROM work_permits WHERE id=?")
      .bind(task.taskId)
      .first<PermitRow>();
    if (existing) {
      if (
        existing.agent !== row.code ||
        existing.action !== task.action ||
        existing.resource !== task.resource ||
        existing.input_hash !== task.inputHash ||
        existing.title !== task.title ||
        (existing.authority || null) !==
          (task.authority ? JSON.stringify(task.authority) : null)
      )
        throw new HttpError(409, "This task ID is already used.");
      if (
        existing.state !== "issued" ||
        existing.expires < iso() ||
        existing.policy_revision !== policy.revision ||
        existing.agent_revision !== row.revision
      )
        throw new HttpError(
          409,
          "This task has already started, expired, or its policy changed.",
        );
      return {
        permit: existing.receipt,
        taskId: existing.id,
        expires: existing.expires,
      };
    }
    const time = iso();
    const expires = new Date(Date.now() + 60000).toISOString();
    const payload = credential(
      {
        id: agentView(row).did,
        record: {
          type: "FTAIWorkPermit",
          agent: row.code,
          taskId: task.taskId,
          action: task.action,
          resource: task.resource,
          inputHash: task.inputHash,
          authority: task.authority || null,
          policyId: policy.id,
          policyRevision: policy.revision,
          agentRevision: row.revision,
          issuedAt: time,
        },
      },
      task.taskId,
      time,
    );
    payload.validUntil = expires;
    const c = config();
    const receipt = await sign(payload, c.jwk, c.kid);
    await db()
      .prepare(
        "INSERT INTO work_permits(id,agent,policy_id,action,resource,input_hash,title,state,policy_revision,agent_revision,agent_version,expires,created,receipt,authority) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        task.taskId,
        row.code,
        policy.id,
        task.action,
        task.resource,
        task.inputHash,
        task.title,
        "issued",
        policy.revision,
        row.revision,
        JSON.parse(row.profile).version || "unspecified",
        expires,
        time,
        receipt,
        task.authority ? JSON.stringify(task.authority) : null,
      )
      .run();
    return { permit: receipt, taskId: task.taskId, expires };
  }
  if (endpoint === "permits" && path[2]) {
    const permit = await db()
      .prepare("SELECT * FROM work_permits WHERE id=? AND agent=?")
      .bind(path[2], row.code)
      .first<PermitRow>();
    if (!permit) throw new HttpError(404, "Work permit not found.");
    if (req.method === "GET")
      return {
        taskId: permit.id,
        state: permit.state,
        expires: permit.expires,
        started: permit.started,
        completed: permit.completed,
        outcomeId: permit.outcome_id,
      };
    if (path[3] === "start" && req.method === "POST") {
      activeGate(ctx, permit.action);
      if (
        permit.policy_revision !== policy.revision ||
        permit.agent_revision !== row.revision
      )
        throw new HttpError(
          409,
          "The policy or passport changed. Request a new permit with a new task ID.",
        );
      if (permit.state !== "issued" || permit.expires <= iso())
        throw new HttpError(
          409,
          "The task permit is expired or already consumed.",
        );
      await checkTaskAuthority(
        ctx,
        permit.authority
          ? taskAuthoritySchema.parse(JSON.parse(permit.authority))
          : null,
        {
          action: permit.action,
          resource: permit.resource,
          inputHash: permit.input_hash,
        },
        true,
      );
      const now = iso();
      const r = await db()
        .prepare(
          "UPDATE work_permits SET state='started',started=? WHERE id=? AND agent=? AND state='issued' AND expires>? AND EXISTS(SELECT 1 FROM agents a JOIN runtime_agents r ON r.agent=a.code JOIN enrollment_policies p ON p.id=r.policy_id WHERE a.code=? AND a.status='active' AND a.revision=? AND r.revoked=0 AND p.status='active' AND p.revision=?)",
        )
        .bind(
          now,
          permit.id,
          row.code,
          now,
          row.code,
          row.revision,
          policy.revision,
        )
        .run();
      if (!r.meta.changes)
        throw new HttpError(
          409,
          "This permit expired, was already consumed, or no longer authorizes work. Do not execute the task.",
        );
      return {
        allowed: true,
        taskId: permit.id,
        startedAt: now,
        action: permit.action,
        resource: permit.resource,
        inputHash: permit.input_hash,
      };
    }
  }
  if (endpoint === "outcomes" && req.method === "POST") {
    const result = z
      .object({
        taskId: z.string().uuid(),
        outcome: z.enum(["success", "partial", "failed"]),
        durationSeconds: z.number().int().min(0).max(31536000),
        intervention: z.boolean().default(false),
        evidenceUrl: z
          .string()
          .url()
          .refine((s) => s.startsWith("https://"))
          .or(z.literal(""))
          .default(""),
        evidenceHash: z
          .string()
          .regex(/^$|^[a-f0-9]{64}$/)
          .default(""),
        notes: z.string().max(4000).default(""),
      })
      .strict()
      .parse(input);
    const permit = await db()
      .prepare("SELECT * FROM work_permits WHERE id=? AND agent=?")
      .bind(result.taskId, row.code)
      .first<PermitRow>();
    if (!permit || !["started", "completed"].includes(permit.state))
      throw new HttpError(409, "Only a started task can report an outcome.");
    const old = await db()
      .prepare("SELECT * FROM records WHERE id=? AND agent=?")
      .bind(result.taskId, row.code)
      .first<RecordRow>();
    if (old) {
      const payload = JSON.parse(old.payload);
      if (JSON.stringify(payload.runtimeResult) !== JSON.stringify(result))
        throw new HttpError(409, "This task already has a different outcome.");
      return { recordId: old.id, idempotent: true };
    }
    const prior = await db()
      .prepare(
        "SELECT hash FROM records WHERE agent=? ORDER BY sequence DESC LIMIT 1",
      )
      .bind(row.code)
      .first<RecordRow>();
    const record = await makeRecord(
      row.code,
      row.revision + 1,
      "task",
      permit.title,
      {
        id: result.taskId,
        kind: "task",
        title: permit.title,
        ...result,
        version: permit.agent_version,
        provenance: "authenticated-runtime",
        runtimeResult: result,
        workPermit: permit.id,
        authority: permit.authority ? JSON.parse(permit.authority) : null,
        action: permit.action,
        resource: permit.resource,
        requestProof: proof,
      },
      actor,
      prior?.hash || "GENESIS",
      result.taskId,
    );
    try {
      await db().batch([
        insertRecord(record),
        db()
          .prepare(
            "UPDATE agents SET revision=revision+1,updated=? WHERE code=? AND revision=?",
          )
          .bind(record.created, row.code, row.revision),
        db()
          .prepare(
            "UPDATE work_permits SET state='completed',completed=?,outcome_id=? WHERE id=? AND agent=? AND state='started'",
          )
          .bind(record.created, record.id, permit.id, row.code),
      ]);
    } catch {
      throw new HttpError(
        409,
        "Another record was saved at the same time. Retry this same outcome.",
      );
    }
    return { recordId: record.id, idempotent: false };
  }
  if (endpoint === "history" && req.method === "POST") {
    activeGate(ctx);
    const { importId, record: raw } = z
      .object({ importId: z.string().uuid(), record: z.unknown() })
      .strict()
      .parse(input);
    const imported = recordSchema.parse(raw);
    if (
      imported.kind === "employment" &&
      imported.endDate &&
      imported.endDate < imported.startDate
    )
      throw new HttpError(400, "Employment cannot end before it starts.");
    if (
      imported.kind === "credential" &&
      imported.expires &&
      imported.expires < imported.issued
    )
      throw new HttpError(
        400,
        "A credential cannot expire before it is issued.",
      );
    if (
      [
        "correction",
        "version",
        "employment_end",
        "incident_resolution",
      ].includes(imported.kind)
    )
      throw new HttpError(
        400,
        "Import original historical records, not lifecycle changes or corrections.",
      );
    const existing = await db()
      .prepare("SELECT * FROM records WHERE id=? AND agent=?")
      .bind(importId, row.code)
      .first<RecordRow>();
    if (existing) {
      if (
        JSON.stringify(JSON.parse(existing.payload).importedRecord) !==
        JSON.stringify(imported)
      )
        throw new HttpError(
          409,
          "Import ID already used for a different record.",
        );
      return { recordId: existing.id, idempotent: true };
    }
    const r = await append(
      row,
      "history_import",
      "Imported: " + imported.title.slice(0, 190),
      {
        importedRecord: imported,
        provenance: "runtime-reported-history",
        requestProof: proof,
      },
      actor,
      importId,
    );
    return { recordId: r.id, idempotent: false };
  }
  throw new HttpError(404, "Runtime endpoint not found.");
}
