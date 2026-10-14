> Governance 1.1 adds agent-issued delegation, exact-task approvals, monitoring and verifier integration. See [governance protocol](./governance-protocol.md) for the current extensions.

# FTAI organisation and authority profile 0.1

Experimental implementation, 2026-10-01. Organisation names and root authority are administrator declarations, not independent legal verification. This extends FTAI's existing identity and runtime profile; it is not an approved international standard.

## Workspace and tenancy

`/enterprise` provides organisation creation, workforce assignment, A1–A7 classification, team labels, one-time invitations, members, bounded grants, chain inspection and decision simulation. Owners manage membership; administrators manage workforce and grants; auditors read the organisation. All human endpoints require the hosting platform's authenticated session. Browser mutations require the same origin. API keys do not authorise human organisation administration.

Assigning a passport requires its current owner's account and an organisation administrator role. One passport can be assigned to one organisation. Assignment shares only a workforce summary; it does not transfer passport ownership or expose private records to colleagues. A1 assistant, A2 autonomous agent, A3 employee, A4 service, A5 sub-agent, A6 agentic system, A7 collective/swarm are declared classifications, not assurance levels.

## Human API

All paths start `/api/v1/organisations`.

| Method/path | Input / result |
| --- | --- |
| GET / | List current memberships |
| POST / | `{name}` creates workspace and owner membership atomically |
| POST /join | `{token}` consumes an unexpired, one-time invitation |
| GET /{org} | Summary, workforce, members, first 200 grants and nextGrantCursor |
| GET /{org}/grants | Paginated grants; limit 1–200, follow next as after |
| POST /{org}/invitations | `{role:"admin" or "auditor"}`; owner only; returns token once, 24-hour expiry; no delivery |
| DELETE /{org}/invitations/{id} | Revoke invitation; owner only |
| DELETE /{org}/members/{id} | Remove pseudonymous member; owner cannot be removed |
| POST /{org}/agents | `{agent,classification,team}`; existing passport owner must assign |
| DELETE /{org}/agents/{code} | Remove assignment and revoke its grants |
| POST /{org}/grants | `{subject,parent:null or grant UUID,constraints,expires}` |
| DELETE /{org}/grants/{id} | Revoke; descendant live checks fail |
| POST /{org}/evaluate | `{grant,request}`; simulation, never an execution permit |
| DELETE /{org} | `{confirm:org UUID}`; owner only; removes organisation data, retains individually owned passports |

## Constraints and attenuation

`constraints` contains `actions`, `resources` and `countries` nonempty arrays; `currency`; integer `maxAmountMinor` and `approvalAboveMinor`; and boolean `mayDelegate`. Optional `requireApproval` defaults to false; when true, every action requires exact-task human approval, including zero-value operations. A delegated child cannot disable a parent's unconditional approval requirement. Resource/action labels match exactly with no wildcards. Country labels use two uppercase letters; currency uses three. These syntactic codes are caller-supplied declarations. Amounts are minor units, for example EUR 10000 is EUR 100. Limits are per action, not a cumulative budget, payment reservation or guarantee of a supplier's location. The receiving tool must obtain trustworthy request context.

Child constraints must be subsets of the parent, use the same currency, never increase either monetary threshold and expire no later. Parents must allow delegation. Chains have at most eight grants and cannot repeat a subject. Issuance is currently performed by an authorised organisation administrator; it is not a signature from the parent agent or a legally verified human delegation. Grants are immutable except revocation; replace a grant to change scope.

## Runtime authority check

POST `/api/v1/organisations/authorize` with `{grant,request}` signed using the exact existing `FTAI-Request-v1` protocol. Only the grant's subject runtime can request the decision. `request` contains `action`, `resource`, `country`, `currency`, and integer `amountMinor`.

The service validates current runtime key proof, chain links and attenuation, every ancestor's lifecycle and organisation assignment, revocation/expiry, and the subject's runtime-policy and passport allow/deny actions. A result contains ALLOW, DENY or ESCALATE, reason, chain IDs, request context, checkedAt, `operatorAssurance` (declared or independently-attested status), `executionPermit:false` and a registry-signed five-minute receipt. Verify the issuer independently and bind the result to the same request and actor. Do not use the receipt as a bearer token or a reusable permission.

The authority check is a point-in-time decision, not a transaction with an external system. A resource-side integration must require ALLOW, enforce the existing task-permit gate, check its own permissions and execute only the bound action. An ESCALATE response blocks work until the exact-task approval is granted and consumed through the governance API. DENY cannot be overridden. Agent-issued child delegation is available through the signed delegate endpoint. Avoid check/use gaps; repeat live checks at execution where required. Revocation applies to resources that enforce the integration.

## Evidence and privacy

Grant exports contain the declared constraints and a signed issuance receipt, with no raw task document. Receipt expiry does not delete the grant; subsequent decisions use live registry state. Store independent receipt copies if you need audit evidence. The registry has not implemented an independent transparency log or full enterprise action-proof graph.

Deleting an organisation deletes memberships, outstanding invitations, assignments and grants. Passport erasure deletes its assignment and grants, cascading to child grants; this invalidates their chains. Ordinary passport export remains distinct from organisation records. Organisation members see their own organisation's pseudonymous membership list, never raw account IDs. Review existing privacy drafts and establish company retention/processing terms before a personal-data pilot.
