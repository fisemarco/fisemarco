# FTAI Intelligence Control Plane

Production origin: https://fisemarco.com
Product page: /intelligence-control-plane · Organisation dashboard: /intelligence
SDK: /sdk/intelligence.mjs · Full runtime: /sdk/ftai.mjs · Bundle: /integrations/ftai-sdks.zip

FTAI selects an execution resource for each step. Handlers, context, provider credentials and output validators stay in your runtime. It uses the existing Ed25519 identity, bounded authority and one-use task permits. The current control service requires connectivity: it fails closed when unavailable. Tools and local providers retain their own connectivity requirements.

## Setup

1. Follow /llm-start.md to create/reuse an organisation, enroll a runtime and assign its passport. Keep its private state on durable restricted storage. Enrollment policies must allow the action used by your steps.
2. In /enterprise, issue a bounded grant for this identity, its actions, resources, countries, currency and amount limits. This is required for every organisation execution, including model calls and read-only tools.
3. In /intelligence, select the organisation and save a routing policy. Alternatively, the FTAI v3 plugin can read it with `ftai_intelligence_policy` and save requested configuration with `ftai_set_intelligence_policy` using the current expectedVersion. See /plugin-guide.md for all nine Intelligence Control management tools. Start new integrations in shadow mode unless the user chooses otherwise; preserve existing controls and explicitly configure approved tools and evaluated model metadata. The initial unsaved policy has no model/provider permissions. Enforce requires a saved policy.
4. Register implemented reusable handlers as candidates in Capabilities. Evaluate their input/output contract against at least three cases, including safety cases, record a dataset hash and measured score, then an administrator can promote the version. The review is an administrator attestation, not independent certification. A new version must be evaluated again. A candidate revision leaves the previous serving version active until promotion; withdrawal stops the serving revision. Withdrawing the latest version stops reuse; restore by registering and reviewing a new version.
5. Instantiate the SDK using your existing initialized FTAIClient. Use a durable, private outbox directory. Call `flush()` at startup to recover reports before accepting work. Do not repeat side effects to repair a missing report.

## Complete read-only step

The example assumes an existing assigned `ftai` client, `grantId`, and an actual CRM implementation. Replace IDs and validators with your evaluated resources; no fixture services are provided in production.

```js
import { IntelligenceControl, ollamaProvider } from './intelligence.mjs';
const control = new IntelligenceControl({
  client: ftai,
  outboxPath: './private/intelligence-outbox',
  handlers: {
    'crm.lookup': async ({ context, signal, assertAllowed }) => {
      await assertAllowed(); // Re-check before a side effect or resource access.
      const value = await crm.lookup(context.account.id, { signal });
      return { value, cost: null }; // Unknown cost remains unknown.
    },
    'relationship': async ({ context }) => ({ value: context.relationship, cost: 0 }),
    'lead.score': async ({ context }) => ({ value: evaluatedLeadRules(context), cost: null })
  },
  models: {
    // Register this same ID with tier=local, external=false, region=FI,
    // evaluated quality and supported task types in the organisation policy.
    'local-writer': ollamaProvider({ model: process.env.LOCAL_MODEL })
  }
});
await control.flush();
const result = await control.run({
  step: {
    stepId: 'account-status',
    intent: 'Find account status', // Generic operation label, not private task contents.
    taskType: 'lookup',
    action: 'sales.read',
    resource: 'crm:accounts',
    dataClassification: 'internal',
    requiredQuality: 0.98,
    tool: { id: 'crm.lookup', quality: 0.99, requiresInterpretation: false }
  },
  context: {
    account: { value: { id: accountId }, relevant: true, sensitive: false, validated: true, kind: 'business' },
    privateNotes: { value: privateNotes, relevant: false, sensitive: true }
  },
  grant: grantId,
  request: { action: 'sales.read', resource: 'crm:accounts', country: 'FI', currency: 'EUR', amountMinor: 0 }
}, {
  validate: async value => ({ valid: validateCRMResponse(value), score: measuredCRMValidationScore(value) })
});
```

Your validators must measure actual task correctness. Returning a constant score is appropriate only for controlled test fixtures, not production quality evidence. Declared tool/rule quality, context validation and local model confidence are supplied by the customer runtime; FTAI cannot independently prove them. A local model without a per-task `localConfidence` meeting the quality threshold is skipped. Models support only explicitly listed task types. Complex/novel tasks require frontier or an explicitly evaluated `supportsComplex:true` private/local/cloud model. Policy, safety and privacy precede latency and cost. Budgets use declared estimates; an unknown estimated cost does not satisfy a specified budget.

Set `humanCorrection:true` in execution options only when a human actually corrected a prior result. A human oversight route alone is not counted as a correction.

Handlers return `{ value, cost?, inputTokens?, outputTokens? }`. Model costs and token counts may remain null. Cost currency is USD. The generic OpenAI-compatible adapter reports provider token usage when supplied and leaves cost unknown; add a measured pricing wrapper if you need cost reports. Do not treat an internal or local model as free without measurement.

