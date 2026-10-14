import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPairSync, verify, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
const pair = generateKeyPairSync("ed25519"),
  seed = Buffer.from(
    pair.privateKey.export({ format: "jwk" }).d,
    "base64url",
  ).toString("base64");
let count = 0,
  base;
const nonces = new Set();
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const h = req.headers;
    assert.equal(h["x-ftai-agent"], "FTAI-AAAA-BBBB-CCCC");
    assert.ok(Math.abs(Number(h["x-ftai-timestamp"]) - Date.now() / 1000) < 60);
    assert.ok(!nonces.has(h["x-ftai-nonce"]));
    nonces.add(h["x-ftai-nonce"]);
    const message = [
      "FTAI-Request-v1",
      base,
      h["x-ftai-agent"],
      req.method,
      req.url,
      h["x-ftai-timestamp"],
      h["x-ftai-nonce"],
      createHash("sha256").update(body).digest("hex"),
    ].join("\n");
    assert.ok(
      verify(
        null,
        Buffer.from(message),
        pair.publicKey,
        Buffer.from(h["x-ftai-signature"], "base64url"),
      ),
    );
    if (req.method === "POST")
      assert.equal(JSON.parse(body).request.action, "Åä漢字");
    count++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ verified: true }));
  } catch (e) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: e.message }));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
base = "http://127.0.0.1:" + server.address().port;
const env = {
  ...process.env,
  PYTHONDONTWRITEBYTECODE: "1",
  FTAI_SDK_TEST_URL: base,
  FTAI_SDK_TEST_SEED: seed,
  FTAI_SDK_TEST_PKCS8: pair.privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64"),
  GOCACHE: "/tmp/ftai-go-cache",
};
function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { env, cwd, stdio: "inherit" });
    c.on("error", reject);
    c.on("exit", (n) =>
      n === 0 ? resolve() : reject(Error(cmd + " exited " + n)),
    );
  });
}
try {
  await mkdir("/tmp/ftai-sdk-java", { recursive: true });
  await run("javac", [
    "-d",
    "/tmp/ftai-sdk-java",
    "public/sdk/java/FTAIClient.java",
    "tests/SDKSmoke.java",
  ]);
  await run(
    process.env.FTAI_TEST_PYTHON || "python3",
    ["tests/sdk-python.py"],
  );
  await run("java", ["-cp", "/tmp/ftai-sdk-java", "SDKSmoke"]);
  await run(
    process.env.FTAI_TEST_GO || "go",
    ["test", "-v", "./..."],
    "public/sdk/go",
  );
  assert.equal(count, 6);
  console.log(
    "PASS cross-language exact-byte signatures, nonces, UTF-8 and origin constraints",
  );
} finally {
  server.close();
}
