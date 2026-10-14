import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { FTAIClient } from "../public/sdk/ftai.mjs";
import {
  IntelligenceControl,
  compatibleProvider,
  startOpenAICompatibleGateway,
} from "../public/sdk/intelligence.mjs";
const base = "http://localhost:5173";
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
    redirect: "manual",
  }),
  cookie = login.headers.get("set-cookie").split(";")[0];
async function api(path, body, expected = 200) {
  const r = await fetch(base + "/api/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const d = await r.json();
  assert.equal(r.status, expected, JSON.stringify(d));
  return d;
}
const folder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
  sqlite = new DatabaseSync(
    join(
      folder,
      (await readdir(folder)).find((f) => /^[a-f0-9]+\.sqlite$/.test(f)),
    ),
  );
sqlite.exec("PRAGMA foreign_keys=ON");
const dir = await mkdtemp(join(tmpdir(), "ftai-intelligence-"));
let org, other, policy, client, gateway, provider;
let modelCalls = 0,
  frontierCalls = 0,
  seen = [];
try {
  sqlite.exec("DELETE FROM request_limits");
  org = await api("organisations", { name: "Intelligence QA " + randomUUID() });
  other = await api("organisations", { name: "Isolation QA " + randomUUID() });
  policy = await api("enrollment-policies", {
    label: "Intelligence QA",
    organization: "QA",
    allowed: ["qa.task"],
    maxAgents: 1,
    status: "active",
  });
  client = new FTAIClient({
    baseUrl: base,
    enrollmentKey: policy.key,
    externalId: randomUUID(),
    name: "Intelligence QA",
    role: "QA",
    statePath: join(dir, "identity.json"),
  });
  await client.init();
  await api("organisations/" + org.id + "/agents", {
    agent: client.state.code,
    classification: "A2",
    team: "QA",
  });
  const request = {
    action: "qa.task",
    resource: "test",
    country: "FI",
    currency: "EUR",
    amountMinor: 0,
  };
  const grant = await api("organisations/" + org.id + "/grants", {
    subject: client.state.code,
    parent: null,
    constraints: {
      actions: ["qa.task"],
      resources: ["test"],
      countries: ["FI"],
      currency: "EUR",
      maxAmountMinor: 100,
      approvalAboveMinor: 0,
      mayDelegate: false,
    },
    expires: new Date(Date.now() + 3600000).toISOString(),
  });
  let document = {
    mode: "enforce",
    allowedTools: ["crm.account", "crm.buyer", "calendar.schedule"],
    models: [
      {
        id: "local",
        provider: "fixture",
        tier: "local",
        quality: 0.98,
        taskTypes: ["generation"],
        region: "FI",
        external: false,
      },
      {
        id: "frontier",
        provider: "fixture",
        tier: "frontier",
        quality: 0.99,
        taskTypes: ["reasoning", "generation", "lookup"],
        region: "FI",
        external: true,
      },
    ],
    minimumQuality: 0.95,
    baselineCostPerStep: 0.1,
    baselineModel: "frontier",
  };
  let p = await api("intelligence/policy?organisation=" + org.id, {
    expectedVersion: 0,
    document,
  });
  await api("intelligence/capabilities?organisation=" + org.id, {
    id: "lead.score",
    description: "QA lead scoring",
    taskTypes: ["classification"],
    aliases: ["score lead"],
    quality: 0.98,
    permissions: ["qa.task"],
    risk: "low",
    method: "lead.score",
    inputSchema: { type: "object" },
    outputSchema: { type: "number" },
    source: "QA fixture",
    expectedVersion: 0,
  });
  await api("intelligence/review?organisation=" + org.id, {
    id: "lead.score",
    version: 1,
    status: "validated",
    datasetHash: "a".repeat(64),
    samples: 5,
    score: 0.98,
    safetyPassed: true,
    notes: "Evaluated deterministic QA fixture.",
  });
  provider = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    seen.push(JSON.parse(raw));
    modelCalls++;
    frontierCalls++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: "fixture objection response" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    );
  });
  await new Promise((r) => provider.listen(0, "127.0.0.1", r));
  const control = new IntelligenceControl({
    client,
    outboxPath: join(dir, "trace-outbox"),
    handlers: {
      "crm.account": async () => ({ value: { name: "Acme" }, cost: 0 }),
      "crm.buyer": async () => ({ value: { buyer: "QA" }, cost: 0 }),
      relationship: async ({ context }) => ({
        value: context.relationship,
        cost: 0,
      }),
      "lead.score": async () => ({ value: 85, cost: 0 }),
      "calendar.schedule": async () => ({ value: "scheduled", cost: 0 }),
    },
    models: {
      local: async () => {
        modelCalls++;
        return { value: "local outreach", cost: 0 };
      },
      frontier: compatibleProvider({
        baseUrl: "http://127.0.0.1:" + provider.address().port + "/v1",
        model: "fixture",
      }),
    },
  });
  const make = (intent, extra = {}, context = {}) => ({
    step: {
      stepId: "sales-" + randomUUID().slice(0, 8),
      intent,
      action: "qa.task",
      resource: "test",
      ...extra,
    },
    context,
    grant: grant.id,
    request,
  });
  const validate = async () => ({ valid: true, score: 0.99 });
  const tasks = [
    make("Find account", { tool: { id: "crm.account", quality: 1 } }),
    make("Find buyer", { tool: { id: "crm.buyer", quality: 1 } }),
    make(
      "Check existing relationship",
      {},
      {
        relationship: {
          value: "existing",
          kind: "episodic",
          validated: true,
          answer: true,
          relevant: true,
        },
      },
    ),
    make("Score lead", { capability: "lead.score" }),
    make("Generate initial outreach", { localConfidence: 0.98 }),
    make(
      "Handle unusual objection",
      { novel: true, complex: true },
      {
        facts: {
          value: {
            account: "Acme",
            email: "person@example.com",
            token: "secret",
          },
          relevant: true,
        },
        private: { value: "NEVER_LEAVE", sensitive: true, relevant: true },
        irrelevant: { value: "NOT_RELEVANT" },
      },
    ),
    make("Schedule follow-up", {
      tool: { id: "calendar.schedule", quality: 1 },
    }),
  ];
  const results = [];
  for (const t of tasks) results.push(await control.run(t, { validate }));
  assert.deepEqual(
    results.map((r) => r.route),
    ["tool", "tool", "context", "capability", "local", "frontier", "tool"],
  );
  assert.equal(frontierCalls, 1);
  assert.equal(modelCalls, 2);
  assert.ok(!JSON.stringify(seen).includes("NEVER_LEAVE"));
  assert.ok(!JSON.stringify(seen).includes("NOT_RELEVANT"));
  assert.ok(!JSON.stringify(seen).includes("person@example.com"));
  assert.ok(!JSON.stringify(seen).includes("secret"));
  let metrics = await api("intelligence/metrics?organisation=" + org.id);
  assert.equal(metrics.completed, 7);
  assert.equal(metrics.frontierDependency, 100 / 7);
  assert.equal(metrics.externalCalls, 1);
  assert.equal(metrics.estimatedSavings, null);
  assert.equal(metrics.costReports, 6);
  const traces = await api("intelligence/executions?organisation=" + org.id);
  assert.equal(traces.items.length, 7);
  assert.ok(!JSON.stringify(traces).includes("NEVER_LEAVE"));
  assert.equal(
    (await api("intelligence/executions?organisation=" + other.id)).items
      .length,
    0,
  );
  await api(
    "intelligence/executions/" +
      results[0].executionId +
      "?organisation=" +
      other.id,
    undefined,
    404,
  );
  assert.equal(
    (await api("intelligence/capabilities?organisation=" + other.id))
      .capabilities.length,
    0,
  );
  const unauth = await fetch(
    base + "/api/v1/intelligence/metrics?organisation=" + org.id,
  );
  assert.equal(unauth.status, 401);
  const page = await api(
    "intelligence/executions?organisation=" + org.id + "&limit=2",
  );
  assert.equal(page.items.length, 2);
  assert.ok(page.next);
  const older = await api(
    "intelligence/executions?organisation=" +
      org.id +
      "&limit=2&after=" +
      encodeURIComponent(page.next),
  );
  assert.ok(!older.items.some((i) => page.items.some((j) => j.id === i.id)));
  // Shadow leaves the actual provider invocation unchanged.
  p = await api("intelligence/policy?organisation=" + org.id, {
    expectedVersion: p.version,
    document: { ...document, mode: "shadow" },
  });
  const shadow = await control.run(
    {
      ...make("Find account", { tool: { id: "crm.account", quality: 1 } }),
      actualRoute: "frontier",
      actualModel: "frontier",
    },
    { validate },
  );
  assert.equal(shadow.route, "frontier");
  const trace = await api(
    "intelligence/executions/" + shadow.executionId + "?organisation=" + org.id,
  );
  assert.equal(trace.decision.recommended_route, "tool");
  assert.equal(frontierCalls, 2);
  // Enforce model output validation failure escalates, and both attempts are traced.
  p = await api("intelligence/policy?organisation=" + org.id, {
    expectedVersion: p.version,
    document,
  });
  const escalated = await control.run(
    make("Generate outreach", { localConfidence: 0.98 }),
    {
      validate: async (value) => ({
        valid: value !== "local outreach",
        score: value === "local outreach" ? 0.4 : 0.99,
      }),
    },
  );
  assert.equal(escalated.route, "frontier");
  assert.equal(
    (await api("intelligence/metrics?organisation=" + org.id)).retries,
    1,
  );
  // Isolated local test quota reset: this long scenario is not a throughput benchmark.
  sqlite.exec("DELETE FROM request_limits");
  // Historical quality guardrails use bounded same-tenant, same-policy evidence.
  for (let i = 0; i < 20; i++) {
    if (i === 10) sqlite.exec("DELETE FROM request_limits");
    await control.run(
      {
        ...make("Generate outreach", { localConfidence: 0.98 }),
        pattern: "history-quality",
      },
      {
        validate: async (value) => ({
          valid: value !== "local outreach",
          score: value === "local outreach" ? 0.4 : 0.99,
        }),
      },
    );
  }
  const historyRoute = await control.resolve(
    make("Generate outreach", { localConfidence: 0.98 }),
  );
  assert.equal(historyRoute.resolution.route, "frontier");
  assert.ok(
    historyRoute.resolution.decision.reason_codes.includes(
      "QUALITY_HISTORY_GUARDRAIL",
    ),
  );
  // Policy changes invalidate a prepared decision before any side effect.
  const stale = await control.resolve(
    make("Find account", { tool: { id: "crm.account", quality: 1 } }),
  );
  p = await api("intelligence/policy?organisation=" + org.id, {
    expectedVersion: p.version,
    document,
  });
  await assert.rejects(control.execute(stale, { validate }), /policy changed/i);
  // Auditor access is read-only; a changed policy also stops active work at a resource check.
  const owner = sqlite
    .prepare("SELECT owner FROM organisations WHERE id=?")
    .get(org.id).owner;
  sqlite
    .prepare(
      "UPDATE organisation_members SET role='auditor' WHERE organisation=? AND user=?",
    )
    .run(org.id, owner);
  await api(
    "intelligence/policy?organisation=" + org.id,
    { expectedVersion: p.version, document },
    403,
  );
  await api("intelligence/metrics?organisation=" + org.id);
  sqlite
    .prepare(
      "UPDATE organisation_members SET role='owner' WHERE organisation=? AND user=?",
    )
    .run(org.id, owner);
  const previousHandler = control.handlers["crm.account"];
  control.handlers["crm.account"] = async ({ assertAllowed }) => {
    p = await api("intelligence/policy?organisation=" + org.id, {
      expectedVersion: p.version,
      document,
    });
    await assertAllowed();
    return { value: "should not run" };
  };
  await assert.rejects(
    control.run(
      make("Find account", { tool: { id: "crm.account", quality: 1 } }),
      { validate },
    ),
    (e) => e.code === "policy_denied",
  );
  control.handlers["crm.account"] = previousHandler;
  // Pausing stops work but cannot suppress its signed failure/completion trace.
  for (const target of ["policy", "agent"]) {
    const paused = await control.resolve(
      make("Find account", { tool: { id: "crm.account", quality: 1 } }),
    );
    const pause = (status) =>
      target === "policy"
        ? sqlite
            .prepare("UPDATE enrollment_policies SET status=? WHERE id=?")
            .run(status, policy.id)
        : sqlite
            .prepare("UPDATE agents SET status=? WHERE code=?")
            .run(status, client.state.code);
    control.handlers["crm.account"] = async ({ assertAllowed }) => {
      pause("paused");
      await assertAllowed();
      return { value: "should not run" };
    };
    try {
      await assert.rejects(
        control.execute(paused, { validate }),
        (e) => e.code === "policy_denied",
      );
      const trace = sqlite
        .prepare("SELECT state,report FROM intelligence_executions WHERE id=?")
        .get(paused.resolution.executionId);
      assert.equal(trace.state, "failed");
      assert.equal(JSON.parse(trace.report).error, "policy_denied");
      assert.equal((await readdir(join(dir, "trace-outbox"))).length, 0);
      await assert.rejects(
        control.resolve(
          make("Find account", { tool: { id: "crm.account", quality: 1 } }),
        ),
        /active organisation runtime/,
      );
      const retry = JSON.parse(trace.report);
      delete retry.source;
      delete retry.currency;
      await client._signed("/api/v1/intelligence/evaluate", retry);
    } finally {
      pause("active");
      control.handlers["crm.account"] = previousHandler;
    }
  }
  // Reporting permission does not bypass key revocation.
  sqlite
    .prepare("UPDATE runtime_agents SET revoked=1 WHERE agent=?")
    .run(client.state.code);
  try {
    await assert.rejects(
      client._signed("/api/v1/intelligence/evaluate", results[0].report),
      /revoked/,
    );
  } finally {
    sqlite
      .prepare("UPDATE runtime_agents SET revoked=0 WHERE agent=?")
      .run(client.state.code);
  }
  // Human oversight completes through the existing exact-input approval workflow.
  const humanGrant = await api("organisations/" + org.id + "/grants", {
    subject: client.state.code,
    parent: null,
    constraints: {
      actions: ["qa.task"],
      resources: ["test"],
      countries: ["FI"],
      currency: "EUR",
      maxAmountMinor: 0,
      approvalAboveMinor: 0,
      requireApproval: true,
      mayDelegate: false,
    },
    expires: new Date(Date.now() + 3600000).toISOString(),
  });
  await assert.rejects(
    client.runAuthorizedTask(
      {
        grant: grant.id,
        request,
        taskId: randomUUID(),
        input: { unclassified: true },
        title: "Unclassified work",
      },
      async () => ({ shouldNotRun: true }),
    ),
    /Intelligence Control decision/,
  );
  const human = await control.resolve({
    ...make("Perform high-impact task", { risk: "high" }),
    request,
    grant: humanGrant.id,
  });
  await assert.rejects(
    control.execute(human, { validate }),
    (e) => e.code === "human_required",
  );
  const approval = await control.requestApproval(human);
  await api("organisations/" + org.id + "/approvals/" + approval.id, {
    decision: "approved",
    reason: "QA exact-input review",
  });
  const humanResult = await control.execute(human, {
    validate,
    approval: approval.id,
    human: async () => ({ value: "human reviewed", cost: 0 }),
  });
  assert.equal(humanResult.route, "human");
  await assert.rejects(
    control.execute(human, {
      validate,
      approval: approval.id,
      human: async () => ({ value: "duplicate" }),
    }),
  );
  // Non-streaming OpenAI-compatible bridge executes a mapped existing step.
  gateway = await startOpenAICompatibleGateway({
    control,
    token: "t".repeat(40),
    prepare: async () =>
      make("Find account", { tool: { id: "crm.account", quality: 1 } }),
    validate,
  });
  let r = await fetch(gateway.baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + "t".repeat(40),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "ftai",
      messages: [{ role: "user", content: "Find account" }],
    }),
  });
  assert.equal(r.status, 200);
  const chat = await r.json();
  assert.equal(chat.ftai.route, "tool");
  assert.ok(chat.choices[0].message.content.includes("Acme"));
  r = await fetch(gateway.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(r.status, 401);
  r = await fetch(gateway.baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + "t".repeat(40),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ stream: true, messages: [] }),
  });
  assert.equal(r.status, 400);
  // Reporting retries are idempotent after a lost acknowledgement.
  await client._signed("/api/v1/intelligence/evaluate", results[0].report);
  assert.equal((await readdir(join(dir, "trace-outbox"))).length, 0);
  // Repeated evaluated model patterns become review candidates, not auto-promoted code.
  for (let i = 0; i < 3; i++)
    await control.run(
      {
        ...make("Handle unusual objection", { novel: true, complex: true }),
        pattern: "repeated-objection",
      },
      { validate },
    );
  const candidates = await api(
    "intelligence/candidates?organisation=" + org.id,
  );
  assert.ok(
    candidates.patterns.some(
      (p) => p.pattern === "repeated-objection" && p.samples === 3,
    ),
  );
  await api("intelligence/capabilities?organisation=" + org.id, {
    id: "lead.score",
    description: "QA lead scoring revision",
    taskTypes: ["classification"],
    aliases: ["score lead"],
    quality: 0.98,
    permissions: ["qa.task"],
    risk: "low",
    method: "lead.score",
    inputSchema: { type: "object" },
    outputSchema: { type: "number" },
    source: "QA fixture",
    expectedVersion: 1,
  });
  const staging = await control.resolve(
    make("Score lead", { capability: "lead.score" }),
  );
  assert.equal(staging.resolution.route, "capability");
  assert.equal(staging.resolution.decision.capability_version, 1);
  assert.equal(
    (
      await api(
        "intelligence/capability-history?organisation=" +
          org.id +
          "&id=lead.score",
      )
    ).versions.length,
    2,
  );
  const cap = await api("intelligence/capabilities?organisation=" + org.id);
  assert.equal(cap.capabilities.length, 1);
  await api("intelligence/review?organisation=" + org.id, {
    id: "lead.score",
    version: 1,
    status: "withdrawn",

    notes: "Withdraw QA version after regression.",
  });
  const withdrawn = await control.resolve(
    make("Score lead", { capability: "lead.score" }),
  );
  assert.notEqual(withdrawn.resolution.route, "capability");
  const exported = await api("privacy/export", { code: client.state.code });
  assert.ok(exported.intelligenceExecutions.length > 0);
  await api("privacy/erase", {
    code: client.state.code,
    confirm: client.state.code,
  });
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) n FROM intelligence_executions WHERE agent=?")
      .get(client.state.code).n,
    0,
  );
  console.log(
    "PASS intelligence integration: real signed runtime, seven-step loop, HTTP provider invocation counter, minimized context, tenant isolation, pagination, shadow actual route, quality escalation, stale policy denial, completed human approval, gateway authentication/stream rejection, idempotent reporting, compiler candidates, withdrawal and privacy export/erasure.",
  );
} finally {
  if (gateway) await gateway.close();
  if (provider) await new Promise((r) => provider.close(r));
  await client?.close().catch(() => {});
  if (
    client?.state?.code &&
    sqlite
      .prepare("SELECT status FROM agents WHERE code=?")
      .get(client.state.code)?.status !== "retired"
  )
    await api("privacy/erase", {
      code: client.state.code,
      confirm: client.state.code,
    });
  for (const o of [org, other])
    if (o) sqlite.prepare("DELETE FROM organisations WHERE id=?").run(o.id);
  if (policy)
    sqlite
      .prepare("DELETE FROM enrollment_policies WHERE id=?")
      .run(policy.policy?.id ?? policy.id);
  sqlite.close();
  await rm(dir, { recursive: true, force: true });
}
