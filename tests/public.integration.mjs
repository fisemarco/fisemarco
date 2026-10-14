import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import {
  FTAIClient,
  FTAIEnrollmentRequiredError,
  verifyIdentitySeal,
  sha256,
} from "../public/sdk/ftai.mjs";
import { passportCode } from "../lib/scan.ts";
const base = process.env.FTAI_TEST_ORIGIN || "http://localhost:5173";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Only local QA",
);
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const temp = await mkdtemp(join(tmpdir(), "ftai-public-"));
const dbFolder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const dbName = (await readdir(dbFolder)).find((f) =>
  /^[a-f0-9]+\.sqlite$/.test(f),
);
assert.ok(dbName);
const dbPath = join(dbFolder, dbName);
let passed = 0;
const pass = (s) => {
  passed++;
  console.log("PASS " + s);
};
async function req(
  path,
  { method = "GET", body, anonymous = false, token } = {},
) {
  const r = await fetch(base + "/api/v1/" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(token
        ? { Authorization: "Bearer " + token }
        : !anonymous
          ? { Cookie: cookie }
          : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
const unique = "PublicQA-" + randomUUID().slice(0, 8);
const input = {
  name: unique + " Atlas",
  role: "Research analyst",
  organization: "FTAI local QA",
  profile: {
    version: "1.0",
    description: "PRIVATE DESCRIPTION MUST NOT LEAK",
    model: "PRIVATE MODEL",
    skills: ["research"],
    allowed: ["research"],
    endpoint: "https://private.example",
  },
  visibility: "private",
};
const created = await req("agents", { method: "POST", body: input });
assert.equal(created.status, 201);
const code = created.data.agent.code;
assert.equal(
  (await req("directory?q=" + encodeURIComponent(unique), { anonymous: true }))
    .data.total,
  0,
);
pass("private passports excluded from unauthenticated public search");
let full = (await req("agents/" + code)).data;
const birth = full.identity;
assert.ok(verifyIdentitySeal(birth, birth.birthHash));
assert.equal(birth.code, code);
assert.equal(
  (
    await req("agents/" + code, {
      method: "PATCH",
      body: { ...input, visibility: "shared", revision: full.agent.revision },
    })
  ).status,
  200,
);
let listing = (
  await req("directory?q=" + encodeURIComponent(unique), { anonymous: true })
).data;
assert.equal(listing.total, 1);
assert.deepEqual(
  Object.keys(listing.agents[0]).sort(),
  ["code", "name", "organization", "role", "skills", "status"].sort(),
);
assert.ok(!JSON.stringify(listing).includes("PRIVATE"));
pass("listed profile search exposes only approved summary fields");
for (const endpoint of [
  "",
  "/records",
  "/export",
  "/verify",
  "/identity-lock",
  "/did.json",
])
  assert.equal(
    (await req("agents/" + code + endpoint, { anonymous: true })).status,
    401,
    endpoint,
  );
assert.equal(
  (
    await req("verify", {
      method: "POST",
      anonymous: true,
      body: { jws: birth.originalReceipt },
    })
  ).status,
  401,
);
pass(
  "all complete passport, evidence, identity seal and verification APIs require sign-in",
);
assert.equal((await req("directory?q=%25", { anonymous: true })).data.total, 0);
assert.equal(
  (await req("directory?offset=-1", { anonymous: true })).status,
  400,
);
assert.equal(
  (await req("directory?status=anything", { anonymous: true })).status,
  400,
);
pass("directory escapes wildcard input and validates pagination and filters");
const otherKey =
  "ftai_" + randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
const keyId = randomUUID();
execFileSync(process.env.FTAI_TEST_PYTHON || "python3", [
  "-c",
  `import sqlite3,sys,datetime
c=sqlite3.connect(sys.argv[1]);c.execute('INSERT INTO api_keys(id,owner,label,hash,prefix,scope,created,expires) VALUES(?,?,?,?,?,?,?,?)',(sys.argv[2],'other-local-account','Isolation QA',sys.argv[3],'ftai_qa','write',datetime.datetime.now(datetime.timezone.utc).isoformat(),'2099-01-01T00:00:00.000Z'));c.commit()`,
  dbPath,
  keyId,
  sha256(otherKey),
]);
const outsider = await req("agents/" + code, { token: otherKey });
assert.equal(outsider.status, 200);
assert.equal(outsider.data.agent.canEdit, false);
assert.equal(
  (
    await req("agents/" + code, {
      method: "PATCH",
      token: otherKey,
      body: { ...input, revision: 2 },
    })
  ).status,
  404,
);
full = (await req("agents/" + code)).data;
await req("agents/" + code, {
  method: "PATCH",
  body: { ...input, visibility: "private", revision: full.agent.revision },
});
assert.equal((await req("agents/" + code, { token: otherKey })).status, 404);
assert.equal(
  (await req("directory?q=" + encodeURIComponent(unique), { anonymous: true }))
    .data.total,
  0,
);
pass(
  "signed-in readers can open listed passports but cannot edit or open private ones",
);
execFileSync(
  process.env.FTAI_TEST_PYTHON || "python3",
  [
    "-c",
    `import sqlite3,sys
c=sqlite3.connect(sys.argv[1]);code=sys.argv[2]
checks=[("UPDATE agents SET code='FTAI-0000-0000-0000' WHERE code=?",'FTAI_IDENTITY_LOCKED'),("UPDATE agents SET owner='attacker' WHERE code=?",'FTAI_IDENTITY_LOCKED'),("UPDATE agents SET created='2099-01-01' WHERE code=?",'FTAI_IDENTITY_LOCKED'),('DELETE FROM agents WHERE code=?','FTAI_IDENTITY_CANNOT_BE_DELETED'),("UPDATE records SET title='rewritten' WHERE agent=?",'FTAI_LEDGER_IS_APPEND_ONLY'),('DELETE FROM records WHERE agent=?','FTAI_LEDGER_IS_APPEND_ONLY')]
for sql,expected in checks:
 try: c.execute(sql,(code,));c.rollback();raise AssertionError('Mutation was not blocked: '+sql)
 except sqlite3.DatabaseError as e: assert expected in str(e),(sql,str(e));c.rollback()
c.execute('DELETE FROM api_keys WHERE id=?',(sys.argv[3],));c.commit()
print('Six direct SQL mutation attempts blocked')`,
    dbPath,
    code,
    keyId,
  ],
  { stdio: "inherit" },
);
pass(
  "database guards reject identity changes and rewriting or deleting signed history",
);
full = (await req("agents/" + code)).data;
await req("agents/" + code, {
  method: "PATCH",
  body: {
    ...input,
    name: unique + " Atlas v2",
    visibility: "shared",
    revision: full.agent.revision,
  },
});
const after = (await req("agents/" + code)).data;
assert.equal(after.identity.birthHash, birth.birthHash);
assert.equal(after.identity.identityId, birth.identityId);
assert.equal(after.identity.originalReceipt, birth.originalReceipt);
assert.equal(after.agent.name, unique + " Atlas v2");
assert.equal(
  verifyIdentitySeal({ ...birth, birthHash: "a".repeat(64) }, birth.birthHash),
  false,
);
assert.equal(verifyIdentitySeal(birth, "b".repeat(64)), false);
const payload = birth.originalReceipt.split(".");
payload[1] = Buffer.from(JSON.stringify({ modified: true })).toString(
  "base64url",
);
assert.equal(
  verifyIdentitySeal(
    { ...birth, originalReceipt: payload.join(".") },
    birth.birthHash,
  ),
  false,
);
pass(
  "profile evolution preserves original seal and offline verification rejects tampering",
);
const rawUrl = base + "/p/" + code;
const png = PNG.sync.read(
  await QRCode.toBuffer(rawUrl, { width: 350, margin: 2 }),
);
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
assert.equal(decoded.data, rawUrl);
assert.equal(passportCode(decoded.data, base), code);
assert.equal(passportCode(code.toLowerCase(), base), code);
assert.equal(passportCode("https://attacker.example/p/" + code, base), null);
assert.equal(passportCode("javascript:alert(1)", base), null);
assert.equal(
  passportCode("https://localhost:5173.evil.example/p/" + code, base),
  null,
);
pass(
  "real QR decoding accepts registry passports and rejects foreign or script destinations",
);
const missing = new FTAIClient({
  baseUrl: base,
  externalId: "missing-" + randomUUID(),
  name: "Unconfigured runtime",
  role: "QA",
  statePath: join(temp, "missing.json"),
  enrollmentKey: "",
});
await assert.rejects(
  missing.init(),
  (e) =>
    e instanceof FTAIEnrollmentRequiredError &&
    e.code === "FTAI_ENROLLMENT_REQUIRED" &&
    e.setupUrl === base + "/builders",
);
const file = join(temp, "runner-config.json");
await writeFile(
  file,
  JSON.stringify({
    manifest: {
      baseUrl: base,
      externalId: "runner-" + randomUUID(),
      name: "Runner local QA",
      role: "Research assistant",
      statePath: join(temp, "runner.json"),
    },
    task: { taskId: randomUUID(), title: "Runner QA", action: "research" },
  }),
);
const childEnv = { ...process.env };
delete childEnv.FTAI_ENROLLMENT_KEY;
const runnerMissing = spawnSync(
  process.execPath,
  [
    "public/sdk/ftai-runner.mjs",
    "run",
    file,
    "--",
    process.execPath,
    "-e",
    'process.stdout.write("SHOULD_NOT_EXECUTE")',
  ],
  { env: childEnv, encoding: "utf8" },
);
assert.equal(runnerMissing.status, 2);
assert.match(runnerMissing.stderr, /FTAI_ENROLLMENT_REQUIRED/);
assert.ok(!runnerMissing.stdout.includes("SHOULD_NOT_EXECUTE"));
pass(
  "unconfigured agents stop before execution and return a builder setup prompt",
);
const policy = await req("enrollment-policies", {
  method: "POST",
  body: {
    label: unique + " runner",
    organization: "FTAI local QA",
    allowed: ["research"],
    maxAgents: 4,
  },
});
assert.equal(policy.status, 200);
childEnv.FTAI_ENROLLMENT_KEY = policy.data.key;
const run = () =>
  spawnSync(
    process.execPath,
    [
      "public/sdk/ftai-runner.mjs",
      "run",
      file,
      "--",
      process.execPath,
      "-e",
      'if(process.env.FTAI_ENROLLMENT_KEY)process.exit(8);if(!process.env.FTAI_PASSPORT_CODE)process.exit(9);process.stdout.write("REAL_TASK_EXECUTED")',
    ],
    { env: childEnv, encoding: "utf8", timeout: 25000 },
  );
const success = run();
assert.equal(success.status, 0, success.stderr);
assert.match(success.stdout, /REAL_TASK_EXECUTED/);
const duplicate = run();
assert.equal(duplicate.status, 1);
assert.ok(!duplicate.stdout.includes("REAL_TASK_EXECUTED"));
pass(
  "startup runner enrolls, gates real child execution, strips bootstrap secret and blocks duplicates",
);
const manifest = JSON.parse(await readFile(file, "utf8")).manifest;
const c = new FTAIClient(manifest);
await c.init();
assert.match(c.state.birthHash, /^[a-f0-9]{64}$/);
const signed = c._signed.bind(c);
c._signed = async (...args) => {
  const d = await signed(...args);
  if (args[0] === "/api/v1/runtime/me") d.identity.birthHash = "0".repeat(64);
  return d;
};
let executed = false;
await assert.rejects(
  c.runTask(
    { taskId: randomUUID(), title: "Changed birth", action: "research" },
    async () => {
      executed = true;
    },
  ),
  /FTAI_IDENTITY_CHANGED/,
);
assert.equal(executed, false);
c._signed = signed;
await c.close();
pass(
  "runtime pins its original seal and blocks work if the identity root changes",
);
for (const route of [
  "/",
  "/directory",
  "/builders",
  "/trust",
  "/scan",
  "/builder-integration.md",
  "/sdk/ftai-runner.mjs",
]) {
  const r = await fetch(base + route);
  assert.equal(r.status, 200, route);
}
const second = await req("agents", {
  method: "POST",
  body: {
    ...input,
    name: unique + " Nova",
    role: "Operations coordinator",
    visibility: "shared",
  },
});
assert.equal(second.status, 201);
pass("public product routes and downloadable builder kit are served");
console.log(
  JSON.stringify({
    passed,
    publicQAProfiles: [code, second.data.agent.code],
    stateDirectory: temp,
  }),
);
