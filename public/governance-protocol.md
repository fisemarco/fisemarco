# FTAI governance protocol 1.1

## Agent-issued delegation

`POST /api/v1/organisations/delegate` uses the same exact-byte Ed25519 authentication as the runtime protocol. Body: `{parent, subject, constraints, expires}`. The caller must be the parent's subject, active, and permitted to delegate those actions by its current runtime policy. All chain members and the new subject must be active members of the same workforce. No repeated subjects; maximum eight grants. Actions, resources, countries, currency, amount ceiling, approval threshold and expiry may only narrow. Parent `mayDelegate` must be true. Revocation is checked on subsequent use. The returned signed receipt includes the runtime's request proof.

## Exact-task human approvals

1. Agent calls `POST /api/v1/organisations/approval-request` with `{grant, request, inputHash}`. Request has exactly `action`, `resource`, `country`, `currency`, `amountMinor`; inputHash is lowercase SHA-256 of the exact task-input bytes. Only an ESCALATE decision can enter the queue. DENY cannot be overridden. A request expires within one hour and no later than its grant.
2. An organisation owner/admin reviews it in `/enterprise`, Governance centre, Approvals. `GET /api/v1/organisations/{org}/approvals` returns up to 200 requests per page, newest first. Pass `limit` (1–200) and follow `next` as `after` until null to reach older requests. Equal creation timestamps are ordered by UUID. `POST /api/v1/organisations/{org}/approvals/{id}` accepts `{decision:"approved"|"rejected"|"revoked", reason}`. Auditors may read but cannot decide. Pending requests may be approved/rejected; unused approved requests may be revoked. Every decision has a registry-signed record. Approvers are identified by organisation-scoped hashes in exported evidence.
3. Agent calls `POST /api/v1/organisations/approval-consume` with `{approval, grant, request, inputHash}`. Exact request and input must match. Current grant chain, agent/policy state, expiry and approver membership are checked. Atomic state transition permits only one consumer. Used, expired, withdrawn and invalid approvals fail closed. A removed/demoted approver cannot authorize consumption.
4. For organisation-assigned runtimes, the server now requires `authority: {grant,request,approval?}` on `/api/v1/runtime/authorize`. The binding is signed into the permit and stored with it. The server rechecks the complete chain at `/permits/{id}/start` and consumes any required approval before allowing work. Omitting the grant, changing action/resource/input, or reusing approval fails closed. Node `runAuthorizedTask` supplies this binding; do not manually consume an approval before using that method. A separately consumed approval is **not** a resource bearer token. The resource must also enforce a runtime task permit for the same task input. Node `runAuthorizedTask` performs the bound runtime task flow and rechecks authority immediately before the callback. Task outcome records retain the grant/request/approval linkage. If an infrastructure failure occurs after approval consumption but before task start, fail closed and request a new approval; never infer permission from a timeout. Callback code must operate on the bound `input`; server-side policy cannot constrain arbitrary code outside the integration.

`JSON.stringify(input)` in Node determines the input hash. Other languages must hash their exact chosen input bytes; do not silently reserialize between request and execution. Action context is caller-declared, limits are per action, and this version does not enforce a cumulative spend budget. There is an unavoidable interval between a live check and external execution; a receiving resource should repeat checks according to its risk requirements. Cooperative hosts must honor cancellation.

## Operator attestation integration

The website does not turn self-declarations into independently verified companies. A separately onboarded verifier checks legal existence and the representative's authority and signs an Ed25519 JWT with header `{alg:"EdDSA",typ:"vc+jwt",kid:<configured key>}`. Its JSON payload is strictly:

```
{
  "iss": "<trusted verifier identifier>",
  "aud": "<exact FTAI origin>",
  "iat": 0,
  "exp": 0,
  "jti": "<UUID>",
  "organisation": "<organisation UUID>",
  "legalName": "<register name>",
  "country": "FI",
  "registrationNumber": "<Business ID>",
  "evidenceUrl": "https://<verifier evidence reference>",
  "evidenceHash": "<64 lowercase SHA-256 characters>",
  "checks": ["legal-existence", "representative-authority"]
}
```

`iat` and `exp` are Unix seconds, with at most 366 days validity. Platform configuration `FTAI_OPERATOR_VERIFIERS` is a JSON array of `{issuer,kid,jwk}` public keys selected after due diligence; it cannot be modified by tenant administrators. `FTAI_REVOKED_OPERATOR_ATTESTATIONS` is an array of revoked `jti` values. Removing a trust anchor invalidates its attestations. No provider is trusted automatically or fetched from an untrusted URL.

Owners submit `{credential:<JWT>}` to `POST /api/v1/organisations/{org}/verification`. GET returns currently validated status, evidence and expiry; DELETE removes the attestation. Signatures, audience, tenant, required checks, expiry and configured revocation are checked on every status lookup. Without configured independent verification, status remains declared. The platform does not invent a verifier or certify a legal entity. Operator attestation does not itself verify every downstream grant's legal validity.

## Monitoring and assessment

`GET /api/v1/organisations/{org}/monitoring` returns latest 200 signed authority events, 24-hour decision counts, current runtime health and two 24-hour windows of authenticated runtime-reported task outcomes. Failure trend alert: at least 20 results per window and failure fraction increase of at least 0.20. Empty windows display insufficient samples. These metrics can detect changes in reported behavior; they do not independently observe or certify external tool effects. Refresh retrieves current data; there is no implied staffed response or background notification service.

`GET /api/v1/organisations/{org}/assurance` exports the 14-control operator self-assessment plus signed receipt. POST accepts `{control,status,notes,evidenceUrl,evidenceHash}`. Ready-for-review requires both HTTPS evidence reference and SHA-256. Evidence files stay in the customer's approved storage. Notes must not contain secrets. These are preparation controls, not an ISO clause reproduction, certificate or independent audit.

## Privacy and retention

Passport exports include subject approvals and authority events. Passport erasure removes them and dependent grants. Organisation deletion cascades all workspace governance and assessment records. Recipient-held signed exports cannot be recalled. Audit records contain action context and account hashes; minimization, access controls and an operator-approved retention schedule remain necessary. Signed receipt envelopes expire after five minutes for live verification; retained signatures still provide historical integrity evidence and never replace a fresh authorization check.
