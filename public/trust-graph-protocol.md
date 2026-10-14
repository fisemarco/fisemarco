# FTAI trust graph v1

The organisation graph is an authenticated, typed read model of the live registry. It is not a reputation score, social endorsement or permission to execute.

## Query and export

`GET /api/v1/organisations/{id}/graph?kind=agents&limit=100&after=...`

Requires current organisation membership. All three organisation roles may read shared organisation relationships. Private passport records, permits, runtime details and outgoing network links additionally require passport ownership; assigning a passport does not grant that access. The hosted MCP `ftai_trust_graph` tool applies the same membership check. Agent machine tokens do not grant access to an organisation's private graph.

Collections: agents, members, grants, approvals, permits, records, events, attestations, controls, certificates, workloads, connections. Follow `next` as `after` until null, then fetch the next collection. Limits 1–200; default 100. IDs use `kind:source-id`. The member node ID hashes the organisation and account identifier; raw account IDs and invitation/enrollment/token secrets are excluded. Pseudonyms remain personal data where re-identifiable.

Nodes have id, kind, label, status, provenance, details. Edges have id, from, to, relation, status, provenance and optional signed evidence. Referenced nodes are stubs resolved by another page or collection. Do not confuse a stub's `referenced` state with an active or verified relationship. The explorer provides selection, filtering, incoming/outgoing links, cycle-safe traversal to depth eight, continuation and signed-page download. Choose Complete organisation graph to load all permitted collections, or stop loading to retain an explicitly partial view.

Each response contains a five-minute Ed25519 VC-JWT receipt. Its credential subject includes the exact page and SHA-256 of JSON.stringify(page without receipt). Verify against the pinned registry public key and check issuer, signature, expiry, page hash, organisation and intended source. A valid snapshot signature authenticates what the registry reported at observedAt; it does not independently verify reported facts. Signed source receipts remain available on edges.

## Meaning of relationships

- assigns: organisation administrator assigned the passport to its workforce; legal employment is not independently proven.
- controls-key: enrollment proved control of a runtime key; this is not proof of a nonhuman actor.
- governs: configured runtime policy, with current policy state.
- member:role: current authenticated account role; no legal appointment inferred.
- issues-root / delegates / authorizes: recorded authority constraints, with complete ancestor expiry/revocation/attenuation checks. Agent lifecycle, runtime policy, exact request and required approvals still need live execution checks.
- requires-approval / decides / approves-for / consumed-for: exact-input human decision and permit linkage. Approval states and expiry remain significant.
- executes / reports-outcome / records: permit and signed record relationships; outcomes are runtime reports, not independent performance measurements.
- decision: a registry-observed authority decision.
- attests-operator: imported third-party evidence; requires live configured-trust-anchor validation in the verification service.
- assesses / references: self-assessment and evidence hash/URL. FTAI does not download or certify referenced content.
- certifies: FTAI technical certificate issuance; `issued` in the graph requires a separate live certificate-status check, not automatic acceptance.

## Boundaries

Every query applies the organisation predicate before pagination. Graph pages are live reads, not a transactionally consistent multi-page historical snapshot; mutations during traversal can change results. Refresh for current status. Export only necessary pages and protect downloaded evidence. Erasure and organisation deletion remove affected graph relationships; retained recipient copies require their own retention controls.

`POST /api/v1/organisations/{id}/handshake` with `{grant}` combines complete current delegation ancestry and technical runtime-identity assessment. It returns executionAuthorized:false. Resource execution must separately use the authority decision, exact-input approvals and one-use runtime permit. No graph path can bypass those controls.


Additional typed edges cover uses-model and declares-capability (owner declarations), scopes-resource and scopes-action (grant constraints), birth-record and commits-to/previous-record (genesis and hash continuity), recorded SPIFFE workload attestations, and Cybersphere follows. A follow is not an endorsement. Blocks and private messaging are not exposed. Model identifiers and capabilities remain declarations, not verified provider relationships or benchmark results.

`/sdk/graph.mjs` supplies `verifyGraphPage(page, {issuer,kid,publicKeyJwk,organisation})` for Node 22+. Obtain the key through your own trust policy; do not trust a key merely because it appears beside an export. Expired page receipts require a fresh export for current-time verification. Historical source evidence and independently retained snapshots have different retention and verification requirements.
