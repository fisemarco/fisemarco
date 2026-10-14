import assert from "node:assert/strict";
Error.stackTraceLimit = 0;
import { build } from "esbuild";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
const out = await build({
  entryPoints: ["lib/operator-credentials.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { validateOperatorCredential } = await import(
  "data:text/javascript;base64," +
    Buffer.from(out.outputFiles[0].text).toString("base64")
);
const pair = generateKeyPairSync("ed25519"),
  issuer = "independent-fixture",
  kid = "test-key",
  org = randomUUID(),
  origin = "https://ftai.example",
  now = Math.floor(Date.now() / 1000);
const payload = {
  iss: issuer,
  aud: origin,
  iat: now,
  exp: now + 3600,
  jti: randomUUID(),
  organisation: org,
  legalName: "Fixture only",
  country: "FI",
  registrationNumber: "fixture",
  evidenceUrl: "https://verifier.example/evidence",
  evidenceHash: "a".repeat(64),
  checks: ["legal-existence", "representative-authority"],
};
const trust = [{ issuer, kid, jwk: pair.publicKey.export({ format: "jwk" }) }];
function jwt(p, header = { alg: "EdDSA", typ: "vc+jwt", kid }) {
  const value = [header, p]
    .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
    .join(".");
  return (
    value +
    "." +
    sign(null, Buffer.from(value), pair.privateKey).toString("base64url")
  );
}
assert.equal(
  (await validateOperatorCredential(jwt(payload), org, origin, trust, []))
    .legalName,
  "Fixture only",
);
for (const p of [
  { ...payload, exp: now - 1 },
  { ...payload, iat: now + 1000 },
  { ...payload, exp: now + 400 * 86400 },
  { ...payload, aud: "https://other.example" },
  { ...payload, organisation: randomUUID() },
  { ...payload, checks: ["legal-existence", "legal-existence"] },
])
  await assert.rejects(
    validateOperatorCredential(jwt(p), org, origin, trust, []),
  );
await assert.rejects(
  validateOperatorCredential(jwt(payload), org, origin, [], []),
);
await assert.rejects(
  validateOperatorCredential(jwt(payload), org, origin, trust, [payload.jti]),
);
await assert.rejects(
  validateOperatorCredential(
    jwt(payload, { alg: "none", typ: "vc+jwt", kid }),
    org,
    origin,
    trust,
    [],
  ),
);
console.log(
  "PASS independent operator credentials: trusted signature, wrong issuer, algorithm, tenant, audience, required checks, time bounds and revocation",
);
