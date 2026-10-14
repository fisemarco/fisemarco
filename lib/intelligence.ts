import { z } from "zod";
import { auth, db, parse, HttpError } from "./server";
import { digest } from "./crypto";
import { runtimeAuth } from "./runtime";
import { member, chainFor, liveChainIssue } from "./enterprise-core";
import { evaluateAuthority } from "./authority";
import { taskAuthoritySchema } from "./governance";
import { descendingCursor, descendingPage } from "./pagination";
import {
  decide,
  classify,
  policySchema,
  stepSchema,
  routes,
  taskTypes,
  type Capability,
  type Decision,
} from "./intelligence-engine";
const now = () => new Date().toISOString(),
  uuid = z.string().uuid(),
  hash = z.string().regex(/^[a-f0-9]{64}$/);
type Execution = {
  id: string;
  organisation: string;
  agent: string;
  parent: string | null;
  step_id: string;
  pattern: string;
  input_hash: string;
  policy_version: number;
  mode: string;
  decision: string;
  route: (typeof routes)[number];
  state: string;
  report: string | null;
  created: string;
  expires: string;
  completed: string | null;
};
async function policy(org: string) {
  const row = await db()
    .prepare(
      "SELECT version,document FROM intelligence_policies WHERE organisation=? ORDER BY version DESC LIMIT 1",
    )
    .bind(org)
    .first<{ version: number; document: string }>();
  return {
    version: row?.version ?? 0,
    document: row
      ? policySchema.parse(JSON.parse(row.document))
      : policySchema.parse({}),
  };
}
async function capabilities(org: string, active = true): Promise<Capability[]> {
  const rows = (
    await db()
      .prepare(
        `SELECT document,status,evidence FROM intelligence_capabilities c WHERE organisation=? AND version=(SELECT MAX(version) FROM intelligence_capabilities n WHERE n.organisation=c.organisation AND n.id=c.id ${active ? "AND (n.status='validated' OR (n.status='withdrawn' AND EXISTS(SELECT 1 FROM json_each(n.evidence,'$.reviews') r WHERE json_extract(r.value,'$.status')='validated')))" : ""}) ORDER BY id LIMIT 100`,
      )
      .bind(org)
      .all<{ document: string; status: string; evidence: string }>()
  ).results;
  return rows.map((r) => {
    const document = JSON.parse(r.document),
      evidence = JSON.parse(r.evidence),
      reviews = evidence.reviews ?? [],
      score = reviews.at(-1)?.score ?? document.quality;
    return {
      ...document,
      quality:
        r.status === "validated"
          ? Math.min(document.quality, score)
          : document.quality,
      status: r.status,
      evidence,
    };
  });
}
function view(r: Execution) {
  return {
    ...r,
    decision: JSON.parse(r.decision),
    report: r.report ? JSON.parse(r.report) : null,
    state:
      ["resolved", "running"].includes(r.state) && r.expires <= now()
        ? "expired"
        : r.state,
  };
}
export async function intelligence(req: Request, path: string[]) {
  const method = req.method,
    action = path[1];
  if (
    ["resolve", "execute", "evaluate", "abandon", "check"].includes(action) &&
    method === "POST"
  ) {
    const ctx = await runtimeAuth(req),
      assigned = await db()
        .prepare("SELECT organisation FROM organisation_agents WHERE agent=?")
        .bind(ctx.row.code)
        .first<{ organisation: string }>();
    // A pause stops work, but must not suppress its authenticated final trace.
    // runtimeAuth still rejects revoked keys; every trace is agent/tenant scoped.
    const reporting = action === "evaluate" || action === "abandon";
    if (
      !assigned ||
      (!reporting &&
        (ctx.row.status !== "active" || ctx.policy.status !== "active"))
    )
      throw new HttpError(403, "An active organisation runtime is required.");
    const org = assigned.organisation,
      p = await policy(org);
    if (action === "resolve") {
      const input = z
        .object({
          executionId: uuid,
          parentExecutionId: uuid.nullable().default(null),
          inputHash: hash,
          pattern: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/),
          step: stepSchema,
          actualRoute: z.enum(routes).optional(),
          actualModel: z.string().max(100).optional(),
          actualHandler: z.string().max(100).optional(),
        })
        .strict()
        .parse(ctx.input);
      const profile = JSON.parse(ctx.row.profile);
      if (
        !ctx.policy.allowed ||
        !JSON.parse(ctx.policy.allowed).includes(input.step.action) ||
        JSON.parse(ctx.policy.denied).includes(input.step.action) ||
        !profile.allowed.includes(input.step.action) ||
        profile.denied.includes(input.step.action)
      )
        throw new HttpError(
          403,
          "The runtime policy does not permit this action.",
        );
      if (
        input.parentExecutionId &&
        !(await db()
          .prepare(
            "SELECT id FROM intelligence_executions WHERE id=? AND organisation=? AND agent=?",
          )
          .bind(input.parentExecutionId, org, ctx.row.code)
          .first())
      )
        throw new HttpError(404, "Parent execution unavailable.");
      const observed = (
        await db()
          .prepare(
            "SELECT route,json_extract(decision,'$.execution_handler') handler,COUNT(*) samples,AVG(CASE WHEN state='succeeded' THEN 1.0 ELSE 0.0 END) success,AVG(json_extract(report,'$.evaluationScore')) score FROM (SELECT * FROM intelligence_executions WHERE organisation=? ORDER BY created DESC,id DESC LIMIT 500) WHERE policy_version=? AND state IN ('succeeded','failed') AND json_extract(decision,'$.task_type')=? GROUP BY route,handler HAVING COUNT(*)>=20",
          )
          .bind(
            org,
            p.version,
            input.step.taskType ?? classify(input.step.intent),
          )
          .all<{
            route: string;
            handler: string;
            samples: number;
            success: number;
            score: number | null;
          }>()
      ).results;
      const observedQuality = (route: string, id: string, declared: number) => {
        const h = observed.find((h) => h.route === route && h.handler === id);
        return h
          ? Math.min(declared, h.success, h.score ?? declared)
          : declared;
      };
      const guardedPolicy = {
        ...p.document,
        models: p.document.models.map((m) => ({
          ...m,
          quality: observedQuality(m.tier, m.id, m.quality),
        })),
      };
      const guardedStep = {
        ...input.step,
        ...(input.step.tool
          ? {
              tool: {
                ...input.step.tool,
                quality: observedQuality(
                  "tool",
                  input.step.tool.id,
                  input.step.tool.quality,
                ),
              },
            }
          : {}),
        ...(input.step.deterministic
          ? {
              deterministic: {
                ...input.step.deterministic,
                quality: observedQuality(
                  "deterministic",
                  input.step.deterministic.id,
                  input.step.deterministic.quality,
                ),
              },
            }
          : {}),
      };
      const registry = (await capabilities(org)).map((c) => ({
        ...c,
        quality: observedQuality("capability", c.method, c.quality),
      }));
      const decision = decide(guardedStep, guardedPolicy, registry);
      if (observed.length)
        decision.reason_codes.push("QUALITY_HISTORY_GUARDRAIL");
      let route = decision.recommended_route,
        model = decision.model,
        handler = decision.handler;
      if (p.document.mode !== "enforce") {
        if (!input.actualRoute)
          throw new HttpError(
            400,
            "Observe and shadow modes require an actual route.",
          );
        route = input.actualRoute;
        if (decision.risk === "high" && route !== "human")
          throw new HttpError(
            403,
            "Human oversight cannot be bypassed in observe or shadow mode.",
          );
        if (!p.document.allowedRoutes.includes(route))
          throw new HttpError(403, "Actual route is disallowed.");
        const actual = p.document.models.find(
          (m) => m.id === input.actualModel && m.tier === route,
        );
        if (["local", "private", "cloud", "frontier"].includes(route)) {
          if (
            !actual ||
            !input.step.availableModels.includes(actual.id) ||
            (input.step.costBudget !== null &&
              (actual.estimatedCost === null ||
                actual.estimatedCost > input.step.costBudget)) ||
            actual.quality <
              Math.max(input.step.requiredQuality, p.document.minimumQuality) ||
            !actual.taskTypes.includes(decision.task_type) ||
            (actual.external &&
              (p.document.localOnly ||
                (p.document.sensitiveLocalOnly &&
                  ["personal", "restricted"].includes(
                    input.step.dataClassification,
                  )))) ||
            (p.document.regions.length &&
              !p.document.regions.includes(actual.region))
          )
            throw new HttpError(
              403,
              "Actual model is insufficient or disallowed by privacy or residency policy.",
            );
          model = actual.id;
          handler = actual.id;
        } else {
          model = null;
          handler = input.actualHandler ?? null;
          if (
            route === "tool" &&
            !p.document.allowedTools.includes(String(handler))
          )
            throw new HttpError(403, "Actual tool is disallowed.");
          if (
            route === "capability" &&
            !(await capabilities(org)).some(
              (c) =>
                c.method === handler &&
                c.status === "validated" &&
                c.permissions.includes(input.step.action) &&
                c.taskTypes.includes(decision.task_type) &&
                c.quality >=
                  Math.max(
                    input.step.requiredQuality,
                    p.document.minimumQuality,
                  ) &&
                c.risk !== "high",
            )
          )
            throw new HttpError(403, "Actual capability is not validated.");
        }
      }
      const actualModel = p.document.models.find((m) => m.id === model);
      const stored = {
        ...decision,
        quality_guardrails: observed,
        execution_model: model,
        execution_provider: actualModel?.provider ?? null,
        execution_external: actualModel?.external ?? false,
        execution_handler: handler ?? null,
        execution_capability:
          route === "capability"
            ? ((await capabilities(org)).find(
                (c) => c.method === handler && c.status === "validated",
              )?.id ?? null)
            : null,
        execution_capability_version:
          route === "capability"
            ? ((await capabilities(org)).find(
                (c) => c.method === handler && c.status === "validated",
              )?.version ?? null)
            : null,
        action: input.step.action,
        resource: input.step.resource,
      };
      const expires = new Date(Date.now() + 300000).toISOString();
      const inserted = await db()
        .prepare(
          "INSERT INTO intelligence_executions(id,organisation,agent,parent,step_id,pattern,input_hash,policy_version,mode,decision,route,state,created,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?,'resolved',?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          input.executionId,
          org,
          ctx.row.code,
          input.parentExecutionId,
          input.step.stepId,
          input.pattern,
          input.inputHash,
          p.version,
          p.document.mode,
          JSON.stringify(stored),
          route,
          now(),
          expires,
        )
        .run();
      if (!inserted.meta.changes)
        throw new HttpError(
          409,
          "Execution ID already exists; inspect its trace before retrying.",
        );
      return {
        executionId: input.executionId,
        mode: p.document.mode,
        policyVersion: p.version,
        route,
        decision: stored,
        expires,
      };
    }
    const id = uuid.parse(ctx.input.executionId),
      row = await db()
        .prepare(
          "SELECT * FROM intelligence_executions WHERE id=? AND organisation=? AND agent=?",
        )
        .bind(id, org, ctx.row.code)
        .first<Execution>();
    if (!row) throw new HttpError(404, "Execution unavailable.");
    if (action !== "evaluate" && row.expires <= now())
      throw new HttpError(
        409,
        "Execution expired; review the trace before retrying.",
      );
    if (action === "abandon") {
      const input = z
        .object({
          executionId: uuid,
          reason: z.enum(["unavailable", "cancelled", "policy_denied"]),
        })
        .strict()
        .parse(ctx.input);
      const changed = await db()
        .prepare(
          "UPDATE intelligence_executions SET state='blocked',report=?,completed=? WHERE id=? AND state='resolved'",
        )
        .bind(
          JSON.stringify({ error: input.reason, invoked: false }),
          now(),
          id,
        )
        .run();
      if (!changed.meta.changes)
        throw new HttpError(409, "Only unresolved execution may be abandoned.");
      return { executionId: id, state: "blocked" };
    }
    const decision = JSON.parse(row.decision) as Decision & {
      action: string;
      resource: string;
      execution_model: string | null;
      execution_handler: string | null;
      execution_external: boolean;
      execution_capability: string | null;
      execution_capability_version: number | null;
    };
    if (action === "execute" || action === "check") {
      z.object({ executionId: uuid }).strict().parse(ctx.input);
      if (row.policy_version !== p.version)
        throw new HttpError(
          409,
          "Routing policy changed. Resolve a new execution.",
        );
      if (
        row.route === "capability" &&
        !(await capabilities(org)).some(
          (c) =>
            c.id === decision.execution_capability &&
            c.version === decision.execution_capability_version &&
            c.status === "validated",
        )
      )
        throw new HttpError(403, "Capability was withdrawn.");
      const permit = await db()
        .prepare(
          "SELECT authority FROM work_permits WHERE id=? AND agent=? AND state='started' AND input_hash=? AND action=? AND resource=? AND policy_revision=? AND agent_revision=?",
        )
        .bind(
          id,
          ctx.row.code,
          row.input_hash,
          decision.action,
          decision.resource,
          ctx.policy.revision,
          ctx.row.revision,
        )
        .first<{ authority: string }>();
      if (!permit?.authority)
        throw new HttpError(
          403,
          "Start a matching bounded runtime permit before execution.",
        );
      const binding = taskAuthoritySchema.parse(JSON.parse(permit.authority));
      const chain = await chainFor(binding.grant, org),
        issue = await liveChainIssue(chain);
      if (issue) throw new HttpError(403, issue);
      const authority = evaluateAuthority(chain, binding.request);
      if (authority.decision === "DENY")
        throw new HttpError(403, authority.reason);
      if (row.route === "human") {
        const approval =
          binding.approval &&
          (await db()
            .prepare(
              "SELECT id FROM authority_approvals WHERE id=? AND agent=? AND grant_id=? AND organisation=? AND input_hash=? AND state='consumed' AND expires>? AND EXISTS(SELECT 1 FROM organisation_members m WHERE m.organisation=authority_approvals.organisation AND m.user=authority_approvals.approver AND m.role IN ('owner','admin'))",
            )
            .bind(
              binding.approval,
              ctx.row.code,
              binding.grant,
              org,
              row.input_hash,
              now(),
            )
            .first());
        if (authority.decision !== "ESCALATE" || !approval)
          throw new HttpError(
            403,
            "Human routes require an approval-requiring grant and an exact-task approval consumed by this runtime permit.",
          );
      }
      if (action === "check") {
        if (!["resolved", "running"].includes(row.state))
          throw new HttpError(409, "Execution is no longer active.");
        return { executionId: id, allowed: true };
      }
      const changed = await db()
        .prepare(
          "UPDATE intelligence_executions SET state='running' WHERE id=? AND state='resolved' AND expires>? AND policy_version=(SELECT MAX(version) FROM intelligence_policies WHERE organisation=?)",
        )
        .bind(id, now(), org)
        .run();
      if (!changed.meta.changes)
        throw new HttpError(
          409,
          "Execution was started already or the policy changed.",
        );
      return {
        executionId: id,
        state: "running",
        route: row.route,
        handler: decision.execution_handler,
        model: decision.execution_model,
        external: decision.execution_external,
        contextIds: decision.context_ids,
      };
    }
    const report = z
      .object({
        executionId: uuid,
        success: z.boolean(),
        latencyMs: z.number().nonnegative().max(3600000),
        cost: z.number().nonnegative().max(100).nullable().default(null),
        inputTokens: z
          .number()
          .int()
          .nonnegative()
          .max(10000000)
          .nullable()
          .default(null),
        outputTokens: z
          .number()
          .int()
          .nonnegative()
          .max(10000000)
          .nullable()
          .default(null),
        contextBytesTotal: z.number().int().nonnegative().max(10000000),
        contextBytesExternal: z.number().int().nonnegative().max(10000000),
        evaluationScore: z.number().min(0).max(1).nullable().default(null),
        humanCorrection: z.boolean().default(false),
        error: z
          .enum([
            "unavailable",
            "validation_failed",
            "policy_denied",
            "human_timeout",
            "cancelled",
            "execution_failed",
          ])
          .nullable()
          .default(null),
        outputHash: hash.nullable().default(null),
      })
      .strict()
      .refine(
        (r) => r.contextBytesExternal <= r.contextBytesTotal,
        "External context cannot exceed total context.",
      )
      .parse(ctx.input);
    if (!decision.execution_external && report.contextBytesExternal !== 0)
      throw new HttpError(400, "Local routes cannot report external context.");
    const encoded = JSON.stringify({
      ...report,
      source: "runtime-reported",
      currency: "USD",
    });
    if (row.report === encoded && ["succeeded", "failed"].includes(row.state))
      return { executionId: id, state: row.state };
    const changed = await db()
      .prepare(
        "UPDATE intelligence_executions SET state=?,report=?,completed=? WHERE id=? AND state='running'",
      )
      .bind(report.success ? "succeeded" : "failed", encoded, now(), id)
      .run();
    if (!changed.meta.changes)
      throw new HttpError(
        409,
        "Execution must be running and not already completed.",
      );
    return { executionId: id, state: report.success ? "succeeded" : "failed" };
  }
  const user = await auth(req, method !== "GET", false);
  return intelligenceAdministration(req, path, user.id);
}

