import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  buildContext,
  compatibleProvider,
} from "../public/sdk/intelligence.mjs";
const output = await build({
  entryPoints: ["lib/intelligence-engine.ts"],
  bundle: true,
  format: "esm",
  write: false,
});
const { decide, stepSchema, policySchema } = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);
const models = [
  {
    id: "small",
    provider: "test",
    tier: "local",
    quality: 0.98,
    taskTypes: ["classification", "generation"],
    external: false,
    region: "FI",
  },
  {
    id: "private",
    provider: "test",
    tier: "private",
    quality: 0.99,
    taskTypes: ["classification", "generation"],
    external: false,
    region: "FI",
  },
  {
    id: "frontier",
    provider: "test",
    tier: "frontier",
    quality: 0.99,
    taskTypes: ["reasoning", "planning", "classification", "generation"],
    external: true,
    region: "FI",
  },
];
const policy = policySchema.parse({
    mode: "enforce",
    allowedTools: ["crm.lookup"],
    models,
  }),
  base = {
    stepId: "unit",
    intent: "Find invoice",
    action: "sales.read",
    resource: "invoice",
    availableModels: models.map((m) => m.id),
  };
const decideStep = (s, p = policy, c = []) =>
  decide(stepSchema.parse({ ...base, ...s }), p, c);
assert.equal(
  decideStep({
    deterministic: { id: "calc", quality: 1 },
    intent: "Calculate VAT",
  }).recommended_route,
  "deterministic",
);
assert.equal(
  decideStep({ tool: { id: "crm.lookup", quality: 1 } }).recommended_route,
  "tool",
);
assert.equal(
  decideStep({ tool: { id: "forbidden", quality: 1 } }).recommended_route,
  "human",
);
assert.equal(
  decideStep({
    tool: { id: "crm.lookup", quality: 1, requiresInterpretation: true },
  }).recommended_route,
  "human",
);
assert.equal(
  decideStep({
    context: [
      {
        id: "answer",
        kind: "episodic",
        bytes: 50,
        relevant: true,
        sensitive: false,
        validated: true,
        answer: true,
      },
    ],
  }).reason_codes[0],
  "MEMORY_MATCH",
);
assert.equal(
  decideStep({
    context: [
      {
        id: "answer",
        kind: "episodic",
        bytes: 50,
        relevant: true,
        sensitive: false,
        validated: false,
        answer: true,
      },
    ],
  }).recommended_route,
  "human",
);
assert.equal(
  decideStep({ intent: "Draft outreach", localConfidence: 0.98 })
    .recommended_route,
  "local",
);
assert.equal(
  decideStep({ intent: "Draft outreach", localConfidence: 0.7 })
    .recommended_route,
  "private",
);
assert.equal(
  decideStep({ intent: "Draft outreach", localConfidence: null })
    .recommended_route,
  "private",
);
assert.equal(
  decideStep({ intent: "Novel strategic planning", complex: true, novel: true })
    .recommended_route,
  "frontier",
);
assert.equal(
  decideStep(
    { intent: "Novel strategic planning", complex: true },
    policySchema.parse({ ...policy, localOnly: true }),
  ).recommended_route,
  "human",
);
assert.equal(
  decideStep({
    intent: "Novel strategic planning",
    dataClassification: "personal",
  }).recommended_route,
  "human",
);
assert.equal(
  decideStep(
    { intent: "Novel strategic planning" },
    policySchema.parse({ ...policy, regions: ["DE"] }),
  ).recommended_route,
  "human",
);
assert.equal(
  decideStep(
    { intent: "Novel strategic planning" },
    policySchema.parse({ ...policy, allowedRoutes: ["tool", "local"] }),
  ).recommended_route,
  "human",
);
assert.equal(
  decideStep({
    intent: "Draft outreach",
    action: "production.delete",
    deterministic: { id: "delete", quality: 1 },
  }).recommended_route,
  "human",
);
assert.equal(
  decideStep({ intent: "Draft outreach", risk: "high" }).recommended_route,
  "human",
);
assert.equal(
  decideStep({ intent: "Draft outreach", disagreement: true })
    .recommended_route,
  "human",
);
assert.equal(
  decideStep({ intent: "Draft outreach", costBudget: 0 }).recommended_route,
  "human",
);
assert.equal(
  decideStep({ intent: "Draft outreach", availableModels: [] })
    .recommended_route,
  "human",
);
const cap = {
  id: "lead",
  version: 3,
  taskTypes: ["classification"],
  aliases: ["qualify prospect"],
  quality: 0.98,
  permissions: ["sales.read"],
  risk: "low",
  status: "validated",
  method: "lead",
};
assert.equal(
  decideStep(
    { intent: "Qualify prospect Acme", taskType: "classification" },
    policy,
    [cap],
  ).recommended_route,
  "capability",
);
assert.equal(
  decideStep(
    {
      intent: "Qualify prospect Acme",
      taskType: "classification",
      localConfidence: 0.98,
    },
    policy,
    [{ ...cap, status: "candidate" }],
  ).recommended_route,
  "local",
);
assert.equal(
  decideStep(
    {
      intent: "Qualify prospect Acme",
      taskType: "classification",
      localConfidence: 0.98,
    },
    policy,
    [{ ...cap, permissions: ["other"] }],
  ).recommended_route,
  "local",
);
assert.equal(
  decideStep({
    intent: "Draft outreach",
    localConfidence: 0.98,
    excludedRoutes: ["local"],
  }).recommended_route,
  "private",
);
const ctx = {
  account: {
    value: {
      name: "Acme",
      email: "person@example.com",
      apiKey: "hidden",
      count: 4,
    },
    relevant: true,
  },
  secret: { value: "hidden", sensitive: true },
  irrelevant: { value: "never send" },
};
assert.deepEqual(buildContext(ctx, ["account", "secret"], true), {
  account: { name: "Acme", email: "[email redacted]", count: 4 },
});
assert.equal(buildContext(ctx, ["secret"], false).secret, "hidden");
assert.throws(() =>
  compatibleProvider({ baseUrl: "http://remote.invalid/v1", model: "m" }),
);
assert.throws(() =>
  compatibleProvider({
    baseUrl: "https://user:pass@example.com/v1",
    model: "m",
  }),
);
assert.notEqual(
  decideStep(
    { intent: "Qualify prospect Acme", taskType: "classification" },
    policy,
    [cap, { ...cap, id: "other" }],
  ).recommended_route,
  "capability",
);
assert.notEqual(
  decideStep(
    { intent: "Qualify prospect Acme", taskType: "classification" },
    policy,
    [{ ...cap, aliases: ["a"] }],
  ).recommended_route,
  "capability",
);
console.log(
  "PASS intelligence engine: 29 checks covering deterministic/tool/context/capability routing, confidence escalation, privacy, residency, budgets, missing providers, high-impact oversight, semantic aliases and minimized context.",
);
