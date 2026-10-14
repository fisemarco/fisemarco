import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const compiled = await build({
  entryPoints: ["lib/postgres-query.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { postgresQuery } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const pg = new PGlite();
let passed = 0;
const pass = (m) => {
  passed++;
  console.log("PASS " + m);
};
try {
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  await pg.exec(
    "CREATE FUNCTION public.rls_auto_enable() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'SELECT';",
  );
  for (const file of (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  )
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await pg.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  assert.equal(
    (
      await pg.query(
        "SELECT COUNT(*)::int AS count FROM ftai_private.discovered_agents",
      )
    ).rows[0].count,
    0,
  );
  pass(
    "PostgreSQL migrations create the registry schema with an empty discovery catalogue",
  );
  for (const role of ["anon", "authenticated"])
    assert.equal(
      (
        await pg.query(
          "SELECT has_function_privilege($1,'public.rls_auto_enable()','EXECUTE') AS allowed",
          [role],
        )
      ).rows[0].allowed,
      false,
    );
  const missing = await pg.query(
    "SELECT c.conname FROM pg_constraint c WHERE c.contype='f' AND c.connamespace='ftai_private'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indisvalid AND i.indpred IS NULL AND (i.indkey::int2[])[0:cardinality(c.conkey)-1] @> c.conkey)",
  );
  assert.equal(missing.rows.length, 0);
  pass(
    "Every foreign key is indexed and browser roles cannot execute the internal automatic-RLS function",
  );
  for (const role of ["anon", "authenticated"]) {
    await pg.exec("SET ROLE " + role);
    await assert.rejects(
      pg.query("SELECT * FROM ftai_private.agents"),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("INSERT INTO ftai_private.erasure_authorizations VALUES ($1)", [
        "wrong",
      ]),
      /permission denied/,
    );
    await pg.exec("RESET ROLE");
  }
  pass(
    "Public and authenticated client roles cannot read private tables or authorize erasure",
  );
  const policy = (
    await pg.query(
      "SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='ftai_private'",
    )
  ).rows[0].count;
  assert.equal(policy, 39);
  await pg.exec(
    "SET ROLE ftai_runtime; SET search_path=ftai_private,pg_catalog",
  );
  const now = new Date().toISOString();
  await pg.query(
    "INSERT INTO agents(code,owner,name,role,organization,profile,created,updated) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    ["FTAI-TEST", "owner", "Test", "QA", "QA", "{}", now, now],
  );
  await assert.rejects(
    pg.query("UPDATE agents SET code=$1 WHERE code=$2", [
      "changed",
      "FTAI-TEST",
    ]),
    /FTAI_IDENTITY_LOCKED/,
  );
  await assert.rejects(
    pg.query("UPDATE agents SET owner=$1 WHERE code=$2", [
      "attacker",
      "FTAI-TEST",
    ]),
    /FTAI_IDENTITY_LOCKED/,
  );
  await assert.rejects(
    pg.query("DELETE FROM agents WHERE code=$1", ["FTAI-TEST"]),
    /FTAI_IDENTITY_CANNOT_BE_DELETED/,
  );
  await assert.rejects(
    pg.exec("ALTER TABLE agents DISABLE TRIGGER ALL"),
    /must be owner/,
  );
  pass(
    "Dedicated runtime role operates through RLS and cannot change identity or disable guards",
  );
  await pg.query(
    "INSERT INTO records(id,agent,sequence,kind,title,payload,actor,created,previous_hash,hash,jws) VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      "record",
      "FTAI-TEST",
      "profile",
      "Birth",
      "{}",
      "QA",
      now,
      "GENESIS",
      "hash",
      "proof",
    ],
  );
  await assert.rejects(
    pg.exec("UPDATE records SET title='changed'"),
    /FTAI_LEDGER_IS_APPEND_ONLY/,
  );
  await assert.rejects(
    pg.exec("DELETE FROM records"),
    /FTAI_LEDGER_IS_APPEND_ONLY/,
  );
  await pg.exec(
    "BEGIN; INSERT INTO erasure_authorizations VALUES ('FTAI-TEST'); DELETE FROM records WHERE agent='FTAI-TEST'; UPDATE agents SET owner='erased',name='',profile='{}',status='retired' WHERE code='FTAI-TEST'; DELETE FROM erasure_authorizations; COMMIT",
  );
  assert.equal(
    (await pg.query("SELECT count(*)::int AS count FROM records")).rows[0]
      .count,
    0,
  );
  pass(
    "Ledger mutation is blocked; authorized transactional erasure preserves the personnel code",
  );
  await pg.exec("BEGIN");
  await pg.query("INSERT INTO request_limits VALUES($1,1,100)", [
    "rolled-back",
  ]);
  await pg.exec("ROLLBACK");
  assert.equal(
    (
      await pg.query(
        "SELECT count(*)::int AS count FROM request_limits WHERE id='rolled-back'",
      )
    ).rows[0].count,
    0,
  );
  pass("PostgreSQL transactions roll back a partially written operation");
  await pg.query(
    "INSERT INTO request_limits(id,count,expires) VALUES($1,1,$2) ON CONFLICT(id) DO UPDATE SET count=request_limits.count+1 RETURNING count",
    ["quota", 100],
  );
  const r = await pg.query(
    "INSERT INTO request_limits(id,count,expires) VALUES($1,1,$2) ON CONFLICT(id) DO UPDATE SET count=request_limits.count+1 RETURNING count",
    ["quota", 100],
  );
  assert.equal(r.rows[0].count, 2);
  const hostile = "%' OR 1=1 --";
  assert.equal(
    (
      await pg.query(
        "SELECT * FROM discovered_agents WHERE name LIKE $1 ESCAPE '\\'",
        [hostile],
      )
    ).rows.length,
    0,
  );
  pass(
    "Atomic quota updates and parameterized hostile searches work on PostgreSQL",
  );
  assert.equal(
    postgresQuery("SELECT '?' AS literal,? AS value WHERE 'LIKE' LIKE ?"),
    "SELECT '?' AS literal,$1 AS value WHERE 'LIKE' ILIKE $2",
  );
  await pg.query("INSERT INTO discovered_agents(id,name,source,source_address,source_url,reported_status,discovered,hidden) VALUES($1,$2,$3,$4,$5,$6,$7,0)", ["DISC-TEST-CASE", "Rubik test fixture", "Test only", "test-address", "https://example.invalid", "test-only", "2026-10-14"]);
  const translated = await pg.query(
    postgresQuery("SELECT name FROM discovered_agents WHERE name LIKE ?"),
    ["%rUbIk%"],
  );
  assert.ok(translated.rows.length > 0);
  pass(
    "Driver translates placeholders without touching quoted literals and preserves case-insensitive discovery",
  );
  console.log(
    `${passed} PostgreSQL integration groups passed. Production cutover still requires PostgreSQL application compatibility, hosting and live-data migration tests.`,
  );
} finally {
  await pg.close();
}
