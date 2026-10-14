# FTAI SDKs

## Supported scope

| Client | Scope | Dependencies |
|---|---|---|
| Node `ftai.mjs` | Enrollment, identity continuity, runtime permit lifecycle, approval/delegation, outcome outbox, Cybersphere | Node 22+, standard library |
| Python `python/ftai.py` | Exact-byte signed transport, authority, delegation, approvals, task permit operations | Python 3.10+, `pip install -r requirements.txt` |
| Go `go/ftai.go` | Context-aware signed transport, authority, delegation, approvals | Go 1.23+, standard library |
| Java `java/FTAIClient.java` | Signed transport, authority, delegation, approvals; caller supplies exact JSON | Java 17+, standard library |
| Node `testnet.mjs` | Isolated disposable test identities and permits | Node 22+, standard library |

The standalone transport clients in Python, Go and Java operate an already enrolled Ed25519 identity. They do not silently enroll, persist private keys, implement the Node outcome outbox, or run tool callbacks. Use their signed `request` method for other documented runtime endpoints. Provision enrollment through the Node SDK or the wire protocol in `/runtime-protocol.md`. Never share a private key across simultaneously active independent agents; a language adapter is for the same controlled runtime identity.

All clients require HTTPS except loopback. Additional protocol clients refuse signed-request redirects, use fresh nonces, sign exact UTF-8 bytes and apply timeouts. A transport success is not an ALLOW decision; inspect the result and enforce it. Retries after a task has started must report the outcome, never execute work again.

## Node exact-input approval

```js
import { FTAIClient, sha256 } from './ftai.mjs';
const agent = new FTAIClient({baseUrl:process.env.FTAI_BASE_URL,enrollmentKey:process.env.FTAI_ENROLLMENT_KEY,externalId:'stable-runtime-id',name:'Procurement agent',role:'Procurement'});
await agent.init();
const request={action:'procurement.purchase',resource:'supplier:1',country:'FI',currency:'EUR',amountMinor:6000};
const input={purchaseOrder:'PO-123'};
const pending=await agent.requestApproval(grantId,request,sha256(JSON.stringify(input)));
// Wait for a real administrator to review pending.id in the governance centre.
// Then, using a stable UUID taskId:
await agent.runAuthorizedTask({grant:grantId,request,approval:pending.id,input,taskId,title:'Approved purchase'},async({input,signal})=>{
  // Call your protected resource with this exact input, honoring signal.
});
```

The callback is application code, not an FTAI-provided purchasing integration. Do not connect test/example code to a real payment system. An approval is one-use and input-bound; runtime/resource policy still applies. Organisation-assigned runtimes must pass authority in the server task-permit request; the server consumes required approval at task start. Do not call consumeApproval manually before runAuthorizedTask. Parent agents call `delegateAuthority(parent,subject,constraints,expires)` to issue narrower grants with their own signed proof.

## Python

```python
from ftai import FTAIClient
client = FTAIClient(origin, personnel_code, private_seed_bytes)  # 32 bytes from your secret store
identity = client.me()
result = client.check_authority(grant_id, action_dict)
```

## Go

Download `ftai.go` and `go.mod` into your local module (or copy the package into your application's internal source). Use `ftai.New(origin, code, ed25519PrivateKey)`, then `CheckAuthority(context, grant, request)`. Return values are JSON raw messages; decode and check the decision before execution. The local module name is not a published package-registry address.

## Java

Compile `javac FTAIClient.java`. Construct `new FTAIClient(origin, code, pkcs8PrivateKeyBytes)`. `checkAuthority(json)` accepts exact JSON with `grant` and `request`. Parse responses with your application's chosen JSON library and check the decision. There is no implicit Maven distribution or dependency installation.

## Tests

Source includes `tests/sdk-interoperability.mjs`: Python/Go/Java clients send GET and Unicode POST bodies to a local Ed25519 verifier. Runtime, organisation and testnet integration tests separately exercise actual server routes. No SDK certification or external interoperability endorsement is implied.


## Complete lifecycle adapters

For full lifecycle support use `python/lifecycle.py`, `go/lifecycle.go` or `java/FTAILifecycle.java` with `lifecycle-bridge.mjs` and `ftai.mjs`. They run the same Node 22+ engine through private local pipes: enrollment, persistent state and trust pinning, cooperative task gates, cancellation, approvals/delegation, rotations, outcome outbox, export/erase and Cybersphere. These are shared-engine adapters, not Node-free native reimplementations. See [lifecycle guide](/sdk/lifecycle-guide.md). Download the complete bundle at `/integrations/ftai-sdks.zip`.
