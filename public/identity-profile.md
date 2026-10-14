# FTAI portable identity profile 0.1

Status: experimental FTAI draft, 2026-10-01. This is not an approved international standard, a legal identity, or a grant of access. Independent implementations may experiment with this format; compatibility requires the rules below. Governance, licensing of the wider protocol, external issuer recognition and standards adoption remain separate work.

## Obtain a profile

GET `/api/v1/agents/{code}/profile` with your existing authenticated session or scoped read API key. The existing passport access policy applies: anonymous requests are rejected; private passports require their owner. This endpoint does not publish an identity or change visibility. The response is an unsigned snapshot. The credential link points to the existing signed passport export and retains its authentication rules.

## Required fields

Download [the JSON Schema](/identity-profile.schema.json). Enable format assertions in your validator. The reference workbench also applies URL parsing and UTC timestamp checks. Whitespace in text fields is trimmed by the reference parser before length checks.

All objects reject unknown keys. Version 0.1 uses the exact `profileVersion` value `ftai.identity/0.1`. Text fields must contain 1–200 characters after trimming. Arrays have at most 100 such strings. URLs must use HTTPS and contain at most 2,048 characters. HTTP is allowed only for localhost, 127.0.0.1 and [::1] development URLs, never remote deployment.

| Field | Requirement | Meaning |
| --- | --- | --- |
| profileVersion | `ftai.identity/0.1` | Draft profile version |
| id | Nonempty text | Identifier scoped to its issuer; not a global legal identity |
| name, role | Nonempty text | Declared display name and role |
| type | agent, employee, assistant, service, swarm | Declared category; current registry exports use agent |
| status | active, suspended, retired | Reported lifecycle state |
| issuer | HTTPS URL | Registry origin; supplied URL is not a trust anchor |
| operator | name and assurance=`declared` | Claimed operator; not verified ownership |
| capabilities | Text array | Claimed technical capabilities |
| authority | allowed and denied text arrays; assurance=`declared` | Declared scope labels; not delegation or resource authorization |
| lifecycle | Nonnegative integer revision; updated UTC ISO datetime | Snapshot revision and timestamp |
| references | passport and credential HTTPS URLs | Access-controlled supporting resources |

The public `/framework` workbench runs the reference structural validator locally in the browser and exports its report. It never fetches references. Valid input does not prove key possession, issuer trust, legal authority, capability, permission, safety or current status.

## Receiving system requirements

1. Establish trust in the issuer independently. Never auto-trust a URL or key supplied by an agent.
2. Verify the signed credential, audience and expiration using the intended credential profile. Bind the credential subject to this profile identifier and compare its revision.
3. Challenge the agent to prove possession of its current enrolled key.
4. Obtain current lifecycle and key-revocation status. Reject suspended or retired identities and fail closed if required status is unavailable.
5. Independently verify any operator or delegation needed for the operation. Version 0.1 contains no such proof.
6. Apply resource-local authorization. Denial takes precedence; undeclared or ambiguous actions are not authorized. Capabilities do not confer authority.
7. Record the decision with minimum necessary data. Do not publish a private passport or copy sensitive work history merely to establish identity.

## Relationship to other work

The profile complements the existing FTAI signed-credential, A2A, MCP and runtime protocols; it does not replace their authentication. No automatic federation, national identity bridge, eIDAS qualification or ITU endorsement is implemented.

Relevant ecosystem sources: [Estonian Government](https://www.valitsus.ee/en/news/prime-minister-michal-estonia-become-first-country-create-digital-identities-ai-agents) and [ITU FG-TIDA](https://www.itu.int/en/ITU-T/focusgroups/tida/Pages/default.aspx).

## Pilot acceptance

Connect one builder and one receiving service. Demonstrate successful identity exchange, a rejected forged signature, denied excessive authority, revocation stopping work, and privacy-preserving audit records. Measure integration time, successful verification rate and authorization failures. Directory entries and fictional examples are not active pilots or verified identities.
