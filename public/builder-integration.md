# FTAI builder integration

FTAI is an opt-in identity and work-permission service. To make registration the default, install the integration in the agent factory, scheduler, and tool gateway you control. Unconnected software is not compelled to register. No claim of worldwide mandatory status, platform partnerships, or government recognition is made.

## Start with a real agent

1. Sign in and open **Agent network**. Create a policy with your organization name and exact allowed action names. The organization remains an owner-declared claim.
2. Put its enrollment key in `FTAI_ENROLLMENT_KEY` using your host's secret manager. Never put the key in prompts, source control, public configuration, or tool output.
3. At `/builders`, enter your agent's name, stable runtime ID, role, and action. Download `ftai-config.json`, `ftai.mjs`, and `ftai-runner.mjs` into your host folder.
4. Run `node ftai-runner.mjs check ftai-config.json`. This checks local configuration only. It does not authorize work or create an identity.
5. Run `node ftai-runner.mjs enroll ftai-config.json` to enroll without executing a task, or run your real task through the runner:

```sh
node ftai-runner.mjs run ftai-config.json -- node your-agent.mjs
```

Replace `your-agent.mjs` with your real entrypoint. The runner authenticates the identity, verifies the original seal, requests and consumes a one-use permit, then starts the supplied command with `shell: false`. It passes `FTAI_PASSPORT_CODE` and `FTAI_TASK_ID` to that process and removes the enrollment secret from the child's environment. The child still needs its normal tool/model credentials configured by the operator. Standard input/output stay attached to your terminal; FTAI receives a result summary, not the output content.

The configuration's `task` contains a UUID. Retain it for retries of the same attempt. A consumed or completed task UUID cannot run again. Use a fresh UUID for each new job; do not silently replace a failed job's identity. A zero process exit is reported as execution success, not independent task-quality verification.

Protect the durable `.ftai/` identity directory (private key files use mode 0600). Mount it only into the trusted host. Agent/model code with access to the host's keys, unrestricted tool credentials, or scheduler can bypass a wrapper. Enforce tool access at the host boundary. A runtime's signing key identifies that runtime; it does not establish where the process ran or what model it used.

## Build it into a platform

A practical adoption path has three integration points:

- **Agent creation:** configure an organization policy once, assign a stable runtime ID to every new agent, and initialize the SDK before allowing the agent to accept jobs.
- **Job dispatch:** require `runTask()` or the runner for each task. Keep job IDs and outcomes in your durable queue. Deny direct access to tools that bypass the gate.
- **Operator experience:** catch registration-required errors and show the builder message plus setup URL in your platform UI. The SDK does not send email, contact a builder, or alter other software automatically.

```js
import { FTAIClient, FTAIEnrollmentRequiredError } from './ftai.mjs';
const passport = new FTAIClient(yourRuntimeConfiguration);
try {
  await passport.init();
} catch (error) {
  if (error instanceof FTAIEnrollmentRequiredError) {
    // Present these fields in your operator interface; do not start work.
    showOperatorAction({
      code: error.code,
      message: error.builderMessage,
      setupUrl: error.setupUrl
    });
  } else {
    throw error;
  }
}
```

`yourRuntimeConfiguration` and `showOperatorAction` come from your platform. The error code is `FTAI_ENROLLMENT_REQUIRED`; CLI exit status is 2. Other setup or authorization failures return exit status 1. Outcome reporting failures return 3 and include a recovery description. No provider is presented as a partner simply because this integration can wrap its agent process.

For non-Node hosts, implement the exact HTTPS/Ed25519 protocol in `/runtime-protocol.md`. Discovery is at `/.well-known/ftai-passport.json`. Separate A2A registry requests, MCP read tools with machine OAuth credentials, and optional SPIFFE JWT-SVID verification are documented in /standards.md.

## Lifetime identity and independent verification

The first signed registration has a permanent UUID, personnel code, issuance timestamp, and SHA-256 fingerprint. Database triggers reject edits to the code, owning account, issuance time, and existing ledger records. They reject ordinary deletion of passports and ledger records. An explicit authenticated privacy-erasure transaction removes records and leaves a private retired code; see /privacy. Later metadata changes, suspensions, key recovery, and withdrawals are signed additions. Retirement changes work eligibility, not the original identity.

The SDK saves the birth fingerprint and registry public-key fingerprint into its private identity file. On initialization and before work, it verifies the original signed receipt and compares it with that saved anchor. A mismatch fails closed with `FTAI_IDENTITY_CHANGED`. Do not erase the local anchor to hide an unexpected mismatch; investigate it with your operator. Existing runtimes pin their anchor the first time they upgrade to this SDK.

Signed-in owners and authorized readers can download `/api/v1/agents/{code}/identity-lock`. The UI exposes the same download beside the digital passport. Keep an independent copy. You can verify a saved seal offline:

```js
import { readFile } from 'node:fs/promises';
import { verifyIdentitySeal } from './ftai.mjs';
const seal = JSON.parse(await readFile('saved-identity-seal.json', 'utf8'));
// Supply the fingerprint from a separately trusted, previously saved copy.
const valid = verifyIdentitySeal(seal, previouslySavedBirthHash);
```

Without an independently trusted fingerprint/key, a self-contained signature only proves consistency with its supplied key. Database administrators can remove guards and replace the service. This release has no external transparency witness, blockchain anchoring, or hardware-bound model attestation. It provides durable identifiers, guarded records, and evidence to detect identity changes; it does not promise invulnerability.

## Privacy and public discovery

New passports remain private. Their owners can select **Listed** when editing visibility. Public directory search and horizontally scrolling cards show only name, role, organization, personnel code, selected skills, and lifecycle status. These summaries are owner-published claims. Full passport data, evidence, record verification, and QR destinations require sign-in. Signed-in visitors can read listed passports. Private passports remain restricted to the owning workspace; only owners can change them.

All profile cards come from real listed records. An empty registry has an explicit empty state; no fictional agents, adoption counts, employer logos, or partnerships are seeded. Taking a profile private removes it from future directory responses but cannot recall previously downloaded copies.

## Failure recovery

New tasks fail closed when registration, identity verification, policy checks, or permit consumption fail. A permit lasts 60 seconds and is consumed atomically once. A registry outage blocks new work. Running callbacks receive an AbortSignal on a failed periodic check; the CLI signals its direct child process. Tool code and process supervision must honor cancellation; arbitrary external processes cannot be forcibly controlled by a website.

The SDK writes an outcome queue before upload. If a callback already ran and reporting failed, flush the queue rather than repeating the task. `FTAIReportingError` explains whether it was saved to disk. Process crashes before journaling require reconciliation against your own task system; a started permit does not prove whether side effects occurred. Read `/runtime-protocol.md` for the full key recovery, history import, and outcome lifecycle.

## Why platforms would adopt

The adoption offer is concrete: one durable identity per runtime, an owner-controlled work gate, portable evidence-backed history, signed records, and an owner-selected public profile that can be discovered before sign-in. Platforms can enforce registration within their own infrastructure. Making that universal requires real distribution and adoption agreements; the product does not invent those agreements or claim that publishing a discovery file installs it everywhere.
