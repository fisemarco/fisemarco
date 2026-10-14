import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["lib/interop.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { portableProfile, inspectProfile } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const agent = {
  did: "did:web:example.org:agent:1",
  code: "FTAI-0000-0000-0001",
  name: "Test agent",
  role: "Tester",
  organization: "Example",
  status: "active",
  revision: 1,
  updated: "2026-10-01T00:00:00.000Z",
  profile: {
    operator: "",
    skills: ["read"],
    allowed: ["read"],
    denied: ["write"],
  },
};
const p = portableProfile(agent, "https://example.org");
assert.equal(inspectProfile(p).conforms, true);
assert.equal(p.operator.assurance, "declared");
assert.equal(
  inspectProfile({ ...p, operator: { ...p.operator, assurance: "verified" } })
    .conforms,
  false,
);
assert.equal(
  inspectProfile({ ...p, issuer: "javascript:alert(1)" }).conforms,
  false,
);
assert.equal(inspectProfile({ ...p, injected: "trust me" }).conforms, false);
assert.equal(
  inspectProfile({ ...p, lifecycle: { ...p.lifecycle, revision: -1 } })
    .conforms,
  false,
);
assert.equal(inspectProfile({ ...p, status: "revoked" }).conforms, false);
assert.match(
  inspectProfile({ ...p, status: "retired" }).checks[0].detail,
  /refuse/,
);
assert.match(
  inspectProfile({ ...p, authority: { ...p.authority, denied: ["read"] } })
    .checks[2].detail,
  /Conflicting/,
);
assert.equal(inspectProfile(null).conforms, false);
assert.throws(() => portableProfile(agent, "http://example.org"));
console.log(
  "PASS: export, strict schema, unsafe URLs, false assurance, lifecycle and conflicting authority",
);