## Context and memory

Supported context kinds: current, episodic, semantic, workflow, business, retrieved, tool_output, previous_execution. Set `answer:true, validated:true, relevant:true` only when a stored result is sufficient for the exact lookup/validation/workflow step. Register a handler under that field's ID to return the answer. This is exact validated reuse, not automatic understanding of arbitrary memory.

Tools use `{id,purpose,inputSchema,outputSchema,risk,cost,quality,requiresInterpretation}` (schemas and descriptive metadata are optional). Tool risk can require human oversight. Interpretation requires a separate validated model step after retrieval. They must be approved by ID in the organisation policy and have a local SDK handler. Reusable capabilities have versioned task types, aliases, input/output schemas, quality, risk, required action permissions, source and local handler ID. Alias matching is conservative word matching; ambiguous matches should be resolved with an explicit capability ID. It is not an embedding similarity model.

External providers receive relevant, non-sensitive context fields. The SDK removes credential-like fields and redacts common email/secret patterns recursively. This is a defence in addition to correct data classification; it is not a universal PII detector. Keep private instructions out of `intent`, use structured context sensitivity flags, and independently review provider data processing and residency. Model regions/qualities are organisation declarations, not provider attestation. No raw context or output is persisted by the control service. Step/action/resource IDs are persisted metadata and should not contain personal data. Routing receives the generic intent and context metadata transiently.

## Shadow and observe

Provide `actualRoute`, `actualModel` for a model, or `actualHandler` for another executor. The SDK executes that route unchanged while storing the recommendation in the trace. The actual route must still meet action, privacy, residency and human-approval constraints. Observe records route history; shadow supports recommendation comparisons. Neither runs an alternative output evaluation automatically or claims equivalent quality.

```js
await control.run({ ...stepInput, actualRoute: 'frontier', actualModel: 'approved-frontier' }, { validate });
```

Enforce selects the route and rejects work permits without a matching Intelligence Control decision. Missing configured model handlers are excluded from the available model list. A failed model validation or unavailable model automatically escalates to another permitted tier with a parent trace, up to nine attempts. Tool side effects are never retried automatically. A tool/capability/deterministic failure stops with an explicit error; investigate and deliberately resolve another step. `excludedRoutes` can prevent a known failing tier. Errors and quality reports are recorded without uploading error text or outputs.

## Human completion

For a high-impact or human route, prepare a decision, request approval and retain the prepared object securely in your application. An administrator approves the exact task in /enterprise. Then supply the approval ID and a human execution handler. Prepared ordinary steps expire in five minutes; review must occur within that lease. Expired steps must be prepared and reviewed again. A high-risk grant must actually require approval (`requireApproval:true`, including zero-value actions, or amount exceeds its approval threshold); a routine allow grant cannot bypass this requirement. `human` is a customer-reviewed callback, not an automatic model fallback.

```js
const prepared = await control.resolve(stepInput);
const review = await control.requestApproval(prepared);
// Show review.id to the authorised administrator; wait for approval.
const result = await control.execute(prepared, {
  approval: approvedId,
  human: async ({ signal, assertAllowed }) => {
    await assertAllowed();
    return { value: await humanReviewedOperation({ signal }), cost: null };
  },
  validate
});
```

Only the permit can consume an unused exact-input approval. A replay fails. A policy change or withdrawn capability stops prepared execution. Handlers must honour cancellation and recheck `assertAllowed()` before consequential resource operations. FTAI cannot enforce a permit inside an unrelated external system; resource-local access controls remain necessary.

## OpenAI-compatible local gateway

A loopback HTTP bridge supports text, non-streaming `/v1/chat/completions`. It requires an explicit mapping from incoming requests to your step/context/authority; it does not infer arbitrary tool contracts or grant permissions from a conversation. The bridge rejects streaming and unsupported message forms explicitly. It authenticates with a private runtime token, never a provider key.

```js
import { startOpenAICompatibleGateway } from './intelligence.mjs';
const gateway = await startOpenAICompatibleGateway({
  control,
  token: process.env.FTAI_GATEWAY_TOKEN, // 32+ characters from your secret store.
  prepare: async body => mapMessagesToApprovedStep(body),
  validate,
  port: 8088
});
// Existing OpenAI-compatible clients can use gateway.baseUrl.
// await gateway.close() at shutdown.
```

```python
from openai import OpenAI
import os
client = OpenAI(base_url="http://127.0.0.1:8088/v1", api_key=os.environ["FTAI_GATEWAY_TOKEN"])
response = client.chat.completions.create(model="ftai", stream=False,
    messages=[{"role":"user","content":"Find account status"}])
```

Provider adapters: `compatibleProvider({baseUrl,apiKey,model})`, `ollamaProvider({baseUrl,model})`, `vllmProvider({baseUrl,model})`. HTTPS is required outside loopback. URLs/credentials live in the runtime only; redirect following is disabled. The organisation policy ID must match the SDK `models` key. Provider tools, streaming, image/audio content and automatically extracting task semantics from arbitrary chats are not implemented.