// Both browser and MCP entry points authenticate first. Tenant/role checks stay
// here so connected assistants cannot gain broader access than the workspace.
export async function intelligenceAdministration(
  req: Request,
  path: string[],
  userId: string,
) {
  const user = { id: userId },
    url = new URL(req.url),
    method = req.method,
    action = path[1],
    org = uuid.parse(url.searchParams.get("organisation"));
  await member(org, user.id, method !== "GET");
  if (action === "policy") {
    const current = await policy(org);
    if (method === "GET") return current;
    if (method === "POST") {
      const input = z
        .object({
          expectedVersion: z.number().int().nonnegative(),
          document: policySchema,
        })
        .strict()
        .parse(await parse(req));
      if (current.version !== input.expectedVersion)
        throw new HttpError(409, "Policy changed; refresh before saving.");
      try {
        await db()
          .prepare(
            "INSERT INTO intelligence_policies(id,organisation,version,document,reviewer,created) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            org,
            current.version + 1,
            JSON.stringify(input.document),
            user.id,
            now(),
          )
          .run();
      } catch {
        throw new HttpError(
          409,
          "Concurrent policy edit; refresh before saving.",
        );
      }
      return { version: current.version + 1, document: input.document };
    }
  }
  if (action === "history" && method === "GET")
    return {
      policies: (
        await db()
          .prepare(
            "SELECT version,document,created FROM intelligence_policies WHERE organisation=? ORDER BY version DESC LIMIT 100",
          )
          .bind(org)
          .all()
      ).results,
    };
  if (action === "capability-history" && method === "GET") {
    const id = z
      .string()
      .regex(/^[a-zA-Z0-9_.:-]{1,100}$/)
      .parse(url.searchParams.get("id"));
    const rows = (
      await db()
        .prepare(
          "SELECT document,status,evidence,created FROM intelligence_capabilities WHERE organisation=? AND id=? ORDER BY version DESC LIMIT 100",
        )
        .bind(org, id)
        .all<{
          document: string;
          status: string;
          evidence: string;
          created: string;
        }>()
    ).results;
    return {
      versions: rows.map((r) => ({
        ...JSON.parse(r.document),
        status: r.status,
        evidence: JSON.parse(r.evidence),
        created: r.created,
      })),
    };
  }
  if (action === "capabilities") {
    if (method === "GET")
      return { capabilities: await capabilities(org, false) };
    if (method === "POST") {
      const input = z
        .object({
          id: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/),
          description: z.string().min(1).max(500),
          taskTypes: z.array(z.enum(taskTypes)).min(1).max(14),
          aliases: z.array(z.string().min(1).max(100)).max(30),
          quality: z.number().min(0).max(1),
          permissions: z.array(z.string().min(1).max(100)).min(1).max(30),
          risk: z.enum(["low", "medium", "high"]),
          method: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/),
          inputSchema: z.record(z.unknown()),
          outputSchema: z.record(z.unknown()),
          source: z.string().min(1).max(500),
          expectedVersion: z.number().int().nonnegative(),
        })
        .strict()
        .parse(await parse(req));
      const count = await db()
        .prepare(
          "SELECT COUNT(DISTINCT id) n,MAX(CASE WHEN id=? THEN version END) v FROM intelligence_capabilities WHERE organisation=?",
        )
        .bind(input.id, org)
        .first<{ n: number; v: number | null }>();
      if ((count?.v ?? 0) !== input.expectedVersion)
        throw new HttpError(409, "Capability version changed.");
      if ((count?.n ?? 0) >= 100 && !count?.v)
        throw new HttpError(
          409,
          "This registry supports up to 100 capability families.",
        );
      const { expectedVersion, ...document } = input,
        version = expectedVersion + 1;
      await db()
        .prepare(
          "INSERT INTO intelligence_capabilities(key,organisation,id,version,document,status,evidence,reviewer,created) VALUES(?,?,?,?,?,'candidate','{}',?,?)",
        )
        .bind(
          crypto.randomUUID(),
          org,
          input.id,
          version,
          JSON.stringify({ ...document, version }),
          user.id,
          now(),
        )
        .run();
      return { id: input.id, version, status: "candidate" };
    }
  }
  if (action === "review" && method === "POST") {
    const input = z
      .object({
        id: z.string().max(100),
        version: z.number().int().positive(),
        status: z.enum(["validated", "withdrawn"]),
        datasetHash: hash.nullable().default(null),
        samples: z.number().int().min(0).max(1000000).default(0),
        score: z.number().min(0).max(1).nullable().default(null),
        safetyPassed: z.boolean().default(false),
        notes: z.string().min(10).max(1000),
      })
      .strict()
      .parse(await parse(req));
    const current = await policy(org);
    if (
      input.status === "validated" &&
      (!input.datasetHash ||
        input.samples < 3 ||
        input.score === null ||
        input.score < current.document.minimumQuality ||
        !input.safetyPassed)
    )
      throw new HttpError(400, "Evaluation does not meet policy quality.");
    const previous = await db()
      .prepare(
        "SELECT evidence FROM intelligence_capabilities WHERE organisation=? AND id=? AND version=?",
      )
      .bind(org, input.id, input.version)
      .first<{ evidence: string }>();
    if (!previous) throw new HttpError(404, "Capability unavailable.");
    const reviews = JSON.parse(previous.evidence).reviews ?? [];
    if (reviews.length >= 100 && input.status === "validated")
      throw new HttpError(409, "Register a new version after 100 reviews.");
    const changed = await db()
      .prepare(
        "UPDATE intelligence_capabilities SET status=?,evidence=?,reviewer=? WHERE organisation=? AND id=? AND version=? AND evidence=?",
      )
      .bind(
        input.status,
        JSON.stringify({
          reviews: [
            ...reviews,
            {
              ...input,
              reviewed: now(),
              reviewer: await digest(org + ":" + user.id),
              source: "administrator-attested",
            },
          ],
        }),
        user.id,
        org,
        input.id,
        input.version,
        previous.evidence,
      )
      .run();
    if (!changed.meta.changes)
      throw new HttpError(404, "Capability unavailable.");
    return input;
  }
  if (action === "candidates" && method === "GET") {
    return {
      patterns: (
        await db()
          .prepare(
            "SELECT pattern,COUNT(*) samples,AVG(json_extract(report,'$.evaluationScore')) score,AVG(json_extract(report,'$.latencyMs')) latencyMs,AVG(json_extract(report,'$.cost')) cost FROM intelligence_executions WHERE organisation=? AND route IN ('cloud','frontier') AND state='succeeded' AND json_extract(report,'$.evaluationScore')>=0.95 GROUP BY pattern HAVING COUNT(*)>=3 ORDER BY samples DESC LIMIT 100",
          )
          .bind(org)
          .all()
      ).results,
      notice:
        "Repeated runtime-reported outcomes identify candidates. Implement and evaluate a reusable handler before administrator promotion.",
    };
  }
  if (action === "executions" && method === "GET") {
    if (path[2]) {
      const r = await db()
        .prepare(
          "SELECT * FROM intelligence_executions WHERE id=? AND organisation=?",
        )
        .bind(uuid.parse(path[2]), org)
        .first<Execution>();
      if (!r) throw new HttpError(404, "Execution unavailable.");
      return view(r);
    }
    const c = descendingCursor(
      {
        after: url.searchParams.get("after") ?? "",
        limit: url.searchParams.get("limit") ?? 50,
      },
      50,
      100,
    );
    const rows = (
      await db()
        .prepare(
          "SELECT * FROM intelligence_executions WHERE organisation=? AND (created<? OR (created=? AND id<?)) ORDER BY created DESC,id DESC LIMIT ?",
        )
        .bind(org, c.created, c.created, c.id, c.limit + 1)
        .all<Execution>()
    ).results;
    const page = descendingPage(rows, c.limit);
    return { ...page, items: page.items.map(view) };
  }
  if (action === "metrics" && method === "GET") {
    const mix = (
      await db()
        .prepare(
          "SELECT route,COUNT(*) total,SUM(CASE WHEN state='succeeded' THEN 1 ELSE 0 END) succeeded,SUM(CASE WHEN state='failed' OR (state IN ('resolved','running') AND expires<?) THEN 1 ELSE 0 END) failed,AVG(json_extract(report,'$.evaluationScore')) evaluationScore,AVG(json_extract(report,'$.latencyMs')) latencyMs,SUM(CASE WHEN json_extract(report,'$.humanCorrection')=1 THEN 1 ELSE 0 END) humanCorrections,SUM(CASE WHEN state IN ('succeeded','failed') THEN 1 ELSE 0 END) completed FROM intelligence_executions WHERE organisation=? GROUP BY route",
        )
        .bind(now(), org)
        .all<{
          route: string;
          total: number;
          succeeded: number;
          failed: number;
          completed: number;
          humanCorrections: number;
          evaluationScore: number | null;
          latencyMs: number | null;
        }>()
    ).results;
    const totals = await db()
      .prepare(
        "SELECT COUNT(*) steps,SUM(CASE WHEN parent IS NOT NULL THEN 1 ELSE 0 END) retries,SUM(CASE WHEN json_extract(decision,'$.execution_external')=1 AND state IN ('succeeded','failed') THEN 1 ELSE 0 END) externalCalls,SUM(json_extract(report,'$.cost')) cost,COUNT(json_extract(report,'$.cost')) costReports,SUM(json_extract(report,'$.contextBytesTotal')) contextTotal,SUM(json_extract(report,'$.contextBytesExternal')) contextExternal,SUM(CASE WHEN state IN ('succeeded','failed') THEN 1 ELSE 0 END) completed FROM intelligence_executions WHERE organisation=?",
      )
      .bind(org)
      .first<{
        steps: number;
        retries: number;
        externalCalls: number | null;
        cost: number | null;
        costReports: number;
        contextTotal: number | null;
        contextExternal: number | null;
        completed: number;
      }>();
    const p = await policy(org),
      total = {
        ...totals!,
        completed: totals?.completed ?? 0,
        retries: totals?.retries ?? 0,
        externalCalls: totals?.externalCalls ?? 0,
      };
    const pct = (n: number, d: number) => (d ? (100 * n) / d : null);
    const executed = mix.reduce((s, m) => s + m.completed, 0),
      noLLM = mix
        .filter((m) =>
          ["deterministic", "context", "tool", "capability"].includes(m.route),
        )
        .reduce((s, m) => s + m.completed, 0);
    const baseline =
      p.document.baselineCostPerStep === null
        ? null
        : p.document.baselineCostPerStep * executed;
    return {
      ...total,
      mix: mix.map((m) => ({
        ...m,
        percent: pct(m.completed, executed),
        successRate: pct(m.succeeded, m.completed),
        failureRate: pct(m.failed, m.total),
      })),
      noLLMPercent: pct(noLLM, executed),
      cloudDependency: pct(total.externalCalls ?? 0, executed),
      frontierDependency: pct(
        mix.find((m) => m.route === "frontier")?.completed ?? 0,
        executed,
      ),
      contextKeptLocalPercent: total.contextTotal
        ? pct(
            total.contextTotal - (total.contextExternal ?? 0),
            total.contextTotal,
          )
        : null,
      baselineModel: p.document.baselineModel,
      estimatedBaselineCost: baseline,
      estimatedSavings:
        baseline !== null && total.costReports === executed && executed
          ? baseline - (total.cost ?? 0)
          : null,
      source: "runtime-reported",
      currency: "USD",
      notice:
        "No raw task contents or outputs are stored. Quality and cost reports are supplied by runtimes. Recommendations in shadow mode are not executed savings. Unreported costs remain unknown.",
    };
  }
  throw new HttpError(404, "Intelligence operation unavailable.");
}
