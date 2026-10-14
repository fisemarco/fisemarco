import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
const base = "http://localhost:5173";
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = login.headers.get("set-cookie").split(";")[0];
async function request(path, body) {
  const r = await fetch(base + "/api/v1/" + path, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  return d;
}
const policy = await request("enrollment-policies", {
  label: "Lifecycle QA " + randomUUID(),
  organization: "QA",
  allowed: ["qa.task"],
  denied: [],
  maxAgents: 3,
  status: "active",
});
const dir = await mkdtemp(join(tmpdir(), "ftai-lifecycle-"));
const baseEnv = {
  ...process.env,
  FTAI_LIFECYCLE_BRIDGE: resolve("public/sdk/lifecycle-bridge.mjs"),
  PYTHONDONTWRITEBYTECODE: "1",
  GOCACHE: "/tmp/ftai-go-cache",
};
function run(cmd, args, env = baseEnv, cwd) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { env, cwd, stdio: "inherit" });
    p.on("error", rej);
    p.on("exit", (c) => (c === 0 ? res() : rej(Error(cmd + " exit " + c))));
  });
}
await mkdir("/tmp/ftai-sdk-java", { recursive: true });
await run("javac", [
  "-d",
  "/tmp/ftai-sdk-java",
  "public/sdk/java/FTAILifecycle.java",
  "tests/LifecycleSmoke.java",
]);
for (const lang of ["python", "java", "go"]) {
  const statePath = join(dir, lang + ".json");
  const env = {
    ...baseEnv,
    FTAI_LIFECYCLE_CONFIG: JSON.stringify({
      baseUrl: base,
      enrollmentKey: policy.key,
      externalId: randomUUID(),
      name: lang + " lifecycle QA",
      role: "QA",
      statePath,
    }),
  };
  try {
    if (lang === "python")
      await run("python3", ["tests/lifecycle-python.py"], env);
    if (lang === "java")
      await run("java", ["-cp", "/tmp/ftai-sdk-java", "LifecycleSmoke"], env);
    if (lang === "go")
      await run(
        process.env.FTAI_TEST_GO || "go",
        ["test", "-run", "TestLifecycle", "-v"],
        env,
        "public/sdk/go",
      );
  } finally {
    try {
      const state = JSON.parse(await readFile(statePath, "utf8"));
      await request("privacy/erase", { code: state.code, confirm: state.code });
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
}
console.log(
  "PASS shared-engine lifecycle across Python, Java and Go against real API",
);
