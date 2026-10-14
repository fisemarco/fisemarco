# FTAI Runtime Enrollment 1.0

FTAI provides persistent agent identity, operator policies, signed work receipts, and a work gate for participating runtimes. This is an FTAI application protocol. The work-gate protocol is FTAI-specific. Separate A2A, MCP and OAuth endpoints are documented in /standards.md. Worldwide adoption requires integrations.

## Connect a runtime

1. Sign in to FTAI Passport and open **Agent network**. Create an enrollment policy with your organization name, allowed actions, denied actions, and agent capacity. This binds registrations to your account; the organization name is an operator assertion, not verified legal ownership.
2. Save the once-displayed enrollment key in your runtime's secret manager as `FTAI_ENROLLMENT_KEY`. It expires in 90 days and can be rotated. Keep it outside model prompts and tool outputs.
3. Download `/sdk/ftai.mjs` into your Node.js 22+ application. No third-party dependencies are required. Set `FTAI_BASE_URL` to this site's exact HTTPS origin.
4. Give each runtime a stable `externalId`, durable writable identity storage, and its actual metadata. Await `init()` before accepting jobs. Wrap every job in `runTask()` and ensure tool execution cannot bypass this wrapper. For distributed workers, use separate identities or a coordinator that owns the identity and job queue.

```js
import { FTAIClient, sha256 } from './ftai.mjs';

const passport = new FTAIClient({
  externalId: process.env.FTAI_AGENT_ID,
  name: 'Research assistant',
  role: 'Research analyst',
  profile: { version: '1.0.0', skills: ['research'] },
  statePath: '/var/lib/my-agent/ftai-identity.json'
});
await passport.init();

// job.id must be the same UUID on retries of the same attempt.
// job and runYourAgent come from your existing application.
const result = await passport.runTask({
  taskId: job.id,
  title: job.title,
  action: 'research', // Must match both policy and passport exactly.
  inputHash: sha256(JSON.stringify(job.input))
}, ({ signal }) => runYourAgent(job, { signal }));

// At graceful shutdown, after the current job has finished:
await passport.close();
```

The SDK generates an Ed25519 identity key and persists it with file mode 0600. Back up this file securely; deleting it does not delete the registered identity. Do not share one identity file across concurrent processes. The enrollment key is needed for first registration only. Subsequent requests use the agent's own signing key. Initialization synchronizes supplied profile fields, imports explicitly supplied history, and reports status. Idle clients report every 30 seconds; running tasks check authorization and report every 15 seconds. Timers do not keep an otherwise finished Node process alive.

## Discovery and transport

`GET /.well-known/ftai-passport.json` provides the origin, endpoints, issuer, SDK, and protocol version. `GET /.well-known/did.json` exposes the registry's public signing key. `GET /llms.txt` provides a concise integration guide. APIs use JSON under `/api/v1`; write bodies are limited to 65,536 bytes. HTTPS is required outside local development. Do not follow cross-origin redirects while sending credentials.

### Enrollment

`POST /api/v1/runtime/enroll`

Headers: `Content-Type: application/json`, `Authorization: Bearer <enrollment-key>`, and `X-FTAI-Signature` containing an unpadded base64url Ed25519 signature over these UTF-8 lines, with no trailing newline:

```text
FTAI-Enrollment-v1
<exact registry origin, without trailing slash>
<lowercase hex SHA-256 of exact request body bytes>
```

Body:

```json
{
  "externalId": "research-worker-production",
  "name": "Research assistant",
  "role": "Research analyst",
  "profile": { "version": "1.0.0", "skills": ["research"] },
  "publicKey": { "kty": "OKP", "crv": "Ed25519", "x": "<base64url 32-byte public key>" }
}
```

The public JWK must contain exactly `kty`, `crv`, and `x`, never `d`. `externalId` is unique within a policy. The same external ID and key return the existing personnel code. A different key for that ID is rejected. A key cannot be enrolled into multiple identities. Organization and initial allowed/denied actions come from the policy; visibility is always private. Enrollment does not fetch the agent's memory, files, employer systems, or conversation history.

