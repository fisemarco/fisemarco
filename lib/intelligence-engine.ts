import { z } from "zod";
export const routes = [
  "deterministic",
  "context",
  "tool",
  "capability",
  "local",
  "private",
  "cloud",
  "frontier",
  "human",
] as const;
export const taskTypes = [
  "lookup",
  "calculation",
  "extraction",
  "classification",
  "transformation",
  "summarization",
  "generation",
  "reasoning",
  "planning",
  "decision",
  "tool_action",
  "workflow_transition",
  "validation",
  "unknown",
] as const;
const name = z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/);
const quality = z.number().min(0).max(1);
export const modelSchema = z
  .object({
    id: name,
    provider: name,
    tier: z.enum(["local", "private", "cloud", "frontier"]),
    quality,
    supportsComplex: z.boolean().default(false),
    taskTypes: z.array(z.enum(taskTypes)).min(1).max(14),
    region: z.string().regex(/^[A-Z]{2}$/),
    external: z.boolean(),
    estimatedCost: z.number().nonnegative().max(100).nullable().default(null),
    estimatedLatencyMs: z
      .number()
      .int()
      .nonnegative()
      .max(3600000)
      .nullable()
      .default(null),
  })
  .strict()
  .refine(
    (m) => m.tier !== "local" || !m.external,
    "Local models cannot be external.",
  )
  .refine(
    (m) => !["cloud", "frontier"].includes(m.tier) || m.external,
    "Cloud and frontier models must report external transfer.",
  );
export const policySchema = z
  .object({
    mode: z.enum(["observe", "shadow", "enforce"]).default("shadow"),
    allowedRoutes: z
      .array(z.enum(routes))
      .min(1)
      .max(9)
      .default([...routes]),
    allowedTools: z.array(name).max(100).default([]),
    models: z.array(modelSchema).max(30).default([]),
    localOnly: z.boolean().default(false),
    sensitiveLocalOnly: z.boolean().default(true),
    regions: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(30)
      .default([]),
    minimumQuality: quality.default(0.95),
    humanActions: z
      .array(name)
      .max(100)
      .default([
        "finance.transfer",
        "employment.terminate",
        "production.delete",
      ]),
    baselineCostPerStep: z
      .number()
      .nonnegative()
      .max(100)
      .nullable()
      .default(null),
    baselineModel: name.nullable().default(null),
  })
  .strict()
  .refine(
    (p) => new Set(p.models.map((m) => m.id)).size === p.models.length,
    "Model IDs must be unique.",
  );
