import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "ftai-runner-check-"));
const path = join(dir, "config.json");
const env = { ...process.env };
delete env.FTAI_ENROLLMENT_KEY;
const manifest = {
  baseUrl: "http://localhost:5173",
  externalId: "local-check",
  name: "QA",
  role: "QA",
  statePath: join(dir, "state.json"),
};
async function check(extra, additional = {}) {
  await writeFile(
    path,
    JSON.stringify({ manifest: { ...manifest, ...extra } }),
  );
  return spawnSync(
    process.execPath,
    ["public/sdk/ftai-runner.mjs", "check", path],
    { env: { ...env, ...additional }, encoding: "utf8" },
  );
}
try {
  assert.equal((await check({})).status, 2);
  assert.equal((await check({ selfEnroll: true })).status, 1);
  const own = await check({ selfEnroll: true, termsVersion: "2026-09-16" });
  assert.equal(own.status, 0, own.stderr);
  assert.equal(JSON.parse(own.stdout).registeredLocally, false);
  assert.equal(
    (await check({}, { FTAI_ENROLLMENT_KEY: "local-non-secret-fixture" }))
      .status,
    0,
  );
  assert.equal(
    (await check({ enrollmentKey: "must-not-be-in-config" })).status,
    1,
  );
  console.log(
    "PASS runner local check handles self-enrollment, missing terms, operator enrollment and secret-in-file rejection without contacting a registry",
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
