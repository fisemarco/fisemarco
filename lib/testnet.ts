import { z } from "zod";
import { auth, db, parse, config, HttpError } from "./server";
import { digest, sign } from "./crypto";
import { jwkSchema, pubVerify } from "./runtime";
import {
  constraintsSchema,
  actionSchema,
  evaluateAuthority,
  type Grant,
} from "./authority";
const iso = () => new Date().toISOString();
type Space = { id: string; constraints: string; expires: string };
type TestAgent = {
  code: string;
  space: string;
  public_key: string;
  revoked: number;
};
async function testReceipt(data: unknown) {
  const c = config();
  return sign(
    {
      iss: c.issuer + ":testnet",
      aud: "FTAI-TESTNET-ONLY",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      environment: "testnet",
      productionValid: false,
      data,
    },
    c.jwk,
    c.kid + "-testnet",
  );
}
export async function testnet(req: Request, path: string[]) {
  const op = path[1],
    method = req.method;
  if (!op && method === "GET")
    return {
      environment: "testnet",
      productionValid: false,
      protocol: "FTAI-Testnet-v1",
      capabilities: [
        "signed-enrollment",
        "bounded-authority",
        "single-use-permits",
        "revocation",
      ],
      limits: {
        maxAgentsPerSpace: 20,
        maxPermitsPerAgent: 200,
        spaceLifetimeDays: 7,
      },
      docs: "/testnet-protocol.md",
    };
  const input = method === "GET" ? {} : await parse(req.clone() as Request);
  if (op === "spaces") {
    const user = await auth(req, method !== "GET", false);
    if (!path[2] && method === "GET")
      return {
        spaces: (
          await db()
            .prepare(
              "SELECT id,name,constraints,created,expires FROM testnet_spaces WHERE owner=? ORDER BY created DESC",
            )
            .bind(user.id)
            .all()
        ).results,
      };
    if (!path[2] && method === "POST") {
      const value = z
        .object({
          name: z.string().trim().min(2).max(100),
          constraints: constraintsSchema,
        })
        .strict()
        .parse(input);
      const count = await db()
        .prepare("SELECT COUNT(*) AS n FROM testnet_spaces WHERE owner=?")
        .bind(user.id)
        .first<{ n: number }>();
      if ((count?.n || 0) >= 10)
        throw new HttpError(
          409,
          "Delete an existing test space before creating more (limit 10).",
        );
      const id = crypto.randomUUID(),
        key = "ftai_test_" + crypto.randomUUID() + crypto.randomUUID(),
        created = iso(),
        expires = new Date(Date.now() + 7 * 86400000).toISOString();
      const inserted = await db()
        .prepare(
          "INSERT INTO testnet_spaces(id,owner,name,key_hash,constraints,created,expires) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM testnet_spaces WHERE owner=?)<10",
        )
        .bind(
          id,
          user.id,
          value.name,
          await digest(key),
          JSON.stringify(value.constraints),
          created,
          expires,
          user.id,
        )
        .run();
      if (!inserted.meta.changes)
        throw new HttpError(409, "Test-space limit reached.");
      return { id, key, expires };
    }
    const id = z.string().uuid().parse(path[2]);
    const space = await db()
      .prepare(
        "SELECT id,name,constraints,created,expires FROM testnet_spaces WHERE id=? AND owner=?",
      )
      .bind(id, user.id)
      .first();
    if (!space) throw new HttpError(404, "Test space unavailable.");
    if (method === "DELETE" && !path[3]) {
      const { confirm } = z
        .object({ confirm: z.literal(id) })
        .strict()
        .parse(input);
      void confirm;
      await db()
        .prepare("DELETE FROM testnet_spaces WHERE id=? AND owner=?")
        .bind(id, user.id)
        .run();
      return { deleted: true };
    }
    if (method === "POST" && path[3] === "revoke") {
      const { agent } = z
        .object({ agent: z.string().startsWith("FTAI-TEST-").max(60) })
        .strict()
        .parse(input);
      await db()
        .prepare("UPDATE testnet_agents SET revoked=1 WHERE code=? AND space=?")
        .bind(agent, id)
        .run();
      return { revoked: true };
    }
    if (method === "GET")
      return {
        space,
        agents: (
          await db()
            .prepare(
              "SELECT code,name,revoked,created FROM testnet_agents WHERE space=? ORDER BY created DESC",
            )
            .bind(id)
            .all()
        ).results,
        permits: (
          await db()
            .prepare(
              "SELECT p.* FROM testnet_permits p JOIN testnet_agents a ON a.code=p.agent WHERE a.space=? ORDER BY p.expires DESC LIMIT 200",
            )
            .bind(id)
            .all()
        ).results,
      };
  }
  if (op === "enroll" && method === "POST") {
    const value = z
      .object({ name: z.string().trim().min(1).max(100), publicKey: jwkSchema })
      .strict()
      .parse(input);
    const token =
      req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    const space = await db()
      .prepare("SELECT * FROM testnet_spaces WHERE key_hash=? AND expires>?")
      .bind(await digest(token), iso())
      .first<Space>();
    if (!space)
      throw new HttpError(403, "Valid test-space enrollment key required.");
    const raw = await req.text();
    if (
      !(await pubVerify(
        value.publicKey,
        req.headers.get("x-ftai-signature") || "",
        ["FTAI-Testnet-Enrollment-v1", config().origin, await digest(raw)].join(
          "\n",
        ),
      ))
    )
      throw new HttpError(401, "Testnet key proof required.");
    const code = "FTAI-TEST-" + crypto.randomUUID();
    const r = await db()
      .prepare(
        "INSERT INTO testnet_agents(code,space,name,public_key,revoked,created) SELECT ?,?,?,?,0,? WHERE (SELECT COUNT(*) FROM testnet_agents WHERE space=?)<20",
      )
      .bind(
        code,
        space.id,
        value.name,
        JSON.stringify(value.publicKey),
        iso(),
        space.id,
      )
      .run();
    if (!r.meta.changes)
      throw new HttpError(409, "Test-space agent limit reached.");
    return {
      code,
      environment: "testnet",
      productionValid: false,
      receipt: await testReceipt({
        code,
        name: value.name,
        publicKey: value.publicKey,
        space: space.id,
      }),
    };
  }
  if (["authorize", "consume"].includes(op) && method === "POST") {
    const code = req.headers.get("x-ftai-agent") || "",
      time = req.headers.get("x-ftai-timestamp") || "",
      nonce = req.headers.get("x-ftai-nonce") || "";
    if (
      !code.startsWith("FTAI-TEST-") ||
      !z.string().uuid().safeParse(code.slice(10)).success ||
      !/^\d{10}$/.test(time) ||
      Math.abs(Date.now() / 1000 - Number(time)) > 60 ||
      !z.string().uuid().safeParse(nonce).success
    )
      throw new HttpError(401, "Fresh testnet proof required.");
    const agent = await db()
      .prepare("SELECT * FROM testnet_agents WHERE code=?")
      .bind(code)
      .first<TestAgent>();
    if (!agent || agent.revoked)
      throw new HttpError(403, "Test identity is unavailable or revoked.");
    const space = await db()
      .prepare("SELECT * FROM testnet_spaces WHERE id=? AND expires>?")
      .bind(agent.space, iso())
      .first<Space>();
    if (!space) throw new HttpError(403, "Test space has expired.");
    const raw = await req.text(),
      url = new URL(req.url);
    const message = [
      "FTAI-Testnet-Request-v1",
      config().origin,
      code,
      method,
      url.pathname + url.search,
      time,
      nonce,
      await digest(raw),
    ].join("\n");
    if (
      !(await pubVerify(
        JSON.parse(agent.public_key),
        req.headers.get("x-ftai-signature") || "",
        message,
      ))
    )
      throw new HttpError(401, "Invalid testnet signature.");
    try {
      await db().batch([
        db()
          .prepare("DELETE FROM testnet_nonces WHERE expires<?")
          .bind(Math.floor(Date.now() / 1000)),
        db()
          .prepare("INSERT INTO testnet_nonces(id,expires) VALUES(?,?)")
          .bind(
            await digest(code + nonce),
            Math.floor(Date.now() / 1000) + 120,
          ),
      ]);
    } catch {
      throw new HttpError(409, "Testnet request already used.");
    }
    const value = z
      .object({
        taskId: z.string().uuid(),
        request: actionSchema,
        inputHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(input);
    const synthetic: Grant = {
      id: space.id,
      organisation: space.id,
      parent: null,
      subject: code,
      constraints: space.constraints,
      expires: space.expires,
      revoked: 0,
      created: "",
      receipt: "",
    };
    const decision = evaluateAuthority([synthetic], value.request);
    if (decision.decision !== "ALLOW")
      return { ...decision, environment: "testnet", productionValid: false };
    if (op === "authorize") {
      const expires = new Date(Date.now() + 60000).toISOString(),
        proof = await testReceipt({ agent: code, ...value, expires });
      const r = await db()
        .prepare(
          "INSERT OR IGNORE INTO testnet_permits(id,agent,request,input_hash,state,expires,receipt) SELECT ?,?,?,?,'issued',?,? WHERE (SELECT COUNT(*) FROM testnet_permits WHERE agent=?)<200",
        )
        .bind(
          value.taskId,
          code,
          JSON.stringify(value.request),
          value.inputHash,
          expires,
          proof,
          code,
        )
        .run();
      if (!r.meta.changes)
        throw new HttpError(
          409,
          "Task ID already used or test permit limit reached.",
        );
      return {
        decision: "ALLOW",
        taskId: value.taskId,
        expires,
        receipt: proof,
        environment: "testnet",
        productionValid: false,
      };
    }
    const changed = await db()
      .prepare(
        "UPDATE testnet_permits SET state='consumed' WHERE id=? AND agent=? AND request=? AND input_hash=? AND state='issued' AND expires>? AND EXISTS(SELECT 1 FROM testnet_agents WHERE code=? AND revoked=0)",
      )
      .bind(
        value.taskId,
        code,
        JSON.stringify(value.request),
        value.inputHash,
        iso(),
        code,
      )
      .run();
    if (!changed.meta.changes)
      throw new HttpError(
        409,
        "Test permit is mismatched, expired, consumed or revoked.",
      );
    return {
      decision: "ALLOW",
      taskId: value.taskId,
      environment: "testnet",
      productionValid: false,
      receipt: await testReceipt({ taskId: value.taskId, consumed: iso() }),
    };
  }
  throw new HttpError(404, "Testnet operation unavailable.");
}
