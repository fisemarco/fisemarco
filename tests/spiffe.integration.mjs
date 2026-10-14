import { build } from "esbuild";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import assert from "node:assert/strict";
const compiled = await build({
  entryPoints: ["lib/spiffe-verifier.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { verifySvid } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const { privateKey, publicKey } = await generateKeyPair("ES256"),
  jwk = await exportJWK(publicKey),
  id = "spiffe://qa.example/agents/atlas",
  aud = "https://ftai.example/api/v1/runtime/attest";
const settings = {
  bindings: { "FTAI-QA": id },
  bundles: {
    "qa.example": { keys: [{ ...jwk, kid: "qa-1", use: "jwt-svid" }] },
  },
};
let checks = 0;
const pass = (m) => {
  checks++;
  console.log("PASS " + m);
};
const token = async (claims = {}, header = {}) =>
  new SignJWT({
    sub: id,
    aud,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", kid: "qa-1", typ: "JWT", ...header })
    .sign(privateKey);
assert.equal(
  (await verifySvid(await token(), "FTAI-QA", aud, settings)).spiffeId,
  id,
);
pass("JWT-SVID verifies trusted ES256 bundle, subject and audience");
for (const claims of [
  { sub: "spiffe://qa.example/other" },
  { aud: "https://wrong.example" },
  { exp: 0 },
  { exp: Math.floor(Date.now() / 1000) + 4000 },
  { aud: [aud, "https://another.example"] },
])
  await assert.rejects(
    verifySvid(await token(claims), "FTAI-QA", aud, settings),
  );
pass("Wrong subject, audience, expiry and overbroad lifetime are rejected");
for (const header of [
  { jku: "https://evil.example" },
  { typ: "OTHER" },
  { kid: "absent" },
])
  await assert.rejects(
    verifySvid(await token({}, header), "FTAI-QA", aud, settings),
  );
await assert.rejects(
  verifySvid(await token(), "FTAI-QA", aud, {
    ...settings,
    bundles: { "qa.example": { keys: [{ ...jwk, kid: "qa-1", use: "sig" }] } },
  }),
);
await assert.rejects(verifySvid(await token(), "UNBOUND", aud, settings));
pass(
  "Forbidden JOSE headers, non-SVID keys and unapproved workloads are rejected",
);
const other = await generateKeyPair("ES256");
const forged = await new SignJWT({
  sub: id,
  aud,
  exp: Math.floor(Date.now() / 1000) + 300,
})
  .setProtectedHeader({ alg: "ES256", kid: "qa-1" })
  .sign(other.privateKey);
await assert.rejects(verifySvid(forged, "FTAI-QA", aud, settings));
pass("An attacker cannot self-sign a configured workload identity");
console.log(checks + " SPIFFE verification groups passed");
