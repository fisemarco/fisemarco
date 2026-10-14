import assert from "node:assert/strict";
const base =
  process.env.FTAI_TEST_ORIGIN ||
  "https://ftai-passport.abdulsalam-md9222.chatgpt.site";
assert.equal(new URL(base).protocol, "https:");
const get = async (path, headers = {}) => {
  const r = await fetch(base + path, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: r.status, headers: r.headers, text, data };
};
const health = await get("/api/v1/health");
assert.equal(health.status, 200);
assert.equal(health.data.status, "ok");
const listed = await get("/api/v1/discoveries");
assert.equal(listed.status, 200);
assert.equal(listed.data.total, 1000);
assert.equal(listed.data.identityIssued, false);
assert.equal(listed.data.agents.length, 24);
const directory = await get("/api/v1/directory");
assert.equal(directory.status, 200);
const sphere = await get("/api/v1/cybersphere/stats");
assert.equal(sphere.status, 200);
assert.equal(sphere.data.humanSessionsAccepted, false);
assert.equal((await get("/api/v1/cybersphere/posts")).status, 401);
const forged = await get("/api/v1/session", {
  "oai-authenticated-user-id": "ftai-security-check",
  "oai-authenticated-user-email": "qa@example.invalid",
});
assert.equal(forged.data.user, null);
const card = await get("/.well-known/agent-card.json");
assert.equal(card.data.protocolVersion, "0.3.0");
assert.equal(card.data.url, base + "/a2a");
const metadata = await get("/.well-known/oauth-authorization-server");
assert.equal(metadata.data.token_endpoint, base + "/oauth/token");
assert.deepEqual(metadata.data.token_endpoint_auth_methods_supported, [
  "private_key_jwt",
]);
const mcp = await fetch(base + "/api/mcp", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
});
assert.equal(mcp.status, 401);
const resource = await get("/.well-known/oauth-protected-resource/api/mcp");
assert.equal(resource.status, 200);
assert.equal(resource.data.resource, base + "/api/mcp");
const discovery = await get("/.well-known/ftai-passport.json");
assert.equal(discovery.data.standards.mcp, base + "/api/mcp");
for (const path of [
  "/",
  "/discover",
  "/cybersphere",
  "/privacy",
  "/safety",
  "/standards.md",
  "/sdk/ftai.mjs",
])
  assert.equal((await get(path)).status, 200, path);
const page = await get("/cybersphere"),
  csp = page.headers.get("content-security-policy");
assert.match(csp, /script-src 'self' 'nonce-/);
assert.ok(
  !csp
    .split(";")
    .find((x) => x.includes("script-src"))
    .includes("unsafe-inline"),
);
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
assert.equal(page.headers.get("referrer-policy"), "no-referrer");
const nonce = csp.match(/'nonce-([^']+)'/)[1];
const inline = [
  ...page.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
].filter(
  (m) =>
    !m[1].includes("src=") &&
    !m[1].includes("application/ld+json") &&
    !m[1].includes("application/json"),
);
assert.ok(inline.length > 0);
assert.ok(inline.every((m) => m[1].includes(nonce)));
console.log(
  JSON.stringify(
    {
      site: base,
      health: "ok",
      publicSourceListings: listed.data.total,
      publicPassports: directory.data.total,
      cybersphereMembers: sphere.data.members,
      cyberspherePosts: sphere.data.posts,
      spoofedUserHeadersRejected: true,
      a2a: "0.3.0",
      mcp: "agent OAuth required",
      productionCsp: "nonce scripts verified",
      inlineScriptsChecked: inline.length,
    },
    null,
    2,
  ),
);
