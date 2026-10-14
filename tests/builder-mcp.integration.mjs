import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FTAIClient } from "../public/sdk/ftai.mjs";
import { IntelligenceControl } from "../public/sdk/intelligence.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const base = "http://localhost:5173";
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
    redirect: "manual",
  }),
  cookie = login.headers.get("set-cookie").split(";")[0];
async function rpc(method, params = {}, headers = {}) {
  return fetch(base + "/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}
async function api(path, body) {
  const r = await fetch(base + "/api/v1/" + path, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  return d;
}
assert.equal((await rpc("tools/list")).status, 200);
for (const name of [
  "ftai_organisations",
  "ftai_create_organisation",
  "ftai_issue_certificate",
  "ftai_intelligence_metrics",
  "ftai_set_intelligence_policy",
])
  assert.equal((await rpc("tools/call", { name, arguments: {} })).status, 401);
assert.equal(
  (
    await rpc(
      "tools/call",
      { name: "ftai_create_organisation", arguments: {} },
      { Cookie: cookie, Origin: "https://evil.invalid" },
    )
  ).status,
  403,
);
const client = new Client(
  { name: "ftai-builder-conformance", version: "3.0.1" },
  { capabilities: {} },
);
const dir = await mkdtemp(join(tmpdir(), "ftai-mcp-"));
const folder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const sqlite = new DatabaseSync(
  join(
    folder,
    (await readdir(folder)).find((f) => /^[a-f0-9]+\.sqlite$/.test(f)),
  ),
);
sqlite.exec("PRAGMA foreign_keys=ON");
let org, policy, runtime, owner;
async function tool(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  assert.equal(r.isError, false);
  return r.structuredContent;
}
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
      requestInit: { headers: { Cookie: cookie } },
    }),
  );
  const list = await client.listTools();
  assert.equal(client.getServerVersion().version, "3.0.1");
  assert.equal(list.tools.length, 21);
  for (const t of list.tools)
    assert.equal(
      t.annotations.readOnlyHint,
      ![
        "ftai_create_organisation",
        "ftai_assign_agent",
        "ftai_issue_certificate",
        "ftai_revoke_certificate",
        "ftai_set_intelligence_policy",
        "ftai_register_intelligence_capability",
        "ftai_review_intelligence_capability",
      ].includes(t.name),
    );
  const setup = await tool("ftai_builder_setup");
  assert.equal(setup.privateByDefault, true);
  assert.ok(setup.nextStep);
  assert.ok(setup.llmGuide.endsWith("/llm-start.md"));
  assert.equal(setup.pluginVersion, "3.0.1");
  assert.equal(setup.availableTools.length, 21);
  assert.ok(
    setup.intelligenceControl.workflow.includes("ftai_intelligence_metrics"),
  );
  const requestId = randomUUID(),
    name = "MCP QA " + randomUUID();
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () =>
      tool("ftai_create_organisation", { name, requestId }),
    ),
  );
  org = concurrent[0];
  assert.equal(concurrent.filter((r) => r.created).length, 1);
  assert.ok(concurrent.every((r) => r.id === requestId));
  assert.equal(
    (await tool("ftai_create_organisation", { name, requestId })).created,
    false,
  );
  await assert.rejects(
    tool("ftai_create_organisation", { name: "Different", requestId }),
  );
  assert.ok(
    (await tool("ftai_organisations")).organisations.some(
      (o) => o.id === org.id,
    ),
  );
  const intelligenceOrg = { organisation: org.id };
  const initial = await tool("ftai_intelligence_policy", intelligenceOrg);
  assert.equal(initial.current.version, 0);
  assert.deepEqual(initial.history.policies, []);
  const configured = await tool("ftai_set_intelligence_policy", {
    ...intelligenceOrg,
    expectedVersion: 0,
    document: { mode: "shadow", minimumQuality: 0.95, regions: ["FI"] },
  });
  assert.equal(configured.version, 1);
  await assert.rejects(
    tool("ftai_set_intelligence_policy", {
      ...intelligenceOrg,
      expectedVersion: 0,
      document: configured.document,
    }),
  );
  await assert.rejects(
    tool("ftai_set_intelligence_policy", {
      ...intelligenceOrg,
      expectedVersion: 1,
      document: { ...configured.document, apiKey: "must-never-be-accepted" },
    }),
  );
  await assert.rejects(
    tool("ftai_set_intelligence_policy", {
      ...intelligenceOrg,
      expectedVersion: 1,
      document: {
        ...configured.document,
        models: [
          {
            id: "invalid-local",
            provider: "fixture",
            tier: "local",
            quality: 1,
            taskTypes: ["classification"],
            region: "FI",
            external: true,
          },
        ],
      },
    }),
  );
  const capability = {
    id: "qa.sum",
    description: "Local integration fixture: integer sum",
    taskTypes: ["calculation"],
    aliases: ["sum fixture"],
    quality: 1,
    permissions: ["qa.task"],
    risk: "low",
    method: "qa.sum",
    inputSchema: { type: "array", items: { type: "integer" } },
    outputSchema: { type: "integer" },
    source: "Local MCP integration fixture",
    expectedVersion: 0,
  };
  await tool("ftai_register_intelligence_capability", {
    ...intelligenceOrg,
    capability,
  });
  assert.equal(
    (await tool("ftai_intelligence_capabilities", intelligenceOrg))
      .capabilities[0].status,
    "candidate",
  );
  const review = {
    id: capability.id,
    version: 1,
    status: "validated",
    notes: "Local fixture evaluation; not a production attestation.",
  };
  await assert.rejects(
    tool("ftai_review_intelligence_capability", { ...intelligenceOrg, review }),
  );
  const dataset = [
    [[1, 2], 3],
    [[-1, 4], 3],
    [[0, 0], 0],
  ];
  for (const [input, expected] of dataset)
    assert.equal(
      input.reduce((sum, n) => sum + n, 0),
      expected,
    );
  await tool("ftai_review_intelligence_capability", {
    ...intelligenceOrg,
    review: {
      ...review,
      datasetHash: createHash("sha256")
        .update(JSON.stringify(dataset))
        .digest("hex"),
      samples: dataset.length,
      score: 1,
      safetyPassed: true,
    },
  });
  const history = await tool("ftai_intelligence_capabilities", {
    ...intelligenceOrg,
    id: capability.id,
  });
  assert.equal(history.versions[0].status, "validated");
  assert.equal(history.versions[0].evidence.reviews.length, 1);
  const second = await tool("ftai_register_intelligence_capability", {
    ...intelligenceOrg,
    capability: { ...capability, expectedVersion: 1 },
  });
  assert.equal(second.version, 2);
  assert.equal(second.status, "candidate");
  await tool("ftai_review_intelligence_capability", {
    ...intelligenceOrg,
    review: {
      id: capability.id,
      version: 1,
      status: "withdrawn",
      notes: "Withdraw local fixture after evaluation test.",
    },
  });
  const revisions = await tool("ftai_intelligence_capabilities", {
    ...intelligenceOrg,
    id: capability.id,
  });
  assert.equal(revisions.versions[1].status, "withdrawn");
  assert.equal(revisions.versions[1].evidence.reviews.length, 2);
  // Restore old policy contents as a new immutable version.
  const policyHistory = await tool("ftai_intelligence_policy", intelligenceOrg);
  const restored = await tool("ftai_set_intelligence_policy", {
    ...intelligenceOrg,
    expectedVersion: policyHistory.current.version,
    document: JSON.parse(policyHistory.history.policies[0].document),
  });
  assert.equal(restored.version, 2);
  const metrics = await tool("ftai_intelligence_metrics", intelligenceOrg);
  assert.equal(metrics.steps, 0);
  assert.equal(metrics.cost, null);
  assert.deepEqual(
    (await tool("ftai_intelligence_candidates", intelligenceOrg)).patterns,
    [],
  );
  assert.deepEqual(
    (
      await tool("ftai_intelligence_executions", {
        ...intelligenceOrg,
        limit: 1,
      })
    ).items,
    [],
  );
  await assert.rejects(
    tool("ftai_intelligence_trace", {
      ...intelligenceOrg,
      executionId: randomUUID(),
    }),
  );
  for (const t of list.tools.filter((t) => t.name.includes("intelligence"))) {
    const args =
      t.name === "ftai_set_intelligence_policy"
        ? { expectedVersion: 2, document: restored.document }
        : t.name === "ftai_register_intelligence_capability"
          ? { capability }
          : t.name === "ftai_review_intelligence_capability"
            ? { review }
            : t.name === "ftai_intelligence_trace"
              ? { executionId: randomUUID() }
              : {};
    await assert.rejects(tool(t.name, { ...args, organisation: randomUUID() }));
    await assert.rejects(
      tool(t.name, { ...args, ...intelligenceOrg, unexpected: true }),
    );
  }
  policy = await api("enrollment-policies", {
    label: "MCP QA",
    organization: "QA",
    allowed: ["qa.task"],
    denied: [],
    maxAgents: 1,
    status: "active",
  });
  runtime = new FTAIClient({
    baseUrl: base,
    enrollmentKey: policy.key,
    externalId: randomUUID(),
    name: "MCP QA runtime",
    role: "QA",
    statePath: join(dir, "identity.json"),
  });
  await runtime.init();
  const code = runtime.state.code;
  const agents = await tool("ftai_my_agents", {
    after: code.slice(0, -1),
    limit: 100,
  });
  assert.ok(agents.agents.some((a) => a.code === code));
  await assert.rejects(
    tool("ftai_assign_agent", {
      organisation: randomUUID(),
      agent: code,
      classification: "A3",
      team: "QA",
    }),
  );
  await tool("ftai_assign_agent", {
    organisation: org.id,
    agent: code,
    classification: "A3",
    team: "QA",
  });
  // Produce real signed executions; MCP reads exactly their tenant-scoped traces.
  const grant = await api("organisations/" + org.id + "/grants", {
    subject: code,
    parent: null,
    constraints: {
      actions: ["qa.task"],
      resources: ["fixture"],
      countries: ["FI"],
      currency: "EUR",
      maxAmountMinor: 0,
      approvalAboveMinor: 0,
      mayDelegate: false,
    },
    expires: new Date(Date.now() + 3600000).toISOString(),
  });
  const intelligence = new IntelligenceControl({
    client: runtime,
    outboxPath: join(dir, "traces"),
    handlers: {
      "qa.sum": async ({ context }) => ({
        value: context.numbers.reduce((sum, n) => sum + n, 0),
        cost: 0,
      }),
    },
  });
  const executions = [];
  for (let i = 0; i < 2; i++)
    executions.push(
      await intelligence.run(
        {
          step: {
            stepId: "sum-" + i,
            intent: "Calculate fixture sum",
            action: "qa.task",
            resource: "fixture",
            deterministic: { id: "qa.sum", quality: 1 },
          },
          context: { numbers: { value: [1, 2], relevant: true } },
          actualRoute: "deterministic",
          actualHandler: "qa.sum",
          grant: grant.id,
          request: {
            action: "qa.task",
            resource: "fixture",
            country: "FI",
            currency: "EUR",
            amountMinor: 0,
          },
        },
        {
          validate: async (value) => ({
            valid: value === 3,
            score: value === 3 ? 1 : 0,
          }),
        },
      ),
    );
  const trace = await tool("ftai_intelligence_trace", {
    ...intelligenceOrg,
    executionId: executions[0].executionId,
  });
  assert.equal(trace.state, "succeeded");
  assert.equal(trace.agent, code);
  assert.equal(trace.report.cost, 0);
  assert.equal(trace.report.outputHash, executions[0].report.outputHash);
  const tracePage = await tool("ftai_intelligence_executions", {
    ...intelligenceOrg,
    limit: 1,
  });
  assert.ok(tracePage.next);
  const olderTrace = await tool("ftai_intelligence_executions", {
    ...intelligenceOrg,
    limit: 1,
    after: tracePage.next,
  });
  assert.notEqual(tracePage.items[0].id, olderTrace.items[0].id);
  const actualMetrics = await tool(
    "ftai_intelligence_metrics",
    intelligenceOrg,
  );
  assert.equal(actualMetrics.completed, 2);
  assert.equal(actualMetrics.noLLMPercent, 100);
  assert.equal(actualMetrics.cost, 0);
  owner = sqlite
    .prepare("SELECT owner FROM organisations WHERE id=?")
    .get(org.id).owner;
  sqlite
    .prepare(
      "UPDATE organisation_members SET role='auditor' WHERE organisation=? AND user=?",
    )
    .run(org.id, owner);
  assert.equal(
    (await tool("ftai_assess_identity", { organisation: org.id, agent: code }))
      .eligible,
    true,
  );
  await assert.rejects(
    tool("ftai_assign_agent", {
      organisation: org.id,
      agent: code,
      classification: "A3",
      team: "QA",
    }),
  );
  await assert.rejects(
    tool("ftai_issue_certificate", { organisation: org.id, agent: code }),
  );
  await tool("ftai_intelligence_metrics", intelligenceOrg);
  await tool("ftai_intelligence_policy", intelligenceOrg);
  await assert.rejects(
    tool("ftai_set_intelligence_policy", {
      ...intelligenceOrg,
      expectedVersion: 2,
      document: restored.document,
    }),
  );
  await assert.rejects(
    tool("ftai_register_intelligence_capability", {
      ...intelligenceOrg,
      capability: { ...capability, expectedVersion: 2 },
    }),
  );
  await assert.rejects(
    tool("ftai_review_intelligence_capability", {
      ...intelligenceOrg,
      review: {
        id: capability.id,
        version: 2,
        status: "withdrawn",
        notes: "Auditor cannot withdraw capabilities.",
      },
    }),
  );
  sqlite
    .prepare(
      "UPDATE organisation_members SET role='owner' WHERE organisation=? AND user=?",
    )
    .run(org.id, owner);
  const cert = await tool("ftai_issue_certificate", {
    organisation: org.id,
    agent: code,
  });
  const certificates = await tool("ftai_certificates", {
    organisation: org.id,
  });
  assert.equal(certificates.certificates.length, 1);
  assert.equal(certificates.certificates[0].status, "current");
  await assert.rejects(
    tool("ftai_issue_certificate", { organisation: org.id, agent: code }),
  );
  const id = certificates.certificates[0].id;
  assert.ok(cert);
  await tool("ftai_revoke_certificate", {
    organisation: org.id,
    certificate: id,
    reason: "Integration test complete",
  });
  assert.equal(
    (await tool("ftai_certificates", { organisation: org.id })).certificates[0]
      .status,
    "revoked",
  );
  await assert.rejects(
    tool("ftai_certificates", { organisation: randomUUID() }),
  );
  await assert.rejects(
    tool("ftai_issue_certificate", {
      organisation: org.id,
      agent: code,
      issue: false,
    }),
  );
  const page = await tool("ftai_my_agents", { limit: 1 });
  assert.equal(page.agents.length, 1);
  if (page.next)
    assert.notEqual(
      (await tool("ftai_my_agents", { limit: 1, after: page.next })).agents[0]
        ?.code,
      page.agents[0].code,
    );
  console.log(
    "PASS official MCP client: 21 tools, versioned discovery, authenticated setup, identity/certificate lifecycle, Intelligence Control policy revisions/restoration, evaluated capability promotion/withdrawal/history, unknown metrics, tenant isolation, strict arguments and auditor write denial",
  );
} finally {
  await client.close();
  if (runtime) {
    await runtime.close().catch(() => {});
    if (runtime.state?.code)
      await api("privacy/erase", {
        code: runtime.state.code,
        confirm: runtime.state.code,
      });
  }
  if (org) sqlite.prepare("DELETE FROM organisations WHERE id=?").run(org.id);
  if (policy)
    sqlite
      .prepare("DELETE FROM enrollment_policies WHERE id=?")
      .run(policy.policy?.id ?? policy.id);
  sqlite.close();
  await rm(dir, { recursive: true, force: true });
}