## Existing orchestrators

`intelligenceNode(control,{validate})` returns an async step callback. Call it in a LangGraph node, wrap it in LangChain RunnableLambda, expose it in a CrewAI or Microsoft framework tool, or use a custom Node orchestration loop. Their specific framework versions are not tested adapters. Python/Go/Java can use the signed REST boundary or the loopback OpenAI bridge; the new IntelligenceControl executor is a Node SDK. Existing four-language identity lifecycle adapters are unchanged.

## Signed REST API

Base: `/api/v1/intelligence`. Runtime request signatures follow /runtime-protocol.md. Administration uses existing signed-in organisation membership. Runtime keys cannot edit policy, approve capability reviews or read another runtime's traces through the administration API.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | /resolve | Signed assigned active runtime | `{executionId,parentExecutionId?,inputHash,pattern,step,actualRoute?,actualModel?,actualHandler?}`; creates a five-minute routing decision |
| POST | /execute | Same runtime | `{executionId}`; checks policy version, live chain and started work permit with the same ID, action/resource and input hash; returns handler/model/context field IDs |
| POST | /check | Same runtime | `{executionId}`; re-check the active decision, current policy, capability status, permit, live grant chain and human approval before a resource access |
| POST | /evaluate | Same runtime | Immutable completion report: executionId,success,latencyMs,cost,inputTokens,outputTokens,contextBytesTotal,contextBytesExternal,evaluationScore,humanCorrection,error,outputHash. Exact retries are idempotent; no raw output |
| POST | /abandon | Same runtime | `{executionId,reason}` where unavailable/cancelled/policy_denied; unresolved trace becomes blocked and is excluded from invocation metrics |
| GET | /executions?organisation=UUID | Organisation member | Newest-first keyset page; `limit` <=100, `after` cursor |
| GET | /executions/UUID?organisation=UUID | Organisation member | Metadata-only individual trace |
| GET | /metrics?organisation=UUID | Organisation member | All-time backend aggregation |
| GET/POST | /policy?organisation=UUID | Member / administrator | Read or save `{expectedVersion,document}`; compare-and-set new version |
| GET | /history?organisation=UUID | Member | Latest 100 policy versions; restore by POSTing a previous document as a new version |
| GET/POST | /capabilities?organisation=UUID | Member / administrator | Latest version of up to 100 capability families; register candidate with expectedVersion |
| GET | /capability-history?organisation=UUID&id=ID | Member | Latest 100 definitions and their review evidence; restore by registering a prior definition as a new candidate |
| POST | /review?organisation=UUID | Administrator | Promotion: id,version,status:validated,datasetHash,samples,score,safetyPassed:true,notes. Withdrawal needs id,version,status:withdrawn,notes; append review evidence without requiring successful safety tests. |
| GET | /candidates?organisation=UUID | Member | Repeated evaluated model patterns; three successful runtime reports >=95% identify a review candidate |

`/execute` selects work to run in your process; it does not invoke arbitrary user URLs on the FTAI server. The SDK binds the complete serialized step and context into the existing work permit input hash. Intents, quality and routing declarations are validated with strict schemas and bounded sizes. State transitions are atomic, and completion cannot overwrite an earlier report. Expired pending/running traces show expired instead of silently disappearing. Late completion reports are retained for diagnosis without authorising another execution. The platform cannot guarantee exactly-once side effects in third-party systems; use their idempotency keys and durable task IDs.

## Analytics, learning and limitations

All-time metrics count individual executions/attempts, including retries and escalations, rather than unique business outcomes. They include completed executions, route mix, external model dependency, no-LLM routes, frontier dependency, outcome success, quality scores, latency, human correction, retries, cost coverage and context bytes. Bytes measure the selected intent/context JSON package, not total network traffic or full provider prompt overhead. Cost totals show reported costs only. Estimated savings require an explicit per-execution baseline and complete cost coverage; otherwise they are unavailable. Shadow recommendations never count as realised savings. No hypothetical baseline tokens or latency savings are fabricated.

Repeated evaluated cloud/frontier outcomes surface patterns for review. This release does not synthesize executable code from model output. The developer implements a candidate, evaluates it and submits its evidence; the administrator promotes or withdraws it. A fixed quality guardrail examines at most the latest 500 same-tenant traces, requires 20 completed samples for the same task class, handler and policy version, and limits a route to the lower of its declared quality, reported success ratio and mean evaluation score. Underperforming routes are skipped. This is a bounded, auditable safety rule, not reinforcement learning. Re-evaluate an improved handler and create a new policy version before recovering its declared rating. Historical policy versions are reversible through a new version. Capability review history is retained. Passport export includes intelligence traces and erasure removes them from the live database. Organisation retention and backups remain controller responsibilities; see /privacy-policy and /security.

Tests use disposable local runtime identities and a local HTTP provider fixture. They verify real routing and signed execution without spending model-provider funds or creating production metrics. Framework-specific end-to-end validation, real customer/provider deployment and independent security/regulatory assessment remain separate activities.
