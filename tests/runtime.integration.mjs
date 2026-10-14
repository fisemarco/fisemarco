import assert from "node:assert/strict";
import { randomUUID, createPublicKey, sign } from "node:crypto";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FTAIClient, FTAIReportingError, sha256 } from "../public/sdk/ftai.mjs";
const base = process.env.FTAI_TEST_ORIGIN || "http://localhost:5173";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Tests are local-only",
);
const directory = await mkdtemp(join(tmpdir(), "ftai-runtime-"));
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
let passed = 0;
function pass(name) {
  passed++;
  console.log("PASS " + name);
}
async function req(
  path,
  { method = "GET", body, anonymous = false, headers = {} } = {},
) {
  const r = await fetch(base + "/api/v1/" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(!anonymous ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
async function reject(p, status) {
  await assert.rejects(p, (e) => e.status === status);
}
const policyInput = {
  label: "Runtime integration " + randomUUID().slice(0, 8),
  organization: "FTAI local QA",
  allowed: ["research.read", "draft.write"],
  denied: ["payment.send"],
  maxAgents: 10,
  status: "active",
};
assert.equal(
  (await req("enrollment-policies", { anonymous: true })).status,
  401,
);
assert.equal(
  (await req("runtime/enroll", { method: "POST", body: {}, anonymous: true }))
    .status,
  401,
);
pass("operator session and enrollment secret required");
const created = await req("enrollment-policies", {
  method: "POST",
  body: policyInput,
});
assert.equal(created.status, 200, JSON.stringify(created));
const policyId = created.data.id,
  bootstrap = created.data.key;
function client(id = randomUUID(), extra = {}) {
  return new FTAIClient({
    baseUrl: base,
    enrollmentKey: bootstrap,
    externalId: id,
    name: "Runtime QA",
    role: "Research assistant",
    profile: {
      version: "1.0",
      skills: ["research"],
      allowed: ["payment.send"],
    },
    statePath: join(directory, id + ".json"),
    ...extra,
  });
}
const historical = {
  id: randomUUID(),
  kind: "employment",
  title: "Prior research engagement",
  employer: "Reported employer",
  role: "Assistant",
  startDate: "2026-01-01",
};
const c = client(undefined, { history: [historical] });
const registration = await c.init();
assert.match(registration.code, /^FTAI-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
let me = await c.me();
assert.equal(me.agent.visibility, "private");
assert.equal(me.agent.organization, policyInput.organization);
assert.deepEqual(me.agent.profile.allowed, policyInput.allowed);
assert.equal((await stat(c.statePath)).mode & 0o777, 0o600);
assert.equal(
  (await req("agents/" + registration.code, { anonymous: true })).status,
  401,
);
pass(
  "automatic enrollment binds operator policy, creates private passport and protects signing key",
);
await c.importHistory([historical]);
let detail = (await req("agents/" + registration.code)).data;
assert.equal(
  detail.records.filter((r) => r.kind === "history_import").length,
  1,
);
assert.equal(detail.metrics.tasks, 0);
assert.equal(detail.metrics.jobs.length, 0);
pass("history imports are idempotent and separate from current work metrics");
const body = JSON.stringify({
  externalId: c.externalId,
  name: c.name,
  role: c.role,
  profile: c.profile,
  publicKey: createPublicKey(c.key).export({ format: "jwk" }),
});
const enrollmentHeaders = {
  Authorization: "Bearer " + bootstrap,
  "X-FTAI-Signature": sign(
    null,
    Buffer.from(["FTAI-Enrollment-v1", base, sha256(body)].join("\n")),
    c.key,
  ).toString("base64url"),
};
const again = await c._fetch("/api/v1/runtime/enroll", {
  body,
  headers: enrollmentHeaders,
});
assert.equal(again.code, registration.code);
assert.equal(again.registered, false);
await reject(
  c._fetch("/api/v1/runtime/enroll", {
    body: body.replace("Runtime QA", "Tampered QA"),
    headers: enrollmentHeaders,
  }),
  401,
);
await reject(
  client(c.externalId, { statePath: join(directory, "duplicate.json") }).init(),
  409,
);
pass("enrollment proof prevents metadata tampering and identity takeover");
const path = "/api/v1/runtime/heartbeat",
  raw = JSON.stringify({ status: "idle" }),
  timestamp = String(Math.floor(Date.now() / 1000)),
  nonce = randomUUID();
const signedHeaders = {
  "X-FTAI-Agent": registration.code,
  "X-FTAI-Timestamp": timestamp,
  "X-FTAI-Nonce": nonce,
  "X-FTAI-Signature": sign(
    null,
    Buffer.from(
      [
        "FTAI-Request-v1",
        base,
        registration.code,
        "POST",
        path,
        timestamp,
        nonce,
        sha256(raw),
      ].join("\n"),
    ),
    c.key,
  ).toString("base64url"),
};
await c._fetch(path, { body: raw, headers: signedHeaders });
await reject(c._fetch(path, { body: raw, headers: signedHeaders }), 409);
await reject(
  c._fetch(path, {
    body: JSON.stringify({ status: "offline" }),
    headers: { ...signedHeaders, "X-FTAI-Nonce": randomUUID() },
  }),
  401,
);
await reject(
  c._fetch(path, {
    body: raw,
    headers: { ...signedHeaders, "X-FTAI-Timestamp": "1000000000" },
  }),
  401,
);
pass("signed requests reject replay, tampering and stale timestamps");
await reject(
  c._signed("/api/v1/runtime/sync", {
    name: c.name,
    role: c.role,
    profile: {},
    organization: "Attacker",
  }),
  400,
);
assert.equal((await c.me()).agent.organization, policyInput.organization);
pass("runtime cannot rewrite organization identity");
let executions = 0;
await reject(
  c.runTask(
    {
      taskId: randomUUID(),
      title: "Invalid evidence",
      action: "research.read",
      evidenceUrl: "not-a-url",
    },
    async () => executions++,
  ),
  400,
);
assert.equal(executions, 0);
pass("invalid outcome metadata is rejected before task execution");

await reject(
  c.runTask(
    { taskId: randomUUID(), title: "Denied task", action: "payment.send" },
    async () => executions++,
  ),
  403,
);
assert.equal(executions, 0);
const taskId = randomUUID();
const answer = await c.runTask(
  {
    taskId,
    title: "Approved research",
    action: "research.read",
    inputHash: sha256("input"),
  },
  async ({ passportCode, signal }) => {
    assert.equal(passportCode, registration.code);
    assert.equal(signal.aborted, false);
    executions++;
    return 42;
  },
);
assert.equal(answer, 42);
assert.equal((await c.permitStatus(taskId)).state, "completed");
await reject(
  c.runTask(
    {
      taskId,
      title: "Approved research",
      action: "research.read",
      inputHash: sha256("input"),
    },
    async () => executions++,
  ),
  409,
);
assert.equal(executions, 1);
pass(
  "work gate denies unauthorized callbacks and prevents duplicate execution",
);
const failedTask = randomUUID();
await assert.rejects(
  c.runTask(
    { taskId: failedTask, title: "Execution failure", action: "research.read" },
    async () => {
      throw new Error("private failure text");
    },
  ),
  /private failure text/,
);
detail = (await req("agents/" + registration.code)).data;
assert.equal(detail.metrics.tasks, 2);
assert.equal(detail.metrics.success, 50);
assert.ok(!JSON.stringify(detail).includes("private failure text"));
assert.equal(
  detail.records.find((r) => r.id === failedTask).payload.provenance,
  "authenticated-runtime",
);
pass(
  "success and failure persist as authenticated outcomes without uploading raw errors",
);
const pendingTask = randomUUID(),
  originalFetch = c._fetch.bind(c);
c._fetch = async (path, options) => {
  if (path.endsWith("/outcomes")) throw new Error("simulated network outage");
  return originalFetch(path, options);
};
await assert.rejects(
  c.runTask(
    {
      taskId: pendingTask,
      title: "Durable reporting",
      action: "research.read",
    },
    async () => {
      executions++;
      return "done";
    },
  ),
  (e) => e instanceof FTAIReportingError && e.persisted && e.result === "done",
);
assert.equal(JSON.parse(await readFile(c.outboxPath, "utf8")).length, 1);
c._fetch = originalFetch;
await c.flushOutcomes();
assert.equal((await c.permitStatus(pendingTask)).state, "completed");
assert.equal(JSON.parse(await readFile(c.outboxPath, "utf8")).length, 0);
assert.equal(executions, 2);
pass("outcome outbox recovers from network outage without re-executing work");
async function patchPolicy(changes = {}) {
  const p = (await req("enrollment-policies")).data.policies.find(
    (p) => p.id === policyId,
  );
  const r = await req("enrollment-policies/" + policyId, {
    method: "PATCH",
    body: { ...policyInput, ...p, maxAgents: p.max_agents, ...changes },
  });
  assert.equal(r.status, 200, JSON.stringify(r));
}
const permitId = randomUUID();
await c._signed("/api/v1/runtime/authorize", {
  taskId: permitId,
  title: "Pause before start",
  action: "research.read",
});
await patchPolicy({ status: "paused" });
await reject(
  c._signed("/api/v1/runtime/permits/" + permitId + "/start", {}),
  403,
);
await patchPolicy({ status: "active" });
await reject(
  c._signed("/api/v1/runtime/permits/" + permitId + "/start", {}),
  409,
);
pass(
  "pause blocks outstanding work and policy revisions invalidate old permits",
);
const once = randomUUID();
await c._signed("/api/v1/runtime/authorize", {
  taskId: once,
  title: "Concurrent consumption",
  action: "research.read",
});
const consumes = await Promise.allSettled([
  c._signed("/api/v1/runtime/permits/" + once + "/start", {}),
  c._signed("/api/v1/runtime/permits/" + once + "/start", {}),
]);
assert.equal(consumes.filter((r) => r.status === "fulfilled").length, 1);
assert.equal(consumes.find((r) => r.status === "rejected").reason.status, 409);
await c.reportOutcome({
  taskId: once,
  outcome: "partial",
  durationSeconds: 1,
  notes: "Integration test",
});
pass("permit consumption is atomic under concurrent requests");
const beforePause = randomUUID();
await c._signed("/api/v1/runtime/authorize", {
  taskId: beforePause,
  title: "Finish after policy pause",
  action: "research.read",
});
await c._signed("/api/v1/runtime/permits/" + beforePause + "/start", {});
await patchPolicy({ status: "paused" });
await c.reportOutcome({
  taskId: beforePause,
  outcome: "failed",
  durationSeconds: 1,
});
await patchPolicy({ status: "active" });
pass("already-started work can report after policy pause");
const rotated = await req("enrollment-policies/" + policyId + "/rotate", {
  method: "POST",
  body: {},
});
assert.equal(rotated.status, 200);
await reject(client().init(), 403);
await c.me();
pass(
  "bootstrap rotation blocks old enrollment secret and preserves existing signing identities",
);
assert.equal(
  (
    await req("enrollment-policies/" + policyId + "/revoke-agent", {
      method: "POST",
      body: { agent: registration.code },
    })
  ).status,
  200,
);
await reject(c.me(), 403);
const recovery = client(c.externalId, {
  enrollmentKey: undefined,
  statePath: c.statePath,
});
const newPublicKey = await recovery.prepareKeyRotation();
assert.equal(
  (
    await req("enrollment-policies/" + policyId + "/replace-key", {
      method: "POST",
      body: { agent: registration.code, publicKey: newPublicKey },
    })
  ).status,
  200,
);
await recovery.activateKeyRotation();
await recovery.init();
assert.equal((await recovery.me()).agent.code, registration.code);
await reject(c.me(), 401);
pass(
  "revocation and owner-approved key recovery preserve personnel code and reject old key",
);
detail = (await req("agents/" + registration.code)).data;
const integrity = await req("agents/" + registration.code + "/verify");
assert.equal(integrity.status, 200);
assert.equal(integrity.data.valid, true, JSON.stringify(integrity));
assert.ok(detail.records.some((r) => r.kind === "runtime_access"));
pass("runtime activity and key changes preserve the signed record chain");
const cap = await req("enrollment-policies", {
  method: "POST",
  body: { ...policyInput, label: "Capacity test", maxAgents: 1 },
});
const enrollments = await Promise.allSettled([
  client(undefined, { enrollmentKey: cap.data.key }).init(),
  client(undefined, { enrollmentKey: cap.data.key }).init(),
]);
assert.equal(enrollments.filter((r) => r.status === "fulfilled").length, 1);
pass("concurrent enrollment cannot exceed organization capacity");
const discovery = await fetch(base + "/.well-known/ftai-passport.json").then(
  (r) => r.json(),
);
assert.equal(discovery.registration.privateByDefault, true);
assert.equal(discovery.sdk, base + "/sdk/ftai.mjs");
pass("public discovery advertises executable SDK and private defaults");
const expiryTask = randomUUID();
await recovery._signed("/api/v1/runtime/authorize", {
  taskId: expiryTask,
  title: "Expired permit",
  action: "research.read",
});
console.log("Waiting for the actual 60-second permit lifetime...");
await new Promise((resolve) => setTimeout(resolve, 62000));
await reject(
  recovery._signed("/api/v1/runtime/permits/" + expiryTask + "/start", {}),
  409,
);
pass("expired permits cannot be consumed");
await recovery.close();
console.log(
  JSON.stringify({
    passed,
    passport: registration.code,
    stateDirectory: directory,
  }),
);
