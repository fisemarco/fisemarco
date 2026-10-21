# Development dependency hardening

21 October 2026, Europe/Helsinki. The baseline contained **19 affected-package entries: 18 high and one moderate**. These were not 19 independent CVEs; many entries propagated the same braces advisory through build tools.

## Outcome

The final clean install reports **0 npm audit findings** in both the deployed-product source and the independently installed sanitized public distribution. No audit exceptions, severity filtering, `--force`, peer-check bypasses or framework downgrades were applied. Exact patched tool versions and their integrity hashes are committed in the lockfiles. The supported Cloudflare plugin upgrade requires newer Workers types and its own matching Miniflare generation; peer checks and actual native worker tests pass.

The braces advisory has no upstream fixed npm release. It is addressed by a real, explicitly named private local fork (`@fisemarco/braces`, `3.0.3+fisemarco.1`), installed under the compatible `braces` name. This is **not an upstream release**. Registry scanning does not independently establish the security of a local fork. Its security evidence is the depth/node/cycle guards, actual hostile-input tests, resolution checks and all 764 original upstream tests passing. Original MIT licence, author attribution, upstream tag/commit and patch description are preserved in `vendor/braces/`. The local fork needs maintenance until a reviewed upstream release can replace it.

## Every original finding

| Affected package | Baseline severity | Resolution |
| --- | --- | --- |
| `@cloudflare/vite-plugin` | high | 1.64.0; resolves matched Wrangler/Miniflare with fixed image dependencies |
| `@next/eslint-plugin-next` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `@shadcn/registry` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `@ts-morph/common` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `braces` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `eslint-config-next` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `fast-glob` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `hono` | moderate | 4.13.11 |
| `micromatch` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `miniflare` | high | 5.20261012.0-beta, as required by stable Cloudflare Vite plugin 1.64.0 |
| `shadcn` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `sharp` | high | 0.35.5; native librsvg 2.63.2 verified |
| `source-map-js` | high | 1.2.2; malicious indexed offsets rejected in actual consumer |
| `ts-morph` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `vinext` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `vite` | high | 8.3.5 |
| `vite-plugin-commonjs` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `vite-plugin-dynamic-import` | high | Actual bounded-recursion patch in local `@fisemarco/braces`; every consumer resolves to it |
| `wrangler` | high | 4.151.0; matches the stable Cloudflare plugin peer requirement |

## Executed tests and evidence

