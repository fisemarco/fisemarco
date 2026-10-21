# M8ven MCP audit repair

21 October 2026. Scope: the three improvement items displayed for `fisemarco/fisemarco` at audited commit `c5360503eee2a784c19582e58a6c51e157c99fd2` (14 October snapshot).

## Repairs

1. **Development SDK advisory.** Pin `@modelcontextprotocol/sdk` to **1.32.1** in package and lockfile. The SDK is imported by interoperability tests, not the production MCP handlers. The reported GHSA-6qxp-vccf-f47h is patched; 1.32.1 also addresses the subsequent task ownership, redirect forwarding, validation memory and bearer audience advisories. No OAuth client credentials or production signing keys were disclosed or rotated by this repair.
2. **Tool annotation detection.** Declare literal annotations on each builder and Intelligence Control tool rather than computing them through a final array map. This makes source-level detection and runtime discovery agree.
3. **Four-hint completeness.** Every builder, signed-agent and browser tool now explicitly declares boolean `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`. There are 25 source declarations, including two definitions of the registry search tool: 21 builder tools, two runtime tools and two browser tools. M8ven counts 24 unique names. Existing `untrustedContentHint` is preserved for browser tools.

Read tools are idempotent. Organisation creation reuses its validated request UUID and assignment upserts the same state; certificate revocation sets the same revoked state. Certificate issuance and version/review writes are conservatively non-idempotent. Assignment, revocation and policy/review changes retain destructive warnings. All tools operate on the Fisemarco store rather than arbitrary external destinations. Annotations are host hints, never authentication or authorization controls. Tenant, role, origin, scope and signed-agent checks are unchanged.

## Executed validation

- `node tests/mcp-annotations.mjs`: PASS, all 25 declarations have four literal booleans, with assertions preserving write/destructive classifications.
- `node tests/mcp-sdk-security.test.mjs`: PASS, two real isolated loopback HTTP servers; a 307 redirect is rejected and the second origin receives zero requests containing a synthetic custom credential/body.
- Builder MCP integration against local native Supabase Auth and mail verification: PASS, actual SDK initialization and 21-tool discovery, concurrent idempotent organisation creation, certificate lifecycle, policy/version conflicts, capability review, strict inputs, tenant isolation and auditor denial. All emitted annotations are checked.
- Standards integration: 11 PASS groups against real local handlers; repeated on isolated PostgreSQL. Includes signed OAuth, resource/audience/origin checks, tool-level scopes, A2A, replay denial, revocation and key rotation. Both emitted runtime tools have four booleans.
- Public repository `npm run check`: PASS (TypeScript, annotation/security regressions and existing authority, graph, motion, intelligence, operator, monitoring, signed database gateway and PostgreSQL groups).
- Production build: PASS. Existing framework deprecation/large-chunk warnings are not treated as security findings.

No production customer data was used or changed. The public-source patch is applied independently to the sanitized distribution; current private deployment configuration and customer evidence are not exported.

## External status and limits

README ownership proof was accepted. The user reports completing M8ven email confirmation. Its public page still showed unclaimed at the last check; verification completion and regrading remain M8ven-controlled. No GitHub monitoring app access was granted. Its C grade explicitly includes a new-project/adoption cap, so resolving source findings does not guarantee an A or 100 score.

A broader npm audit also reports pre-existing development-tool advisories beyond the three M8ven items (including the build/editor/glob/image toolchain). This repair does not claim a globally clean dependency audit. These require separate compatibility assessment; `npm audit fix --force` and suggested major downgrades were not applied. The current MCP SDK itself must have no remaining npm advisory before publication.

## Advisory references

- https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h
- https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-22jm-h49p-29qw
- https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6prh-2h8m-c8cw
- https://modelcontextprotocol.io/specification/2025-11-25/schema#toolannotations