export type IntelligencePolicy = z.infer<typeof policySchema>;
export const stepSchema = z
  .object({
    intent: z.string().trim().min(1).max(500),
    taskType: z.enum(taskTypes).optional(),
    stepId: name,
    action: name,
    resource: z.string().min(1).max(120),
    requiredQuality: quality.default(0.95),
    risk: z.enum(["low", "medium", "high"]).default("low"),
    dataClassification: z
      .enum(["public", "internal", "personal", "restricted"])
      .default("internal"),
    latencyTargetMs: z.number().int().min(1).max(3600000).default(30000),
    costBudget: z.number().nonnegative().max(100).nullable().default(null),
    novel: z.boolean().default(false),
    complex: z.boolean().default(false),
    disagreement: z.boolean().default(false),
    deterministic: z.object({ id: name, quality }).strict().optional(),
    context: z
      .array(
        z
          .object({
            id: name,
            kind: z.enum([
              "current",
              "episodic",
              "semantic",
              "workflow",
              "business",
              "retrieved",
              "tool_output",
              "previous_execution",
            ]),
            bytes: z.number().int().nonnegative().max(10000000),
            relevant: z.boolean(),
            sensitive: z.boolean(),
            validated: z.boolean(),
            answer: z.boolean().default(false),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    tool: z
      .object({
        id: name,
        quality,
        purpose: z.string().max(500).default(""),
        inputSchema: z.record(z.unknown()).default({}),
        outputSchema: z.record(z.unknown()).default({}),
        risk: z.enum(["low", "medium", "high"]).default("low"),
        cost: z.number().nonnegative().max(100).nullable().default(null),
        requiresInterpretation: z.boolean().default(false),
      })
      .strict()
      .optional(),
    capability: name.optional(),
    availableModels: z.array(name).max(30).default([]),
    localConfidence: quality.nullable().default(null),
    excludedRoutes: z.array(z.enum(routes)).max(9).default([]),
  })
  .strict();
export type Step = z.infer<typeof stepSchema>;
export type Capability = {
  id: string;
  version: number;
  description: string;
  taskTypes: (typeof taskTypes)[number][];
  aliases: string[];
  quality: number;
  permissions: string[];
  risk: "low" | "medium" | "high";
  status: string;
  method: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  source: string;
};
export function classify(intent: string): (typeof taskTypes)[number] {
  const patterns: [(typeof taskTypes)[number], RegExp][] = [
    ["calculation", /\b(calculate|sum|vat|multiply|divide)\b/i],
    ["planning", /\b(plan|strategy|strategic)\b/i],
    ["reasoning", /\b(analy[sz]e|unusual|objection|reason|negotiate)\b/i],
    ["generation", /\b(draft|write|generate|outreach)\b/i],
    ["classification", /\b(classify|score|categorize|qualify)\b/i],
    ["extraction", /\b(extract|parse)\b/i],
    ["summarization", /\b(summarize|summary)\b/i],
    ["validation", /\b(validate|verify)\b/i],
    ["transformation", /\b(transform|convert|format)\b/i],
    ["workflow_transition", /\b(transition|advance)\b/i],
    ["tool_action", /\b(schedule|send|book|update)\b/i],
    ["decision", /\b(decide|should)\b/i],
    ["lookup", /\b(find|lookup|status|check|retrieve|relationship)\b/i],
  ];
  return patterns.find(([, p]) => p.test(intent))?.[0] ?? "unknown";
}
export function decide(
  step: Step,
  policy: IntelligencePolicy,
  capabilities: Capability[] = [],
) {
  const type = step.taskType ?? classify(step.intent),
    q = Math.max(step.requiredQuality, policy.minimumQuality);
  const localOnly =
    policy.localOnly ||
    (policy.sensitiveLocalOnly &&
      ["personal", "restricted"].includes(step.dataClassification));
  const allowed = (r: (typeof routes)[number]) =>
    policy.allowedRoutes.includes(r) && !step.excludedRoutes.includes(r);
  const high =
    step.risk === "high" ||
    step.tool?.risk === "high" ||
    step.disagreement ||
    policy.humanActions.includes(step.action) ||
    /\b(transfer|terminate|delete)\b/i.test(step.action.replaceAll(".", " "));
  const total = step.context.reduce((s, c) => s + c.bytes, 0),
    relevant = step.context.filter((c) => c.relevant),
    answer = relevant.find((c) => c.validated && c.answer);
  const base = {
    task_type: type,
    required_quality: q,
    risk: high ? "high" : step.risk,
    data_classification: step.dataClassification,
    context_sufficiency: answer ? 1 : 0,
    memory_match:
      answer &&
      ["episodic", "semantic", "workflow", "previous_execution"].includes(
        answer.kind,
      )
        ? 1
        : 0,
    tool_match: step.tool && policy.allowedTools.includes(step.tool.id) ? 1 : 0,
    capability_match: 0,
    local_model_confidence: step.localConfidence,
    latency_target_ms: step.latencyTargetMs,
    cost_budget: step.costBudget,
    policy_constraints: [
      ...(localOnly ? ["LOCAL_ONLY"] : []),
      ...(policy.regions.length ? ["REGION_RESTRICTION"] : []),
    ],
    context_bytes_total: total,
    context_ids: relevant.filter((c) => !c.sensitive).map((c) => c.id),
    context_bytes_external: relevant
      .filter((c) => !c.sensitive)
      .reduce((s, c) => s + c.bytes, 0),
  };
  const finish = (
    route: (typeof routes)[number],
    reason_codes: string[],
    extra: Record<string, unknown> = {},
  ) => ({
    ...base,
    recommended_route: route,
    recommended_tier: routes.indexOf(route),
    reason_codes,
    requires_external_llm: false,
    model: null as string | null,
    provider: null as string | null,
    tool: null as string | null,
    capability: null as string | null,
    capability_version: null as number | null,
    handler: null as string | null,
    confidence: null as number | null,
    latency_target_met: null as boolean | null,
    ...extra,
  });
  if (high)
    return finish("human", [
      "HUMAN_REQUIRED",
      ...(step.disagreement ? ["MODEL_DISAGREEMENT"] : []),
    ]);
  if (
    allowed("deterministic") &&
    step.deterministic &&
    step.deterministic.quality >= q
  )
    return finish("deterministic", ["DETERMINISTIC_MATCH"], {
      handler: step.deterministic.id,
    });
  if (
    allowed("context") &&
    answer &&
    ["lookup", "validation", "workflow_transition"].includes(type)
  )
    return finish(
      "context",
      [base.memory_match ? "MEMORY_MATCH" : "CONTEXT_SUFFICIENT"],
      { handler: answer.id },
    );
  if (
    allowed("tool") &&
    step.tool &&
    policy.allowedTools.includes(step.tool.id) &&
    !step.tool.requiresInterpretation &&
    step.tool.quality >= q
  )
    return finish("tool", ["TOOL_MATCH"], {
      tool: step.tool.id,
      handler: step.tool.id,
    });
  const words = new Set(
    step.intent
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2),
  );
  const matches = capabilities.filter(
    (c) =>
      c.status === "validated" &&
      c.taskTypes.includes(type) &&
      c.quality >= q &&
      c.permissions.includes(step.action) &&
      c.risk !== "high" &&
      (step.capability
        ? c.id === step.capability
        : c.aliases.some((a) => {
            const tokens = a
              .toLowerCase()
              .split(/\W+/)
              .filter((w) => w.length > 2);
            return tokens.length > 0 && tokens.every((w) => words.has(w));
          })),
  );
  const capability = matches.length === 1 ? matches[0] : undefined;
  if (allowed("capability") && capability)
    return finish("capability", ["CAPABILITY_MATCH"], {
      capability: capability.id,
      capability_version: capability.version,
      handler: capability.method,
      capability_match: 1,
    });
  const complex =
    step.complex ||
    step.novel ||
    ["reasoning", "planning", "unknown"].includes(type);
  const models = policy.models.filter(
    (m) =>
      allowed(m.tier) &&
      step.availableModels.includes(m.id) &&
      m.taskTypes.includes(type) &&
      m.quality >= q &&
      (!localOnly || !m.external) &&
      (!policy.regions.length || policy.regions.includes(m.region)) &&
      (!complex || m.tier === "frontier" || m.supportsComplex) &&
      (m.tier !== "local" ||
        (step.localConfidence !== null && step.localConfidence >= q)) &&
      (step.costBudget === null ||
        (m.estimatedCost !== null && m.estimatedCost <= step.costBudget)),
  );
  models.sort(
    (a, b) =>
      routes.indexOf(a.tier) - routes.indexOf(b.tier) ||
      (a.estimatedLatencyMs ?? Infinity) - (b.estimatedLatencyMs ?? Infinity) ||
      (a.estimatedCost ?? Infinity) - (b.estimatedCost ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
  const model = models[0];
  if (model)
    return finish(
      model.tier,
      [
        ...(complex ? ["COMPLEX_REASONING_REQUIRED"] : []),
        ...(step.novel ? ["NOVEL_TASK"] : []),
        ...(model.tier === "local" ? ["LOCAL_CONFIDENCE_HIGH"] : []),
        ...(localOnly ? ["POLICY_FORCED_LOCAL"] : []),
        "APPROVED_MODEL",
      ],
      {
        model: model.id,
        provider: model.provider,
        handler: model.id,
        requires_external_llm: model.external,
        confidence: model.tier === "local" ? step.localConfidence : null,
        latency_target_met:
          model.estimatedLatencyMs === null
            ? null
            : model.estimatedLatencyMs <= step.latencyTargetMs,
      },
    );
  return finish("human", [
    "HUMAN_REQUIRED",
    "NO_SUFFICIENT_APPROVED_ROUTE",
    ...(localOnly ? ["POLICY_FORCED_LOCAL"] : []),
    "CONTEXT_INSUFFICIENT",
  ]);
}
export type Decision = ReturnType<typeof decide>;