### Signed runtime requests

All other runtime endpoints require these headers:

- `X-FTAI-Agent`: issued personnel code.
- `X-FTAI-Timestamp`: ten-digit Unix timestamp in seconds, within 60 seconds of server time.
- `X-FTAI-Nonce`: a new UUID for each HTTP attempt.
- `X-FTAI-Signature`: unpadded base64url Ed25519 signature.

Sign these UTF-8 lines, with no trailing newline:

```text
FTAI-Request-v1
<exact registry origin>
<personnel code>
<uppercase HTTP method>
<pathname and query string, including /api/v1>
<timestamp header>
<nonce header>
<lowercase hex SHA-256 of exact body bytes; empty bytes for GET>
```

A retry needs a fresh timestamp, nonce, and signature. Keep the same task/import ID and semantic payload when retrying an operation. Reused nonces are rejected. Signatures prove possession of the registered key, not the model's honesty or where it is running.

| Method and runtime path | Request | Result |
| --- | --- | --- |
| `GET /me` | None | Own passport, current policy, last reported status |
| `POST /heartbeat` | `status`: idle/running/degraded/offline; optional `details` (1000 chars) | Server receipt time and lifecycle/policy status |
| `POST /sync` | `name`, `role`, `profile` | Updated metadata revision; authority, ownership, visibility, and lifecycle remain operator-controlled |
| `POST /authorize` | UUID `taskId`, `title`, exact `action`; optional `resource`, `inputHash` | Signed permit, expiry; **does not authorize execution until consumed** |
| `POST /permits/{taskId}/start` | `{}` | `allowed: true` exactly once if the permit is current and policy permits work |
| `GET /permits/{taskId}` | None | issued/started/completed state and outcome ID |
| `POST /outcomes` | `taskId`, success/partial/failed `outcome`, integer `durationSeconds`; optional `intervention`, HTTPS `evidenceUrl`, hex SHA-256 `evidenceHash`, `notes` | Signed task ledger record and completed permit |
| `POST /history` | UUID `importId`, `record` in the record schema from `/api-reference.json` | Explicitly labeled historical import |

`profile` accepts description, creator, operator, model, version, skills, externalDid, and endpoint. These are reported metadata, not verified identities or proof of control for external DIDs. Sync does not grant new authority. Every action must match an allowed entry in both the policy and passport, and must appear in neither denied list. There are no wildcards or resource-pattern rules in version 1.0; `resource` and `inputHash` bind the permit's declared context. Runtime tool code must enforce the actual resource and task semantics.

### Work lifecycle and failure recovery

Permits expire 60 seconds after issuance. `/start` atomically consumes the permit and rechecks lifecycle, policy revision, passport revision, and key revocation. Never execute unless that response is successful and `allowed` is true. If the response is lost, query permit state. A `started` state does not prove whether the task ran; reconcile against your task journal. Never automatically repeat a side effect because a request timed out.

The SDK checks this gate before invoking the callback. It provides an AbortSignal when authorization is later withdrawn or the registry becomes unreachable. The callback and underlying tools must honor that signal. FTAI cannot forcibly stop arbitrary third-party code or undo actions already executed. Network outages block new work. The signed permit alone is not an offline authorization mechanism.

Completed execution writes its outcome to a durable local outbox before upload. `FTAIReportingError.persisted === true` means the callback executed and reporting is queued: call `flushOutcomes()` or restart with the same state file; do not run the task again. If `persisted === false`, preserve `error.outcome` and submit it with `reportOutcome()` after storage recovers. The SDK does not upload raw task input, output, or error text. Callback return means reported execution success, not independently measured output quality.

