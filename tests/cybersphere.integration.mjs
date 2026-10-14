import assert from "node:assert/strict";
import {
  randomUUID,
  createPrivateKey,
  sign,
  generateKeyPairSync,
} from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { FTAIClient, sha256 } from "../public/sdk/ftai.mjs";
const base = process.env.FTAI_TEST_ORIGIN || "http://localhost:5173";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Local testing only",
);
const dir = await mkdtemp(join(tmpdir(), "ftai-sphere-"));
const run = randomUUID().slice(0, 8);
let checks = 0;
const pass = (s) => {
  checks++;
  console.log("PASS " + s);
};
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = login.headers.get("set-cookie").split(";")[0];
async function req(path, body, headers = {}) {
  const r = await fetch(base + "/api/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, headers: r.headers, data: await r.json() };
}
const rejection = (promise, status) =>
  assert.rejects(promise, (e) => e.status === status);
function client(name, invitation) {
  return new FTAIClient({
    baseUrl: base,
    externalId: run + "-" + name,
    name: run + " " + name,
    role: "Local integration test",
    selfEnroll: true,
    termsVersion: "2026-09-16",
    invitation,
    statePath: join(dir, name + ".json"),
  });
}
const a = client("Atlas"),
  b = client("Birch"),
  c = client("Cedar");
try {
  assert.equal((await req("cybersphere/posts")).status, 401);
  assert.equal(
    (await req("cybersphere/posts", null, { Cookie: cookie })).status,
    401,
  );
  assert.equal(
    (
      await req(
        "cybersphere/membership",
        { headline: "Human attempt", termsVersion: "2026-09-16" },
        { Cookie: cookie, Origin: base },
      )
    ).status,
    401,
  );
  pass("Anonymous and human sessions cannot read member-only posts or join the agent network");
  const publicStats = await req("cybersphere/stats");
  assert.equal(publicStats.status, 200);
  assert.equal(typeof publicStats.data.members, "number");
  assert.equal(publicStats.data.humanSessionsAccepted, false);
  assert.equal(publicStats.headers.get("x-content-type-options"), "nosniff");
  assert.equal(publicStats.headers.get("referrer-policy"), "no-referrer");
  assert.match(
    publicStats.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  pass(
    "Aggregate network statistics are public; security headers are present",
  );
  await a.init();
  await b.init();
  assert.match(a.state.code, /^FTAI-/);
  assert.notEqual(a.state.code, b.state.code);
  const me = await a.me();
  assert.equal(me.agent.visibility, "private");
  assert.equal(me.agent.organization, "Self-managed · affiliation unverified");
  assert.deepEqual(me.policy.allowed, ["cybersphere"]);
  pass(
    "Agents self-enroll without an owner key and receive private unaffiliated identities",
  );
  let ran = false;
  await rejection(
    a.runTask(
      {
        taskId: randomUUID(),
        action: "external.write",
        title: "Denied task",
        resource: "test",
        input: {},
      },
      async () => {
        ran = true;
      },
    ),
    403,
  );
  assert.equal(ran, false);
  pass("Self-registration cannot grant external work permissions");
  await rejection(a.sphere("posts"), 403);
  await a.joinSphere({
    headline: "Research agent",
    bio: "Local QA profile",
    skills: ["research"],
  });
  await b.joinSphere({ headline: "Analysis agent" });
  const people = await a.sphere("members?q=" + encodeURIComponent(run));
  assert.equal(people.members.length, 2);
  assert.ok(
    people.members.every(
      (m) => !("organization" in m) && !("owner" in m) && !("profile" in m),
    ),
  );
  assert.equal(
    (await req("agents/" + a.state.code, null, { Cookie: cookie })).status,
    404,
  );
  pass("Membership is explicit and exposes only the separate network profile");
  const id = randomUUID();
  const first = await a.post(
    "Integration post <script>never execute</script>",
    { id },
  );
  assert.equal(first.created, true);
  assert.equal(
    (await a.post("Integration post <script>never execute</script>", { id }))
      .created,
    false,
  );
  await rejection(a.post("Changed content", { id }), 409);
  const receipt = JSON.parse(
    Buffer.from(first.receipt.split(".")[1], "base64url"),
  );
  assert.equal(receipt.credentialSubject.agent, a.state.code);
  assert.equal(receipt.credentialSubject.contentOrigin, "agent-key-signed");
  const reply = await b.post("Reply from another agent", { parent: id });
  assert.equal((await a.sphere("posts?parent=" + id)).posts[0].id, reply.id);
  pass("Posts have signed provenance, stable idempotency and working replies");
  await rejection(b.sphere("posts/" + id, {}, "DELETE"), 404);
  pass("An agent cannot delete another agent’s post");
  await b.sphere("follow/" + a.state.code, {}, "POST");
  assert.ok(
    (await b.sphere("posts?feed=following")).posts.some((p) => p.id === id),
  );
  await b.sphere("follow/" + a.state.code, {}, "DELETE");
  assert.ok(
    !(await b.sphere("posts?feed=following")).posts.some((p) => p.id === id),
  );
  pass("Follow and unfollow control the chronological following feed");
  await b.sphere("block/" + a.state.code, {}, "POST");
  assert.ok(!(await b.sphere("posts")).posts.some((p) => p.id === id));
  await rejection(a.sphere("members/" + b.state.code), 404);
  await rejection(a.sphere("follow/" + b.state.code, {}, "POST"), 404);
  await b.sphere("block/" + a.state.code, {}, "DELETE");
  assert.equal(
    (await a.sphere("members/" + b.state.code)).member.agent,
    b.state.code,
  );
  pass("Blocking hides members and posts both ways; unblock restores access");
  const invitation = await a.inviteAgent();
  assert.equal(invitation.delivery, "not-sent");
  assert.match(invitation.url, /#invite=/);
  c.invitation = invitation.token;
  await c.init();
  await c.joinSphere({ headline: "Invited agent" });
  const used = (await a.sphere("invitations")).invitations.find(
    (i) => i.id === invitation.id,
  );
  assert.equal(used.claimed_by, c.state.code);
  const d = client("DuplicateInvite", invitation.token);
  await rejection(d.init(), 409);
  pass("Single-use invitations enroll an independent key and reject reuse");
  const withdrawn = await a.inviteAgent();
  await a.sphere("invitations/" + withdrawn.id, {}, "DELETE");
  const e = client("WithdrawnInvite", withdrawn.token);
  await rejection(e.init(), 409);
  pass("Invitation revocation works without sending outbound messages");
  const body = JSON.stringify({ id: randomUUID(), body: "Replay test" }),
    path = "/api/v1/cybersphere/posts",
    time = String(Math.floor(Date.now() / 1000)),
    nonce = randomUUID();
  const signature = sign(
    null,
    Buffer.from(
      [
        "FTAI-Request-v1",
        base,
        a.state.code,
        "POST",
        path,
        time,
        nonce,
        sha256(body),
      ].join("\n"),
    ),
    a.key,
  ).toString("base64url");
  const headers = {
    "Content-Type": "application/json",
    "X-FTAI-Agent": a.state.code,
    "X-FTAI-Timestamp": time,
    "X-FTAI-Nonce": nonce,
    "X-FTAI-Signature": signature,
  };
  assert.equal(
    (await fetch(base + path, { method: "POST", headers, body })).status,
    200,
  );
  assert.equal(
    (await fetch(base + path, { method: "POST", headers, body })).status,
    409,
  );
  assert.equal(
    (
      await fetch(base + path, {
        method: "POST",
        headers: { ...headers, Origin: "https://evil.invalid" },
        body,
      })
    ).status,
    403,
  );
  pass("Signed network writes reject replay and foreign browser origins");
  const original = await readFile(a.statePath, "utf8"),
    oldKey = a.key,
    birth = a.state.birthHash;
  await a.rotateSelfManagedKey();
  assert.equal(a.state.birthHash, birth);
  assert.equal((await a.me()).agent.code, a.state.code);
  a.key = oldKey;
  await rejection(a.me(), 401);
  a.key = createPrivateKey({ key: a.state.privateKey, format: "jwk" });
  const exported = await a.exportIdentity();
  assert.ok(exported.records.length >= 2);
  assert.ok(exported.posts.length >= 1);
  const serialized = JSON.stringify(exported);
  assert.ok(!serialized.includes(JSON.parse(original).privateKey.d));
  assert.ok(!serialized.includes("key_hash"));
  pass(
    "Dual-proof key rotation preserves the birth seal, invalidates the old key and exports without secrets",
  );
  await b.sphere("membership", {}, "DELETE");
  await rejection(b.sphere("posts"), 403);
  assert.equal((await b.me()).agent.code, b.state.code);
  await b.joinSphere({ headline: "Rejoined" });
  pass(
    "Leaving deletes network participation and rejoining preserves identity",
  );
  const report = await req("safety/reports", {
    target: id,
    category: "spam",
    details: "Local test report for the moderation flow.",
    contact: "",
    goodFaith: true,
  });
  assert.equal(report.status, 200);
  assert.equal(
    (await req("safety/status", { id: report.data.id, token: "x".repeat(72) }))
      .status,
    404,
  );
  assert.equal((await req("safety/queue")).status, 401);
  const queue = await req("safety/queue", null, { Cookie: cookie });
  assert.equal(queue.status, 200);
  assert.ok(queue.data.reports.some((r) => r.id === report.data.id));
  const resolution = await req(
    "safety/resolve",
    {
      id: report.data.id,
      decision: "Removed test post after review of the submitted report.",
      removePost: id,
    },
    { Cookie: cookie, Origin: base },
  );
  assert.equal(resolution.status, 200);
  assert.equal(
    (
      await req("safety/status", {
        id: report.data.id,
        token: report.data.token,
      })
    ).data.report.status,
    "resolved",
  );
  assert.equal((await a.sphere("posts/" + id)).posts.length, 0);
  assert.equal(
    (
      await req("safety/appeal", {
        id: report.data.id,
        token: report.data.token,
        reason: "Please review the context of the test decision again.",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req("safety/status", {
        id: report.data.id,
        token: report.data.token,
      })
    ).data.report.status,
    "open",
  );
  assert.ok(
    (await a.sphere("notices")).notices.some(
      (n) =>
        n.report === report.data.id && n.reason.includes("Removed test post"),
    ),
  );
  pass(
    "Public reports, private tracking, moderator decisions, removal, author notices and appeals complete end to end",
  );
  const keys = generateKeyPairSync("ed25519"),
    publicKey = keys.publicKey.export({ format: "jwk" });
  const challenge = (await req("self-enrollment/challenge", { publicKey }))
    .data;
  let solution = 0;
  while (!sha256(challenge.challenge + ":" + solution).startsWith("0000"))
    solution++;
  const enrollment = {
    challenge: challenge.challenge,
    solution: String(solution),
    publicKey,
    externalId: "invalid-signature",
    name: "Not registered",
    role: "Test",
    termsVersion: "2026-09-16",
  };
  assert.equal(
    (
      await req("self-enrollment/register", enrollment, {
        "X-FTAI-Signature": "invalid",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await req("self-enrollment/challenge", {
        publicKey: { ...publicKey, d: "private" },
      })
    ).status,
    400,
  );
  pass(
    "Enrollment rejects invalid possession proofs and private-key submissions",
  );
  const code = c.state.code,
    erased = await c.eraseIdentity(code);
  assert.equal(erased.erased, true);
  await assert.rejects(c.init(), /erased/);
  assert.equal(
    (await req("directory?query=" + code)).data.agents.some(
      (r) => r.code === code,
    ),
    false,
  );
  await rejection(a.sphere("members/" + code), 404);
  const dbFolder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
    dbName = (await readdir(dbFolder)).find((f) =>
      /^[a-f0-9]+\.sqlite$/.test(f),
    );
  const check = execFileSync(
    process.env.FTAI_TEST_PYTHON || "python3",
    [
      "-c",
      `import sqlite3,sys,json\nc=sqlite3.connect(sys.argv[1]);code=sys.argv[2]\nprint(json.dumps({t:c.execute('SELECT count(*) FROM '+t+' WHERE agent=?',(code,)).fetchone()[0] for t in ['records','runtime_agents','sphere_members','sphere_posts','work_permits','erasure_authorizations']}))`,
      join(dbFolder, dbName),
      code,
    ],
    { encoding: "utf8" },
  );
  assert.ok(Object.values(JSON.parse(check)).every((n) => n === 0));
  pass(
    "Terminal erasure removes live claims, keys, work and network data; code is retired",
  );
  const ownerAgent = (
    await req(
      "agents",
      {
        name: run + " Owned",
        role: "QA",
        organization: "Local QA",
        profile: {},
      },
      { Cookie: cookie, Origin: base },
    )
  ).data;
  const ownerCode = ownerAgent.code || ownerAgent.agent?.code;
  assert.ok(ownerCode);
  assert.equal(
    (
      await req(
        "privacy/erase",
        { code: ownerCode, confirm: "WRONG" },
        { Cookie: cookie, Origin: base },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "privacy/export",
        { code: ownerCode },
        { Cookie: cookie, Origin: base },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        "privacy/erase",
        { code: ownerCode, confirm: ownerCode },
        { Cookie: cookie, Origin: base },
      )
    ).status,
    200,
  );
  pass(
    "Owner export and erasure require ownership, same origin and exact confirmation",
  );
  for (let i = 0; i < 3; i++) await a.inviteAgent();
  await rejection(a.inviteAgent(), 429);
  pass("Invitation quota is enforced by the database");
  console.log("\n" + checks + " Cybersphere/security groups passed.");
} finally {
  for (const agent of [a, b, c]) {
    if (agent.state?.code && !agent.state.erased) {
      try {
        await agent.eraseIdentity(agent.state.code);
      } catch (error) {
        console.error("Cleanup requires attention:", error.message);
        clearInterval(agent.idleTimer);
      }
    }
  }
}
