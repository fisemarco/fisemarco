import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FTAITestnet } from "../public/sdk/testnet.mjs";
const base = "http://localhost:5173";
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
    redirect: "manual",
  }),
  cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
async function req(path, body, method = body ? "POST" : "GET", auth = true) {
  const r = await fetch(base + "/api/v1/" + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(auth ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const constraints = {
  actions: ["document.read"],
  resources: ["test-document:1"],
  countries: ["FI"],
  currency: "EUR",
  maxAmountMinor: 0,
  approvalAboveMinor: 0,
  mayDelegate: false,
};
assert.equal((await req("testnet")).data.productionValid, false);
assert.equal(
  (await req("testnet/spaces", undefined, "GET", false)).status,
  401,
);
const space = await req("testnet/spaces", {
  name: "QA " + randomUUID(),
  constraints,
});
assert.equal(space.status, 200);
const id = space.data.id;
try {
  const client = new FTAITestnet(base, space.data.key);
  const enrolled = await client.enroll("Disposable QA");
  assert.ok(enrolled.code.startsWith("FTAI-TEST-"));
  const work = {
    taskId: randomUUID(),
    request: {
      action: "document.read",
      resource: "test-document:1",
      country: "FI",
      currency: "EUR",
      amountMinor: 0,
    },
    inputHash: "a".repeat(64),
  };
  const permitted = await client.request("authorize", work);
  assert.equal(permitted.decision, "ALLOW");
  assert.equal(permitted.productionValid, false);
  const payload = JSON.parse(
    Buffer.from(permitted.receipt.split(".")[1], "base64url"),
  );
  assert.equal(payload.aud, "FTAI-TESTNET-ONLY");
  assert.equal(
    (
      await client.request("authorize", {
        ...work,
        taskId: randomUUID(),
        request: { ...work.request, country: "US" },
      })
    ).decision,
    "DENY",
  );
  await assert.rejects(
    client.request("consume", { ...work, inputHash: "b".repeat(64) }),
    (e) => e.status === 409,
  );
  const race = await Promise.allSettled([
    client.request("consume", work),
    client.request("consume", work),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const prod = await fetch(base + "/api/v1/runtime/me", {
    headers: { "X-FTAI-Agent": enrolled.code },
  });
  assert.equal(prod.status, 401);
  assert.equal((await req("testnet/spaces/" + id)).data.agents.length, 1);
  assert.equal(
    (await req("testnet/spaces/" + id + "/revoke", { agent: enrolled.code }))
      .status,
    200,
  );
  await assert.rejects(
    client.request("authorize", { ...work, taskId: randomUUID() }),
    (e) => e.status === 403,
  );
  console.log(
    "PASS testnet owner isolation, signed enrollment, policy limits, task binding, concurrent one-use consumption, production rejection and revocation",
  );
} finally {
  assert.equal(
    (await req("testnet/spaces/" + id, { confirm: id }, "DELETE")).status,
    200,
  );
}
assert.equal((await req("testnet/spaces/" + id)).status, 404);
console.log("PASS test-space deletion cascades identities and permits");