If the process crashes before an outcome reaches the outbox, the permit remains `started` and appears as outcome pending. Reconcile the actual task in your durable job system, then submit the known outcome with `reportOutcome()`. Preserve the original task ID. Unknown outcomes should remain pending until evidence establishes the result. A new attempt needs a new UUID linked by your job system; a completed or consumed task ID cannot run again.

Outcome retries are idempotent only when all normalized result fields match. Previously started tasks may report after a policy pause or passport suspension. A revoked signing key cannot report; recover the key through the owner first.

### Historical records

Pass `history: [...]` to the client or call `importHistory(records)`. Each record needs a stable UUID `id`. The runtime sends only history explicitly provided by your application. Imports retain their data in signed `history_import` ledger events labeled `runtime-reported-history`. They do not inflate current work metrics or create verified employment relationships. Original employment, task, benchmark, credential, incident, and review records can be imported; lifecycle changes and withdrawals use the owner workflow. Invalid date order is rejected. This separation lets a verifier distinguish a retrospective claim from an outcome attached to a consumed permit.

### Operator controls and key recovery

Owner session only: `GET/POST /api/v1/enrollment-policies`; `PATCH /enrollment-policies/{id}` with current `revision` and full policy; `POST /{id}/rotate`; `POST /{id}/revoke-agent` with `agent`; `POST /{id}/replace-key` with `agent` and new public JWK. Browser writes require the same Origin header as the request. Workspace API keys cannot manage enrollment policies.

Pausing blocks enrollment and new work. Changing policy rules invalidates unconsumed permits. Bootstrap rotation replaces the enrollment secret but preserves registered agent keys. Key revocation blocks that runtime's signed requests. Signing-key replacement preserves the personnel code and records old/new key fingerprints in the signed ledger:

1. Run `await client.prepareKeyRotation()` using the existing state file, even if its key was revoked. Persist the generated pending key file securely; this method returns only the new public JWK.
2. In Agent network, choose **Replace key** for the correct agent and paste that public JWK. This requires the owning account.
3. Run `await client.activateKeyRotation()`, then `await client.init()`. The SDK tests the new key before activating it. The old key is rejected.

Keep the pending file for retries if activation is interrupted. Do not upload private JWK fields to FTAI.

## Privacy, trust, and scope

Anyone can reach the public site and SDK. An operator signs in to create policies; unattended runtimes enroll using an operator-issued secret. Each account can read and manage its own private passports. A passport's owner can list a public profile summary; opening the complete passport and ledger requires sign-in; turning it private removes its public summary and blocks future non-owner retrieval but cannot recall downloaded copies. Enrollment policies, keys, heartbeats, and the operator fleet dashboard are never made public by sharing a passport.

FTAI authenticates key control and records what owners/runtimes report. It does not independently verify legal organization identity, ownership, employment, benchmark claims, complete reporting, or task quality. The registry signs VC-JWT receipts and links its records with SHA-256. That is integrity/provenance evidence; a database/signing-key administrator can still rewrite history. A permit is a separate credential type and is not accepted by the passport-record verifier as a completed-work receipt.

Policies, quotas, and signing prevent unapproved enrollment into an account. Global default adoption requires integration agreements and enforcement by agent hosts/tool gateways. An unrelated platform or agent is not compelled to register merely because this site exists.

Error bodies contain `error`. Typical statuses: 400 invalid input, 401 missing/invalid signature, 403 denied/revoked/paused, 404 absent or inaccessible private record, 409 replay/conflict/consumed or expired permit, 413 body too large, 415 JSON required, 429 policy limit. Credentials and request bodies must not be logged by client applications.

## Public discovery and lifetime identity update

`GET /api/v1/directory` returns owner-listed summary fields only, with `q`, `status`, and `offset` parameters. Full passport/record/verification/identity-lock endpoints require authentication, even for listed passports. The current SDK pins and verifies the original birth seal before work. Read `/builder-integration.md` for the startup runner, registration-required prompt, immutable database guards, QR privacy, and independent verification.
