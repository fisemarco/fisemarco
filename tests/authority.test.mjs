import assert from "node:assert/strict";
import { build } from "esbuild";
const out = await build({
  entryPoints: ["lib/authority.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { constraintsSchema, attenuates, evaluateAuthority, inspectChain } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(out.outputFiles[0].text).toString("base64")
  );
const now = Date.now();
const c = {
  actions: ["buy"],
  resources: ["supplier:1"],
  countries: ["FI"],
  currency: "EUR",
  maxAmountMinor: 10000,
  approvalAboveMinor: 5000,
  mayDelegate: true,
};
const root = {
  id: "root",
  organisation: "org",
  parent: null,
  subject: "a",
  constraints: JSON.stringify(c),
  expires: new Date(now + 60000).toISOString(),
  revoked: 0,
};
const child = {
  ...root,
  id: "child",
  parent: "root",
  subject: "b",
  constraints: JSON.stringify({ ...c, maxAmountMinor: 7000 }),
};
const request = {
  action: "buy",
  resource: "supplier:1",
  country: "FI",
  currency: "EUR",
  amountMinor: 4000,
};
assert.equal(evaluateAuthority([child, root], request, now).decision, "ALLOW");
assert.equal(
  evaluateAuthority([child, root], { ...request, amountMinor: 6000 }, now)
    .decision,
  "ESCALATE",
);
for (const patch of [
  { amountMinor: 7001 },
  { resource: "supplier:2" },
  { country: "EE" },
  { currency: "USD" },
  { action: "delete" },
])
  assert.equal(
    evaluateAuthority([child, root], { ...request, ...patch }, now).decision,
    "DENY",
  );
assert.equal(
  evaluateAuthority([child, { ...root, revoked: 1 }], request, now).decision,
  "DENY",
);
assert.equal(
  evaluateAuthority([child, root], request, now + 60001).decision,
  "DENY",
);
assert.ok(inspectChain([child], now));
assert.ok(inspectChain([child, { ...root, organisation: "other" }], now));
assert.equal(attenuates(c, { ...c, maxAmountMinor: 10001 }), false);
assert.equal(attenuates(c, { ...c, approvalAboveMinor: 5001 }), false);
assert.equal(attenuates({ ...c, mayDelegate: false }, c), false);
assert.equal(
  constraintsSchema.safeParse({ ...c, approvalAboveMinor: 10001 }).success,
  false,
);
assert.equal(
  evaluateAuthority(
    [{ ...root, constraints: JSON.stringify({ ...c, requireApproval: true }) }],
    { ...request, amountMinor: 0 },
    now,
  ).decision,
  "ESCALATE",
);
assert.equal(
  attenuates({ ...c, requireApproval: true }, { ...c, requireApproval: false }),
  false,
);
console.log(
  "PASS authority: bounded grants, attenuation, escalation, parent revocation, expiry, missing/foreign parents and request isolation",
);
