import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
const base = "http://localhost:5173";
const cookie = (
  await fetch(base + "/signin-with-chatgpt?return_to=/", { redirect: "manual" })
).headers
  .get("set-cookie")
  .split(";")[0];
const folder = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/";
const db = new DatabaseSync(
  folder + (await readdir(folder)).find((f) => /^[a-f0-9]+\.sqlite$/.test(f)),
);
db.exec("PRAGMA foreign_keys=ON");
async function api(path, body) {
  const r = await fetch(base + "/api/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      Origin: base,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const org = (
  await api("organisations", { name: "Pagination QA " + randomUUID() })
).data;
const created = "2026-10-01T00:00:00.000Z";
const grants = [],
  approvals = [],
  reports = [];
let code;
try {
  const agent = await api("agents", {
    name: "Pagination QA",
    role: "Fixture",
    organization: "QA",
    profile: {},
  });
  code = agent.data.agent.code;
  const insertGrant = db.prepare(
    "INSERT INTO authority_grants(id,organisation,parent,subject,constraints,expires,revoked,created,receipt) VALUES(?,?,NULL,?,?,?,0,?,?)",
  );
  const insertApproval = db.prepare(
    "INSERT INTO authority_approvals(id,organisation,grant_id,agent,request,input_hash,state,created,expires) VALUES(?,?,?,?,?,?,'pending',?,?)",
  );
  const insertReport = db.prepare(
    "INSERT INTO safety_reports(id,agent,target,category,details,contact,created,updated,access_hash) VALUES(?,NULL,?,?,?,?,?,?,?)",
  );
  db.exec("BEGIN");
  for (let n = 0; n < 205; n++) {
    const g = randomUUID(),
      a = randomUUID();
    grants.push(g);
    approvals.push(a);
    insertGrant.run(
      g,
      org.id,
      code,
      "{}",
      "2026-11-01T00:00:00.000Z",
      created,
      "local-pagination-fixture",
    );
    insertApproval.run(
      a,
      org.id,
      g,
      code,
      "{}",
      "a".repeat(64),
      created,
      "2026-11-01T00:00:00.000Z",
    );
    if (n < 105) {
      const id = randomUUID();
      reports.push(id);
      insertReport.run(
        id,
        "Local pagination QA",
        "privacy",
        "Fixture for queue pagination audit",
        "",
        created,
        created,
        "fixture",
      );
    }
  }
  db.exec("COMMIT");
  async function scan(path, key, wanted) {
    let next = "",
      seen = new Set(),
      pages = 0;
    do {
      const r = await api(
        path +
          "?limit=100" +
          (next ? "&after=" + encodeURIComponent(next) : ""),
      );
      assert.equal(r.status, 200, JSON.stringify(r.data));
      for (const v of r.data[key]) {
        assert.ok(!seen.has(v.id), "Duplicate cursor row");
        seen.add(v.id);
      }
      next = r.data.next;
      assert.ok(++pages < 20);
    } while (next);
    assert.ok(wanted.every((id) => seen.has(id)));
    return pages;
  }
  assert.equal(
    await scan("organisations/" + org.id + "/grants", "grants", grants),
    3,
  );
  assert.equal(
    await scan(
      "organisations/" + org.id + "/approvals",
      "approvals",
      approvals,
    ),
    3,
  );
  assert.ok((await scan("safety/queue", "reports", reports)) >= 2);
  const detail = (await api("organisations/" + org.id)).data;
  assert.equal(detail.grants.length, 200);
  assert.ok(detail.nextGrantCursor);
  for (const path of [
    "safety/queue",
    "organisations/" + org.id + "/grants",
    "organisations/" + org.id + "/approvals",
  ]) {
    assert.equal((await api(path + "?after=invalid")).status, 400);
    assert.equal((await api(path + "?limit=0")).status, 400);
    assert.equal((await fetch(base + "/api/v1/" + path)).status, 401);
  }
  const owner = db
    .prepare("SELECT owner FROM organisations WHERE id=?")
    .get(org.id).owner;
  db.prepare(
    "UPDATE organisation_members SET role='auditor' WHERE organisation=? AND user=?",
  ).run(org.id, owner);
  assert.equal(
    (await api("organisations/" + org.id + "/approvals?limit=1")).status,
    200,
  );
  assert.equal(
    (await api("organisations/" + randomUUID() + "/grants")).status,
    404,
  );
  console.log(
    "PASS full pagination of 205 grants, 205 approvals and 105 safety reports, equal timestamp ties, cursor validation, membership and anonymous denial",
  );
} finally {
  db.prepare("DELETE FROM organisations WHERE id=?").run(org.id);
  for (const id of reports)
    db.prepare("DELETE FROM safety_reports WHERE id=?").run(id);
  if (code) await api("privacy/erase", { code, confirm: code });
  db.close();
}
