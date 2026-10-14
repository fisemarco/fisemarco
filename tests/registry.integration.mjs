import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.FTAI_TEST_ORIGIN || "http://localhost:5173";
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "local test sign-in");
let passed = 0;
const checks = [];
function check(label, fn) {
  fn();
  checks.push(label);
  passed++;
}
async function req(
  path,
  { method = "GET", body, token, anonymous = false, origin = base } = {},
) {
  const headers = { "Content-Type": "application/json", Origin: origin };
  if (token) headers.Authorization = "Bearer " + token;
  else if (!anonymous) headers.Cookie = cookie;
  const res = await fetch(base + "/api/v1/" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { status: res.status, data };
}
const create = {
  name: "QA Atlas",
  role: "Test research analyst",
  organization: "FTAI local QA",
  profile: {
    description: "Local automated test record; never deployed.",
    version: "1.0.0",
    skills: ["Research"],
    allowed: ["Read documents"],
    denied: ["Transfer funds"],
  },
};
check("anonymous writes rejected", () => {});
assert.equal(
  (await req("agents", { method: "POST", body: create, anonymous: true }))
    .status,
  401,
);
assert.equal(
  (
    await req("agents", {
      method: "POST",
      body: create,
      origin: "https://attacker.example",
    })
  ).status,
  403,
);
checks.push("cross-origin writes rejected");
passed++;
const made = await req("agents", { method: "POST", body: create });
assert.equal(made.status, 201, JSON.stringify(made));
const code = made.data.agent.code;
const portable = await req(`agents/${code}/profile`);
assert.equal(portable.status, 200, JSON.stringify(portable));
assert.equal(portable.data.profileVersion, "ftai.identity/0.1");
assert.equal(portable.data.operator.assurance, "declared");
assert.equal("owner" in portable.data, false);
assert.equal(
  (await req(`agents/${code}/profile`, { anonymous: true })).status,
  401,
);
check("permanent personnel code issued", () =>
  assert.match(code, /^FTAI-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/),
);
assert.equal((await req("agents/" + code, { anonymous: true })).status, 401);
checks.push("private records hidden from anonymous users");
passed++;
const add = (body) =>
  req(`agents/${code}/records`, {
    method: "POST",
    body: { id: randomUUID(), ...body },
  });
const job = {
  id: randomUUID(),
  kind: "employment",
  title: "Research engagement",
  employer: "Local QA employer",
  role: "Analyst",
  startDate: "2026-01-01",
  compensation: "€800 / month",
};
assert.equal((await add(job)).status, 201);
const task = {
  id: randomUUID(),
  kind: "task",
  title: "Research report",
  outcome: "success",
  durationSeconds: 120,
  intervention: false,
  version: "1.0.0",
  employmentId: job.id,
  evidenceUrl: "https://example.com/evidence",
};
assert.equal((await add(task)).status, 201);
assert.equal((await add(task)).status, 200);
check("task retries are idempotent", () => {});
assert.equal((await add({ ...task, title: "different" })).status, 409);
check("conflicting idempotency keys rejected", () => {});
const fail = {
  id: randomUUID(),
  kind: "task",
  title: "Failed evaluation",
  outcome: "failed",
  durationSeconds: 60,
  intervention: true,
  version: "1.0.0",
};
assert.equal((await add(fail)).status, 201);
let d = (await req("agents/" + code)).data;
check("metrics include failures and intervention", () => {
  assert.equal(d.metrics.tasks, 2);
  assert.equal(d.metrics.success, 50);
  assert.equal(d.metrics.intervention, 50);
  assert.equal(d.metrics.average, 90);
});
assert.equal(
  (
    await add({
      kind: "task",
      title: "Invalid",
      outcome: "success",
      durationSeconds: -5,
      intervention: false,
      version: "1",
    })
  ).status,
  400,
);
check("invalid outcomes rejected", () => {});
assert.equal(
  (
    await add({
      kind: "employment_end",
      title: "Engagement complete",
      employmentId: job.id,
      endDate: "2026-08-31",
    })
  ).status,
  201,
);
d = (await req("agents/" + code)).data;
check("employment closure preserves linked outcomes", () => {
  assert.equal(d.metrics.jobs[0].payload.endDate, "2026-08-31");
  assert.equal(d.metrics.tasks, 2);
});
assert.equal(
  (
    await add({
      kind: "employment_end",
      title: "Duplicate close",
      employmentId: job.id,
      endDate: "2026-09-01",
    })
  ).status,
  409,
);
check("duplicate employment closure rejected", () => {});
assert.equal(
  (
    await add({
      kind: "version",
      title: "Version 2 released",
      version: "2.0.0",
      model: "QA model",
    })
  ).status,
  201,
);
d = (await req("agents/" + code)).data;
check("version release updates current profile", () =>
  assert.equal(d.agent.profile.version, "2.0.0"),
);
const incident = {
  id: randomUUID(),
  kind: "incident",
  title: "QA incident",
  severity: "low",
  state: "open",
  version: "2.0.0",
};
assert.equal((await add(incident)).status, 201);
assert.equal((await req("agents/" + code)).data.metrics.incidents, 1);
assert.equal(
  (
    await add({
      kind: "incident_resolution",
      title: "QA incident resolved",
      incidentId: incident.id,
      notes: "Fixed and re-evaluated.",
    })
  ).status,
  201,
);
assert.equal((await req("agents/" + code)).data.metrics.incidents, 0);
check("incident resolution preserves original and clears open count", () => {});
let verifyResult = await req(`agents/${code}/verify`);
check("full signature and hash-chain verification passes", () =>
  assert.equal(verifyResult.data.valid, true, JSON.stringify(verifyResult)),
);
const exported = await req(`agents/${code}/export`);
assert.ok(exported.data.jws);
assert.equal(
  (await req("verify", { method: "POST", body: { jws: exported.data.jws } }))
    .data.valid,
  true,
);
check("signed export verifies against current revision", () => {});
const parts = exported.data.jws.split(".");
parts[1] = Buffer.from('{"tampered":true}').toString("base64url");
assert.equal(
  (await req("verify", { method: "POST", body: { jws: parts.join(".") } })).data
    .valid,
  false,
);
check("tampered credential rejected", () => {});
assert.equal(
  (
    await add({
      kind: "correction",
      title: "Withdraw failed outcome",
      targetId: fail.id,
      notes: "Duplicate outcome in source system.",
    })
  ).status,
  201,
);
d = (await req("agents/" + code)).data;
check("withdrawal retains original and recalculates metrics", () => {
  assert.equal(d.metrics.tasks, 1);
  assert.equal(d.metrics.success, 100);
  assert.equal(d.records.find((r) => r.id === fail.id).withdrawn, true);
});
assert.equal(
  (await req("verify", { method: "POST", body: { jws: exported.data.jws } }))
    .data.valid,
  false,
);
check("stale snapshot rejected", () => {});
assert.equal(
  (
    await req("verify", {
      method: "POST",
      body: { jws: d.records.find((r) => r.id === fail.id).jws },
    })
  ).data.valid,
  false,
);
check("withdrawn credential rejected", () => {});
const read = (
  await req("keys", {
    method: "POST",
    body: { label: "QA read", scope: "read" },
  })
).data;
assert.ok(read.token);
assert.equal((await req("agents", { token: read.token })).status, 200);
assert.equal(
  (await req("agents", { method: "POST", token: read.token, body: create }))
    .status,
  403,
);
check("read API key cannot write", () => {});
assert.equal((await req("keys/" + read.id, { method: "DELETE" })).status, 200);
assert.equal((await req("agents", { token: read.token })).status, 403);
check("revoked API key rejected", () => {});
assert.equal(
  (
    await req("agents/" + code, {
      method: "PATCH",
      body: { ...d.agent, revision: 0 },
    })
  ).status,
  409,
);
check("stale profile update rejected", () => {});
const update = { ...d.agent, status: "suspended" };
assert.equal(
  (await req("agents/" + code, { method: "PATCH", body: update })).status,
  200,
);
assert.equal((await req(`agents/${code}/verify`)).data.valid, false);
check("suspended passport fails current-status verification", () => {});
assert.equal((await add({ ...task, id: randomUUID() })).status, 409);
check("suspended passport blocks work recording", () => {});
console.log(
  JSON.stringify({ passed, checks, localTestPassport: code }, null, 2),
);
