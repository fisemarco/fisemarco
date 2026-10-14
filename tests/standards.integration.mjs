import assert from "node:assert/strict";
import { randomUUID, sign } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FTAIClient } from "../public/sdk/ftai.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const base = process.env.FTAI_TEST_ORIGIN || "http://localhost:5173";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const dir = await mkdtemp(join(tmpdir(), "ftai-standards-"));
let passed = 0;
const pass = (m) => {
  passed++;
  console.log("PASS " + m);
};
const agent = new FTAIClient({
  baseUrl: base,
  externalId: "standards-" + randomUUID(),
  name: "Local standards QA",
  role: "Protocol testing",
  selfEnroll: true,
  termsVersion: "2026-09-16",
  statePath: join(dir, "identity.json"),
});
let client;
const json = async (path, body, token, extra = {}) => {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    headers: r.headers,
    data: await r.text().then((t) => {
      try {
        return JSON.parse(t);
      } catch {
        return { text: t };
      }
    }),
  };
};
try {
  await agent.init();
  const metadata = (await json("/.well-known/oauth-authorization-server")).data;
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, [
    "private_key_jwt",
  ]);
  assert.deepEqual(metadata.grant_types_supported, ["client_credentials"]);
  const resource = (await json("/.well-known/oauth-protected-resource/api/mcp"))
    .data;
  assert.equal(resource.resource, base + "/api/mcp");
  assert.equal(
    (await json("/api/mcp", { jsonrpc: "2.0", id: 1, method: "ping" })).status,
    401,
  );
  pass(
    "OAuth discovery advertises agent client credentials and protected MCP rejects anonymous access",
  );
  const token = await agent.oauthToken();
  assert.equal(token.token_type, "Bearer");
  assert.equal(token.expires_in, 300);
  const claims = JSON.parse(
    Buffer.from(token.access_token.split(".")[1], "base64url"),
  );
  assert.equal(claims.sub, agent.state.code);
  assert.equal(claims.aud, base + "/api/mcp");
  assert.equal(
    (
      await json(
        "/a2a",
        { jsonrpc: "2.0", id: 1, method: "agent/getAuthenticatedExtendedCard" },
        token.access_token,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await json(
        "/api/mcp",
        { jsonrpc: "2.0", id: 1, method: "ping" },
        token.access_token,
        { Origin: "https://evil.invalid" },
      )
    ).status,
    403,
  );
  pass(
    "Signed OAuth assertions issue short-lived tokens bound to the agent and resource; wrong audience and origin are denied",
  );
  client = new Client({
    name: "FTAI official SDK interoperability test",
    version: "1.0.0",
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(base + "/api/mcp"), {
      requestInit: {
        headers: { Authorization: "Bearer " + token.access_token },
      },
    }),
  );
  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((t) => t.name),
    ["ftai_self", "ftai_search_registry"],
  );
  const own = await client.callTool({ name: "ftai_self", arguments: {} });
  assert.equal(own.isError, false);
  assert.equal("owner" in JSON.parse(own.content[0].text).agent, false);
  assert.equal(JSON.parse(own.content[0].text).agent.code, agent.state.code);
  const search = await client.callTool({
    name: "ftai_search_registry",
    arguments: { query: "qa" },
  });
  assert.equal(search.isError, false);
  await client.close();
  client = null;
  pass(
    "Official MCP SDK initializes, lists tools, retrieves own passport and searches public registry",
  );
  const limited = await agent.oauthToken("/api/mcp", ["registry:read"]);
  const denied = await json(
    "/api/mcp",
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "ftai_self", arguments: {} },
    },
    limited.access_token,
  );
  assert.equal(denied.data.result.isError, true);
  pass(
    "Tool-level OAuth scopes prevent passport access with a directory-only token",
  );
  const card = (await json("/.well-known/agent-card.json")).data;
  assert.equal(card.protocolVersion, "0.3.0");
  assert.equal(card.capabilities.streaming, false);
  const a2a = await agent.oauthToken("/a2a");
  assert.equal(
    (
      await json(
        "/a2a",
        { jsonrpc: "2.0", id: 3, method: "agent/getAuthenticatedExtendedCard" },
        a2a.access_token,
      )
    ).data.result.name,
    card.name,
  );
  const message = {
    kind: "message",
    role: "user",
    messageId: randomUUID(),
    parts: [{ kind: "data", data: { operation: "passport.self" } }],
  };
  const task = (
    await json(
      "/a2a",
      { jsonrpc: "2.0", id: 4, method: "message/send", params: { message } },
      a2a.access_token,
    )
  ).data.result;
  assert.equal(task.status.state, "completed");
  assert.equal(task.artifacts[0].parts[0].data.agent.code, agent.state.code);
  assert.equal(
    (
      await json(
        "/a2a",
        { jsonrpc: "2.0", id: 5, method: "tasks/get", params: { id: task.id } },
        a2a.access_token,
      )
    ).data.result.id,
    task.id,
  );
  assert.equal(
    (
      await json(
        "/a2a",
        { jsonrpc: "2.0", id: 6, method: "message/send", params: { message } },
        a2a.access_token,
      )
    ).data.result.id,
    task.id,
  );
  assert.equal(
    (
      await json(
        "/a2a",
        {
          jsonrpc: "2.0",
          id: 7,
          method: "tasks/cancel",
          params: { id: task.id },
        },
        a2a.access_token,
      )
    ).data.error.code,
    -32002,
  );
  pass(
    "A2A discovery, authenticated card, message/send, task retrieval, idempotency and terminal cancellation interoperate",
  );
  const narrow = await agent.oauthToken("/a2a", ["registry:read"]);
  assert.equal(
    (
      await json(
        "/a2a",
        { jsonrpc: "2.0", id: 8, method: "tasks/get", params: { id: task.id } },
        narrow.access_token,
      )
    ).status,
    403,
  );
  const changed = {
    ...message,
    parts: [{ kind: "data", data: { operation: "registry.search" } }],
  };
  assert.equal(
    (
      await json(
        "/a2a",
        {
          jsonrpc: "2.0",
          id: 9,
          method: "message/send",
          params: { message: changed },
        },
        a2a.access_token,
      )
    ).data.error.code,
    -32602,
  );
  pass(
    "A2A task retrieval retains its original scope and message IDs cannot be reused for different content",
  );
  const iat = Math.floor(Date.now() / 1000),
    head = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString(
      "base64url",
    ),
    body = Buffer.from(
      JSON.stringify({
        iss: agent.state.code,
        sub: agent.state.code,
        aud: base + "/oauth/token",
        iat,
        exp: iat + 60,
        jti: randomUUID(),
      }),
    ).toString("base64url"),
    assertion =
      head +
      "." +
      body +
      "." +
      sign(null, Buffer.from(head + "." + body), agent.key).toString(
        "base64url",
      );
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: agent.state.code,
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
    resource: base + "/api/mcp",
    scope: "registry:read",
  });
  const issue = () =>
    fetch(base + "/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
  assert.equal((await issue()).status, 200);
  assert.equal((await issue()).status, 401);
  pass("OAuth client assertion replay is rejected");
  await fetch(base + "/oauth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: limited.access_token }),
  });
  assert.equal(
    (
      await json(
        "/api/mcp",
        { jsonrpc: "2.0", id: 10, method: "ping" },
        limited.access_token,
      )
    ).status,
    401,
  );
  await agent.rotateSelfManagedKey();
  assert.equal(
    (
      await json(
        "/api/mcp",
        { jsonrpc: "2.0", id: 11, method: "ping" },
        token.access_token,
      )
    ).status,
    401,
  );
  assert.ok((await agent.oauthToken()).access_token);
  pass(
    "Explicit token revocation and key rotation immediately invalidate access tokens",
  );
  const spiffe = await agent.spiffeStatus();
  assert.equal(spiffe.configured, false);
  await assert.rejects(
    agent.attestSpiffe("not-a-valid-token".repeat(3)),
    (e) => e.status === 403,
  );
  pass("SPIFFE attestation fails closed when no operator trust binding exists");
  await agent.setPublicListing("shared");
  const listedPublic = (await json("/api/v1/directory?q=" + agent.state.code))
    .data;
  assert.equal(listedPublic.agents.length, 1);
  assert.equal((await json("/api/v1/agents/" + agent.state.code)).status, 401);
  await agent.setPublicListing("private");
  pass(
    "An agent controls its public summary while full passport access remains authenticated",
  );
  let count = 0,
    ids = new Set();
  for (let offset = 0; offset < 1000; offset += 24) {
    const d = (await json("/api/v1/discoveries?offset=" + offset)).data;
    assert.equal(d.identityIssued, false);
    d.agents.forEach((a) => ids.add(a.id));
    count += d.agents.length;
  }
  assert.equal(count, 0);
  assert.equal(ids.size, 0);
  assert.ok([...ids].every((id) => id.startsWith("DISC-")));
  pass(
    "Fresh source distribution has no third-party catalogue records",
  );
  console.log(passed + " standards integration groups passed");
} finally {
  if (client) await client.close();
  if (agent.initialized) {
    try {
      await agent.eraseIdentity(agent.state.code);
    } catch (e) {
      console.error("QA cleanup failed:", e.message);
      process.exitCode = 1;
    }
  }
  await agent.close();
}
