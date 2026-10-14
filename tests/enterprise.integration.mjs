import assert from "node:assert/strict";
import { verifyGraphPage } from "../public/sdk/graph.mjs";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FTAIClient, sha256 } from "../public/sdk/ftai.mjs";
const base = "http://localhost:5173";
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
async function req(
  path,
  body,
  method = body ? "POST" : "GET",
  anonymous = false,
) {
  const r = await fetch(base + "/api/v1/" + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(!anonymous ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
async function ok(path, body, method) {
  const r = await req(path, body, method);
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.data;
}
const directory = await mkdtemp(join(tmpdir(), "ftai-enterprise-"));
const policy = await ok("enrollment-policies", {
  label: "Enterprise QA " + randomUUID(),
  organization: "QA",
  allowed: ["procurement.purchase"],
  denied: [],
  maxAgents: 3,
  status: "active",
});
const clients = [0, 1].map(
  (n) =>
    new FTAIClient({
      baseUrl: base,
      enrollmentKey: policy.key,
      externalId: randomUUID(),
      name: "Enterprise QA " + n,
      role: "Test agent",
      statePath: join(directory, n + ".json"),
    }),
);
const org = await ok("organisations", {
  name: "Enterprise QA " + randomUUID(),
});
const path = "organisations/" + org.id;
const folder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const file = (await readdir(folder)).find((f) => /^[a-f0-9]+\.sqlite$/.test(f));
assert.ok(file);
const sqlite = new DatabaseSync(join(folder, file));
sqlite.exec("PRAGMA foreign_keys=ON");
let owner;
try {
  for (const c of clients) await c.init();
  assert.equal(
    (await req("organisations", undefined, "GET", true)).status,
    401,
  );
  for (const c of clients)
    await ok(path + "/agents", {
      agent: c.state.code,
      classification: "A3",
      team: "Finance",
    });
  let detail = await ok(path);
  assert.equal(detail.agents.length, 2);
  assert.equal(detail.assurance, "declared");
  assert.ok(detail.members.every((m) => !("user" in m)));
  console.log(
    "PASS organisation creation, private membership, workforce classification and pseudonymous member view",
  );
  owner = sqlite
    .prepare("SELECT owner FROM organisations WHERE id=?")
    .get(org.id).owner;
  sqlite
    .prepare(
      "UPDATE organisation_members SET role=? WHERE organisation=? AND user=?",
    )
    .run("auditor", org.id, owner);
  assert.equal((await req(path + "/grants", {})).status, 403);
  assert.equal(
    (await req(path + "/invitations", { role: "admin" })).status,
    403,
  );
  sqlite
    .prepare(
      "UPDATE organisation_members SET role=? WHERE organisation=? AND user=?",
    )
    .run("owner", org.id, owner);
  const foreign = randomUUID();
  sqlite
    .prepare("INSERT INTO organisations VALUES(?,?,?,?)")
    .run(foreign, "Foreign", "other-user", new Date().toISOString());
  assert.equal((await req("organisations/" + foreign)).status, 404);
  sqlite.prepare("DELETE FROM organisations WHERE id=?").run(foreign);
  console.log("PASS role enforcement and cross-organisation isolation");
  const invitation = await ok(path + "/invitations", { role: "auditor" });
  // Remove the local fixture membership temporarily to exercise a real one-time join.
  sqlite
    .prepare("DELETE FROM organisation_members WHERE organisation=? AND user=?")
    .run(org.id, owner);
  await ok("organisations/join", { token: invitation.token });
  assert.equal(
    (await req("organisations/join", { token: invitation.token })).status,
    400,
  );
  assert.equal((await ok(path)).role, "auditor");
  sqlite
    .prepare(
      "UPDATE organisation_members SET role=? WHERE organisation=? AND user=?",
    )
    .run("owner", org.id, owner);
  console.log("PASS hashed, one-time invitation redemption and assigned role");
  const constraints = {
    actions: ["procurement.purchase"],
    resources: ["supplier:1"],
    countries: ["FI"],
    currency: "EUR",
    maxAmountMinor: 10000,
    approvalAboveMinor: 5000,
    mayDelegate: true,
  };
  const expires = new Date(Date.now() + 3600000).toISOString();
  const root = await ok(path + "/grants", {
    subject: clients[0].state.code,
    parent: null,
    constraints,
    expires,
  });
  const childInput = {
    subject: clients[1].state.code,
    parent: root.id,
    constraints: { ...constraints, maxAmountMinor: 7000, mayDelegate: false },
    expires,
  };
  assert.equal(
    (
      await req(path + "/grants", {
        ...childInput,
        constraints: { ...constraints, maxAmountMinor: 20000 },
      })
    ).status,
    400,
  );
  const child = await ok(path + "/grants", childInput);
  assert.equal(
    (await ok(path + "/handshake", { grant: child.id })).authority,
    "valid-declared-chain",
  );
  sqlite
    .prepare("UPDATE runtime_agents SET revoked=1 WHERE agent=?")
    .run(clients[0].state.code);
  try {
    assert.equal(
      (await ok(path + "/handshake", { grant: child.id })).authority,
      "invalid",
    );
  } finally {
    sqlite
      .prepare("UPDATE runtime_agents SET revoked=0 WHERE agent=?")
      .run(clients[0].state.code);
  }
  const action = {
    action: "procurement.purchase",
    resource: "supplier:1",
    country: "FI",
    currency: "EUR",
    amountMinor: 4000,
  };
  assert.equal(
    (await ok(path + "/evaluate", { grant: child.id, request: action }))
      .decision,
    "ALLOW",
  );
  assert.equal(
    (
      await ok(path + "/evaluate", {
        grant: child.id,
        request: { ...action, amountMinor: 6000 },
      })
    ).decision,
    "ESCALATE",
  );
  assert.equal(
    (
      await ok(path + "/evaluate", {
        grant: child.id,
        request: { ...action, amountMinor: 8000 },
      })
    ).decision,
    "DENY",
  );
  const live = await clients[1].checkAuthority(child.id, action);
  assert.equal(live.decision, "ALLOW");
  assert.equal(live.executionPermit, false);
  assert.ok(live.receipt);
  await assert.rejects(
    clients[0].checkAuthority(child.id, action),
    (e) => e.status === 404,
  );
  console.log(
    "PASS bounded delegation, escalation, live key proof and wrong-subject denial",
  );
  const agentChild = await clients[0].delegateAuthority(
    root.id,
    clients[1].state.code,
    childInput.constraints,
    expires,
  );
  assert.ok(agentChild.receipt);
  await assert.rejects(
    clients[1].delegateAuthority(
      root.id,
      clients[0].state.code,
      childInput.constraints,
      expires,
    ),
    (e) => e.status === 404,
  );
  await assert.rejects(
    clients[0].delegateAuthority(
      root.id,
      clients[1].state.code,
      { ...constraints, maxAmountMinor: 20000 },
      expires,
    ),
    (e) => e.status === 400,
  );
  console.log(
    "PASS agent-signed delegation, wrong-parent rejection and attenuation",
  );
  const escalated = { ...action, amountMinor: 6000 },
    inputHash = "a".repeat(64);
  const approval = await clients[1].requestApproval(
    child.id,
    escalated,
    inputHash,
  );
  assert.equal(approval.state, "pending");
  await assert.rejects(
    clients[1].consumeApproval(approval.id, child.id, escalated, inputHash),
    (e) => e.status === 409,
  );
  sqlite
    .prepare(
      "UPDATE organisation_members SET role='auditor' WHERE organisation=? AND user=?",
    )
    .run(org.id, owner);
  assert.equal(
    (
      await req(path + "/approvals/" + approval.id, {
        decision: "approved",
        reason: "Reviewed exact task",
      })
    ).status,
    403,
  );
  sqlite
    .prepare(
      "UPDATE organisation_members SET role='owner' WHERE organisation=? AND user=?",
    )
    .run(org.id, owner);
  const decided = await ok(path + "/approvals/" + approval.id, {
    decision: "approved",
    reason: "Reviewed exact task",
  });
  assert.ok(decided.receipt);
  await assert.rejects(
    clients[1].consumeApproval(
      approval.id,
      child.id,
      escalated,
      "b".repeat(64),
    ),
    (e) => e.status === 403,
  );
  const races = await Promise.allSettled([
    clients[1].consumeApproval(approval.id, child.id, escalated, inputHash),
    clients[1].consumeApproval(approval.id, child.id, escalated, inputHash),
  ]);
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await ok(path + "/approvals")).approvals.find((a) => a.id === approval.id)
      .state,
    "consumed",
  );
  const removedApprover = await clients[1].requestApproval(
    child.id,
    escalated,
    inputHash,
  );
  await ok(path + "/approvals/" + removedApprover.id, {
    decision: "approved",
    reason: "Reviewed exact task",
  });
  sqlite
    .prepare(
      "UPDATE organisation_members SET role='auditor' WHERE organisation=? AND user=?",
    )
    .run(org.id, owner);
  await assert.rejects(
    clients[1].consumeApproval(
      removedApprover.id,
      child.id,
      escalated,
      inputHash,
    ),
    (e) => e.status === 409,
  );
  sqlite
    .prepare(
      "UPDATE organisation_members SET role='owner' WHERE organisation=? AND user=?",
    )
    .run(org.id, owner);
  const revokedApproval = await clients[1].requestApproval(
    child.id,
    escalated,
    inputHash,
  );
  await ok(path + "/approvals/" + revokedApproval.id, {
    decision: "approved",
    reason: "Reviewed exact task",
  });
  await ok(path + "/approvals/" + revokedApproval.id, {
    decision: "revoked",
    reason: "Work cancelled",
  });
  await assert.rejects(
    clients[1].consumeApproval(
      revokedApproval.id,
      child.id,
      escalated,
      inputHash,
    ),
    (e) => e.status === 409,
  );
  console.log(
    "PASS approval queue, auditor denial, input binding, concurrent one-use consumption, approver removal and withdrawal",
  );
  await assert.rejects(
    clients[1]._signed("/api/v1/runtime/authorize", {
      taskId: randomUUID(),
      title: "Bypass attempt",
      action: action.action,
      resource: action.resource,
      inputHash: "a".repeat(64),
    }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    clients[1]._signed("/api/v1/runtime/authorize", {
      taskId: randomUUID(),
      title: "Mismatch attempt",
      action: action.action,
      resource: "other-resource",
      inputHash: "a".repeat(64),
      authority: { grant: child.id, request: action },
    }),
    (e) => e.status === 403,
  );
  const boundInput = { purchaseOrder: "local-fixture" };
  let executed = 0;
  await assert.rejects(
    clients[1].runAuthorizedTask(
      {
        grant: child.id,
        request: escalated,
        input: boundInput,
        taskId: randomUUID(),
        title: "Blocked fixture",
      },
      async () => {
        executed++;
      },
    ),
    (e) => e.status === 403,
  );
  assert.equal(executed, 0);
  const taskApproval = await clients[1].requestApproval(
    child.id,
    escalated,
    sha256(JSON.stringify(boundInput)),
  );
  await ok(path + "/approvals/" + taskApproval.id, {
    decision: "approved",
    reason: "Local callback fixture",
  });
  await clients[1].runAuthorizedTask(
    {
      grant: child.id,
      request: escalated,
      approval: taskApproval.id,
      input: boundInput,
      taskId: randomUUID(),
      title: "Approved fixture",
    },
    async ({ input }) => {
      assert.deepEqual(input, boundInput);
      executed++;
      return { summary: "Local fixture only" };
    },
  );
  assert.equal(executed, 1);
  console.log(
    "PASS SDK gated callback requires exact approved input and executes only after permit consumption",
  );
  const assessment = await ok(path + "/assurance");
  assert.equal(assessment.certified, false);
  assert.equal(assessment.controls.length, 14);
  assert.equal(
    (
      await req(path + "/assurance", {
        control: "testing",
        status: "ready-for-review",
        notes: "Test evidence",
        evidenceUrl: "",
        evidenceHash: "",
      })
    ).status,
    400,
  );
  await ok(path + "/assurance", {
    control: "testing",
    status: "ready-for-review",
    notes: "Local fixture evidence",
    evidenceUrl: "https://example.com/evidence",
    evidenceHash: "a".repeat(64),
  });
  const assessed = await ok(path + "/assurance");
  assert.equal(
    assessed.controls.find((c) => c.id === "testing").status,
    "ready-for-review",
  );
  assert.ok(assessed.receipt);
  console.log(
    "PASS assessment evidence persistence, required references and signed non-certification report",
  );
  const monitored = await ok(path + "/monitoring");
  assert.ok(monitored.events.some((e) => e.kind === "approval-consumed"));
  assert.ok(monitored.summary.length);
  assert.ok(
    monitored.trends.every(
      (t) => t.current.n <= 1 && t.failureRateIncrease === null,
    ),
  );
  assert.equal((await ok(path + "/verification")).status, "declared");
  assert.equal(
    (await req(path + "/verification", { credential: "x".repeat(120) })).status,
    400,
  );
  console.log(
    "PASS observed audit monitoring and rejection of fabricated verification",
  );
  const beforeRevokeTask = randomUUID();
  await clients[1]._signed("/api/v1/runtime/authorize", {
    taskId: beforeRevokeTask,
    title: "Revocation race fixture",
    action: action.action,
    resource: action.resource,
    inputHash: "a".repeat(64),
    authority: { grant: child.id, request: action },
  });
  await ok(path + "/grants/" + root.id, {}, "DELETE");
  await assert.rejects(
    clients[1]._signed(
      "/api/v1/runtime/permits/" + beforeRevokeTask + "/start",
      {},
    ),
    (e) => e.status === 403,
  );
  console.log(
    "PASS server rejects missing/mismatched authority and rechecks revoked chains before task start",
  );
  assert.equal(
    (await clients[1].checkAuthority(child.id, action)).decision,
    "DENY",
  );
  console.log("PASS ancestor revocation invalidates descendant runtime checks");
  {
    const graphKinds = [
      "agents",
      "members",
      "grants",
      "approvals",
      "permits",
      "records",
      "events",
      "attestations",
      "controls",
      "certificates",
      "workloads",
      "connections",
    ];
    const did = await fetch(base + "/.well-known/did.json").then((r) =>
      r.json(),
    );
    const trust = {
      issuer: did.id,
      kid: did.verificationMethod[0].id,
      publicKeyJwk: did.verificationMethod[0].publicKeyJwk,
      organisation: org.id,
    };
    for (const kind of graphKinds) {
      const page = await ok(path + "/graph?kind=" + kind + "&limit=1");
      assert.equal(page.schema, "ftai-trust-graph/1");
      assert.equal(page.nodes.find(n => n.kind === "organisation").label, org.name);
      assert.ok(page.receipt);
      assert.equal(verifyGraphPage(page, trust), true);
      assert.equal(
        verifyGraphPage({ ...page, organisation: randomUUID() }, trust),
        false,
      );
      assert.equal(
        verifyGraphPage(page, { ...trust, now: Date.now() + 360000 }),
        false,
      );
      assert.ok(
        page.edges.every(
          (e) =>
            page.nodes.some((n) => n.id === e.from) &&
            page.nodes.some((n) => n.id === e.to),
        ),
      );
      assert.ok(
        !JSON.stringify(page).includes(owner),
        "Raw member identifier must remain private",
      );
      if (page.next) {
        const next = await ok(
          path +
            "/graph?kind=" +
            kind +
            "&limit=1&after=" +
            encodeURIComponent(page.next),
        );
        assert.notEqual(next.receipt, page.receipt);
      }
    }
    assert.equal(
      (await req(path + "/graph", undefined, "GET", true)).status,
      401,
    );
    assert.equal(
      (await req("organisations/" + randomUUID() + "/graph")).status,
      404,
    );
    const grantGraph = await ok(path + "/graph?kind=grants");
    assert.ok(
      grantGraph.nodes
        .filter((n) => n.kind === "grant" && n.status !== "referenced")
        .every((n) => n.status === "invalid"),
    );
    const owned = clients[0].state.code;
    // Local fixture maintenance only: simulate a passport owned by another account.
    // Production ownership is locked; the API does not expose this operation.
    sqlite
      .prepare("INSERT INTO erasure_authorizations(agent) VALUES(?)")
      .run(owned);
    sqlite
      .prepare("UPDATE agents SET owner=? WHERE code=?")
      .run("other-owner", owned);
    sqlite
      .prepare("DELETE FROM erasure_authorizations WHERE agent=?")
      .run(owned);
    try {
      const records = await ok(path + "/graph?kind=records");
      assert.ok(!records.edges.some((e) => e.from === "agent:" + owned));
      const agentsGraph = await ok(path + "/graph?kind=agents");
      assert.ok(
        !agentsGraph.edges.some(
          (e) => e.from === "agent:" + owned && e.relation === "controls-key",
        ),
      );
    } finally {
      sqlite
        .prepare("INSERT INTO erasure_authorizations(agent) VALUES(?)")
        .run(owned);
      sqlite
        .prepare("UPDATE agents SET owner=? WHERE code=?")
        .run(owner, owned);
      sqlite
        .prepare("DELETE FROM erasure_authorizations WHERE agent=?")
        .run(owned);
    }
    console.log(
      "PASS typed graph collections, pagination, signed evidence, revoked ancestors and tenant isolation",
    );
    const code = clients[0].state.code;
    await clients[0].heartbeat();
    const assessment = await ok(path + "/certifications", {
      agent: code,
      issue: false,
    });
    assert.equal(assessment.eligible, true, JSON.stringify(assessment));
    const issued = await ok(path + "/certifications", {
      agent: code,
      issue: true,
    });
    assert.ok(issued.credential);
    assert.equal(
      (await req(path + "/certifications", { agent: code, issue: true }))
        .status,
      409,
    );
    let certs = await ok(path + "/certifications");
    assert.equal(certs.certificates[0].status, "current");
    sqlite
      .prepare("UPDATE runtime_agents SET last_seen=? WHERE agent=?")
      .run("2020-01-01T00:00:00.000Z", code);
    certs = await ok(path + "/certifications");
    assert.equal(certs.certificates[0].status, "requirements-no-longer-met");
    await clients[0].heartbeat();
    await ok(
      path + "/certifications/" + issued.id,
      { reason: "QA revocation" },
      "DELETE",
    );
    certs = await ok(path + "/certifications");
    assert.equal(certs.certificates[0].status, "revoked");
    await ok(path + "/certifications", { agent: code, issue: true });
    const firstPage = await ok(path + "/certifications?limit=1");
    assert.equal(firstPage.certificates.length, 1);
    assert.ok(firstPage.next);
    const secondPage = await ok(
      path +
        "/certifications?limit=1&after=" +
        encodeURIComponent(firstPage.next),
    );
    assert.equal(secondPage.certificates.length, 1);
    assert.notEqual(
      secondPage.certificates[0].id,
      firstPage.certificates[0].id,
    );
    assert.equal(secondPage.next, null);
    console.log(
      "PASS FTAI assessment, certificate issue, duplicate denial, live requirements and revocation",
    );
  }
  const exported = await ok("privacy/export", { code: clients[0].state.code });
  assert.ok(exported.authorityGrants.length);
  assert.ok(exported.certificates.length);
  await ok("privacy/erase", {
    code: clients[0].state.code,
    confirm: clients[0].state.code,
  });
  assert.equal((await ok(path)).grants.length, 0);
  assert.equal(
    sqlite
      .prepare("SELECT count(*) n FROM agent_certificates WHERE agent=?")
      .get(clients[0].state.code).n,
    0,
  );
  console.log(
    "PASS passport export includes authority and erasure cascades to descendant grants",
  );
} finally {
  if (owner)
    sqlite
      .prepare(
        "UPDATE organisation_members SET role=? WHERE organisation=? AND user=?",
      )
      .run("owner", org.id, owner);
  for (const c of clients) {
    if (c.initialized) await c.close().catch(() => {});
  }
  await ok(path, { confirm: org.id }, "DELETE");
  for (const c of clients)
    if (c.state?.code)
      await req("privacy/erase", { code: c.state.code, confirm: c.state.code });
  sqlite
    .prepare("DELETE FROM enrollment_policies WHERE id=?")
    .run(policy.policy?.id ?? policy.id);
  sqlite.close();
}
assert.equal((await req(path)).status, 404);
console.log("PASS organisation deletion and final access denial");
