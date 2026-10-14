# FTAI Testnet v1

The hosted testnet is a bounded integration sandbox for signed enrollment, authority constraints, one-use permits and revocation. It is not a full production mirror or a security certification. Production API conformance, organisation approvals and Cybersphere are exercised by the local integration suites.

- Separate tables, `FTAI-TEST-<UUID>` identifiers and signature message domains.
- Receipts carry `aud: FTAI-TESTNET-ONLY`, `environment: testnet`, `productionValid: false`, a `:testnet` issuer suffix and `-testnet` key ID suffix. Never accept them as production credentials.
- Max 10 spaces per owner, 20 identities per space and 200 permits per identity. Space access expires after seven days; its records remain until the owner deletes them. Test permits expire after 60 seconds.
- Use synthetic data only. No real payments, human records, secrets or production system actions.

## Owner flow

Sign in at `/testnet`, create a space with exact allowed action/resource/country/currency and maximum per action. Save the enrollment key shown once. Revocation and cascading test-space deletion are available in the same screen. Signed-in owners can also use `/api/v1/testnet/spaces` GET/POST and `/{id}` GET/DELETE, or `/{id}/revoke` POST with `{agent}`.

## Agent flow (Node 22+)

Download `/sdk/testnet.mjs`, then:

```js
import { FTAITestnet } from './testnet.mjs';
import { randomUUID, createHash } from 'node:crypto';
const client = new FTAITestnet(process.env.FTAI_BASE_URL, process.env.FTAI_TESTNET_KEY);
await client.enroll('Synthetic integration agent');
const body = {
  taskId: randomUUID(),
  request: { action:'document.read', resource:'test-document:1', country:'FI', currency:'EUR', amountMinor:0 },
  inputHash: createHash('sha256').update('{}').digest('hex')
};
const permit = await client.request('authorize', body);
if (permit.decision !== 'ALLOW') throw Error('Test authority denied');
await client.request('consume', body);
// A second consumption must fail. Nothing here executes an external tool.
```

This client creates an ephemeral key pair in memory. Each new instance enrolls a new disposable test identity; persistent production identities use the runtime SDK instead.

## Wire format

POST `/api/v1/testnet/enroll`, bearer test-space enrollment key, body `{name, publicKey:{kty:"OKP",crv:"Ed25519",x:<base64url>}}`. Sign newline-separated `FTAI-Testnet-Enrollment-v1`, exact origin, SHA-256 of exact UTF-8 body. Pass base64url signature in `X-FTAI-Signature`.

POST `/api/v1/testnet/authorize` or `/consume` with `{taskId,request,inputHash}` and runtime headers `X-FTAI-Agent`, `X-FTAI-Timestamp`, `X-FTAI-Nonce`, `X-FTAI-Signature`. Sign newline-separated `FTAI-Testnet-Request-v1`, origin, agent code, method, pathname+query, Unix seconds, random UUID nonce, SHA-256 body. Proofs must be within 60 seconds and cannot replay. ALLOW may issue or consume a test permit; DENY and ESCALATE never do. Revoked identities cannot obtain or consume permits.