| Check | Result | Environment/evidence |
| --- | --- | --- |
| Clean locked installs | PASS | Site source and public distribution; normal peer validation |
| Full registry advisories, including dev dependencies | 0 findings | `evidence/dependencies/npm-before.json`, `npm-after.json`, `finding-resolution.json` |
| Hostile pattern/AST, cyclic/repeated nodes, node budget, disabled-limit attempts, real glob matching, malformed source maps, native SVG decoder/version | 39 PASS checks | `tests/dependency-security.test.mjs`; includes actual installed consumer resolution |
| Original upstream brace/parse/compile/expand/regex/Bash compatibility | 764 PASS, 0 fail, 0 skipped | Official tag 3.0.3 tests, real Mocha/Bash runner; `evidence/dependencies/upstream-compatibility.json` |
| Chrome customer journeys on development server | 10 PASS groups | Real local signup/email verification/login, cross-owner shared/private passports, 34 public/account pages, mobile, logos, network/session interruption and logout |
| Same Chrome journeys on compiled Worker | 10 PASS groups | `evidence/dependencies/brand-session.json`; real local Supabase Auth and Mailpit; no fabricated auth responses |
| Administration | 27 PASS groups | Actual HTTP handlers + isolated PostgreSQL + real local Supabase Auth; MFA, owner pin, roles, restrictions, certificate eligibility, moderation, privacy, audit and concurrency; `admin-integration.json` |
| Builder MCP on development and compiled Worker | PASS on both | Actual patched SDK and native signup/mail verification; 21 tools, organisation concurrency, certificates, capabilities, tenant isolation and auditor denial |
| Signed OAuth/MCP/A2A standards | 11 PASS groups on development, compiled Worker and isolated PostgreSQL | Actual tokens, scope/audience denial, replay, revocation, key rotation, A2A and visibility |
| Registry on isolated PostgreSQL | 23 PASS checks | Actual app handlers and SDK |
| Runtime on isolated PostgreSQL | 19 PASS groups | Actual enforcement callback counters, atomic permits, replay, key recovery, real expiry and outage outbox |
| Testnet and public Cybersphere | PASS | Actual isolated PostgreSQL handlers; tenant, visibility, privacy, membership, one-use consumption and agent-only writes |
| Intelligence Control | PASS | Real local native authentication, signed runtime, seven-step loop, actual HTTP provider counters, authority denial, stale policies, approvals, reporting, privacy and withdrawal |
| Existing unit/database/gateway suite | PASS | Authority, graph, motion, intelligence, independent operator credentials, monitoring, signed database gateway and 8 PostgreSQL groups |
| Cross-origin SDK credential forwarding | PASS | Two actual local HTTP servers; redirect denied and second origin receives no credential/body |
| Exact managed-plugin origin and native credential precedence | PASS | Existing principal and canonical-origin regressions; website/native/custom origins remain separate |
| Read recovery and uncertain-write protection | PASS | Actual signature verifier with fresh read nonce; denied credentials and uncertain writes are not retried |
| Compiled bundle interrupted-chunk recovery | PASS | Two real module requests; usable sign-in boundary, no alert, unchanged view query, recovery script before bootstrap |
| Asset retention | PASS | Fresh-build receipt, previous-client retention, registered releases across preparatory builds and hashed-name collision rejection |
| TypeScript and production builds | PASS | Real upgraded Vite/Cloudflare toolchain; Site and public distribution |

These counts describe different suite/check granularities and repeats; they are not summed into an inflated total. Java/Python lifecycle parity and every feature in the historical full audit were not rerun, because those source implementations did not change.

## Reproduced auxiliary build/test issues

- A clean checkout without `dist/` or `.sites-runtime/` failed after compilation when the asset receipt was written. `restoreAssets` now creates its receipt directory. A fresh-filesystem regression reproduces and verifies the fix.
- An older Intelligence Control integration used the retired ChatGPT development login shim and received a genuine 401. Its harness now uses a real synthetic native signup and local verification email, retaining all authorization assertions. The complete actual gateway/enforcement integration passes.
- The previous compiled-asset test required a cache-busting reload URL. Browser request evidence showed the upgraded loader instead recovering internally after exactly one retry, with no page error and the protected sign-in gate intact. The test now waits for that user-visible outcome while retaining exact request-count, query, session and alert assertions. No production recovery/security behavior was weakened.
- Early harness runs also caught wrong local file resolution, an absent local provider status file and explicit local Worker environment injection. They were corrected in isolated fixtures and the affected tests rerun. The original unmodified braces stack overflow was reproduced with a 4,000-level pattern under its character limit; the patched package rejects it with a controlled syntax error before recursive work.

## Isolation, build warnings and release state

All writes/tests used disposable local D1/PostgreSQL data, synthetic accounts and the local mail catcher. Hosted customer records, schema, global authentication policy, signing issuer and production environment were not changed. Local credentials and synthetic trace archives are not exported into the public repository. Registry/library patching changes development tooling and necessary transitive versions; the application feature code and SDK contracts are preserved.

Builds emit existing framework/middleware/chunk-size warnings and new sourcemap diagnostics from upstream RSC/Vinext transforms under the patched bundler. These concern debugging metadata; actual compiled-browser, SDK and Worker execution passed. They are not hidden and do not establish that every possible platform/browser deployment is error-free.

The release is prepared for explicit production approval. Live site/plugin baseline remains version 62 until approved. After deployment, verify the actual installed plugin, live tool annotations, anonymous/forged-header denial, homepage/pages and browser assets using read-only production checks. A local test pass does not substitute for that final live verification.
