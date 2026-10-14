import { intelligence } from "@/lib/intelligence";
import { env } from "cloudflare:workers";
import { supabaseHttpDatabase } from "@/lib/supabase-http";
import type { AgentRow, RecordRow } from "@/lib/rows";
import { portableProfile } from "@/lib/interop";
import { testnet } from "@/lib/testnet";
import { enterprise } from "@/lib/enterprise";
import { spiffeAttestation } from "@/lib/spiffe";
import { discoveries } from "@/lib/discoveries";
import { directory } from "@/lib/directory";
import { identitySeal } from "@/lib/identity";
import { runtimeApi, policyApi } from "@/lib/runtime";
import { z } from "zod";
import {
  auth,
  db,
  config,
  parse,
  HttpError,
  agentSchema,
  agentView,
  getAgent,
  getRecords,
  makeRecord,
  insertRecord,
  append,
  recordSchema,
  checkChain,
  credential,
} from "@/lib/server";
import { digest, sign, verify, unb64 } from "@/lib/crypto";
import { metrics } from "@/lib/model";
import { selfEnrollment } from "@/lib/self-enrollment";
import { cybersphere } from "@/lib/cybersphere";
import { safety } from "@/lib/safety";
import { exportPassport, erasePassport } from "@/lib/privacy";
import { rateLimit, clientBucket, rejectCrossOrigin } from "@/lib/security";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function handle(req: Request) {
  try {
    const url = new URL(req.url);
    const path = url.pathname
      .replace(/^\/api\/v1\/?/, "")
      .split("/")
      .filter(Boolean);
    const method = req.method;
    const write = method !== "GET";
    if (write) rejectCrossOrigin(req);
    await rateLimit("api:" + clientBucket(req), 600, 60);
    if (path[0] === "intelligence") return json(await intelligence(req, path));
    if (path[0] === "testnet") return json(await testnet(req, path));
    if (path[0] === "organisations") return json(await enterprise(req, path));
    if (path[0] === "self-enrollment")
      return json(await selfEnrollment(req, path[1]));
    if (path[0] === "cybersphere") return json(await cybersphere(req, path));
    if (path[0] === "safety") return json(await safety(req, path));
    if (path[0] === "privacy") {
      const owner = await auth(req, write, false);
      const input = z
        .object({
          code: z.string().regex(/^FTAI-(?:[A-F0-9]{4}-){2}[A-F0-9]{4}$/),
          confirm: z.string().optional(),
        })
        .strict()
        .parse(await parse(req));
      await getAgent(input.code, owner.id, true);
      if (method === "POST" && path[1] === "export")
        return json(await exportPassport(input.code));
      if (
        method === "POST" &&
        path[1] === "erase" &&
        input.confirm === input.code
      )
        return json(await erasePassport(input.code));
      throw new HttpError(
        400,
        "Use export or confirm the exact personnel code for erasure.",
      );
    }
    if (path[0] === "health" && method === "GET") {
      if (url.searchParams.get("backend") === "supabase") {
        await auth(req, false, false);
        const settings = env as unknown as Record<string, string | undefined>;
        if (!settings.FTAI_SUPABASE_GATEWAY_URL) throw new HttpError(503, "Supabase gateway is not configured.");
        try {
          await supabaseHttpDatabase(settings.FTAI_SUPABASE_GATEWAY_URL, config().jwk).prepare("SELECT 1 AS ready").first();
        } catch (error) {
          const message = error instanceof Error && /^Supabase gateway returned HTTP \d{3}\.$/.test(error.message) ? error.message : error instanceof Error && ["Invalid Supabase database response.", "Invalid Supabase database gateway."].includes(error.message) ? error.message : error instanceof Error && ["DataError", "InvalidAccessError", "NotSupportedError", "TimeoutError", "AbortError", "TypeError", "SyntaxError"].includes(error.name) ? `Supabase readiness failed (${error.name}).` : "Supabase readiness could not complete.";
          const phase = error && typeof error === "object" && "gatewayPhase" in error && typeof error.gatewayPhase === "string" && ["translation", "key import", "signature", "request", "response decoding"].includes(error.gatewayPhase) ? ` Stage: ${error.gatewayPhase}.` : "";
          throw new HttpError(503, message + phase);
        }
        return json({status:"ok", backend:"supabase"});
      }
      await db().prepare("SELECT 1").first();
      config();
      return json({ status: "ok" });
    }
    if (path[0] === "issuer" && method === "GET") {
      const c = config();
      return json({
        issuer: c.issuer,
        keyId: c.kid,
        publicKeyJwk: c.publicJwk,
      });
    }
    if (path[0] === "directory" && method === "GET" && path.length === 1)
      return json(await directory(url));
    if (path[0] === "discoveries" && method === "GET")
      return json(await discoveries(url, path[1]));
    if (path[0] === "runtime" && path[1] === "attest")
      return json(await spiffeAttestation(req));
    if (path[0] === "runtime") return json(await runtimeApi(req, path));
    if (path[0] === "enrollment-policies")
      return json(await policyApi(req, path));
    let user: Awaited<ReturnType<typeof auth>> | null = null;
    try {
      user = await auth(req, write, !["keys", "session"].includes(path[0]));
    } catch (e) {
      if (
        (write && path[0] !== "verify") ||
        !(e instanceof HttpError) ||
        e.status !== 401 ||
        req.headers.has("authorization") ||
        !["agents", "session", "verify"].includes(path[0])
      )
        throw e;
    }
    if (path[0] === "session" && method === "GET")
      return json({
        user: user
          ? {
              name: req.headers.get("oai-authenticated-user-full-name")
                ? decodeURIComponent(
                    req.headers.get("oai-authenticated-user-full-name")!,
                  )
                : req.headers.get("oai-authenticated-user-email"),
              email: req.headers.get("oai-authenticated-user-email"),
            }
          : null,
      });
    if (path[0] === "keys") {
      if (!user) throw new HttpError(401, "Sign in to manage API keys.");
      if (method === "GET") {
        const { results } = await db()
          .prepare(
            "SELECT id,label,prefix,scope,created,expires FROM api_keys WHERE owner=? ORDER BY created DESC",
          )
          .bind(user.id)
          .all();
        return json({ keys: results });
      }
      if (method === "POST") {
        const input = z
          .object({
            label: z.string().trim().min(1).max(60),
            scope: z.enum(["read", "write"]),
          })
          .parse(await parse(req));
        const token =
          "ftai_" +
          crypto.randomUUID().replace(/-/g, "") +
          crypto.randomUUID().replace(/-/g, "");
        const id = crypto.randomUUID();
        const created = new Date().toISOString();
        const expires = new Date(Date.now() + 90 * 86400000).toISOString();
        await db()
          .prepare(
            "INSERT INTO api_keys(id,owner,label,hash,prefix,scope,created,expires) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            user.id,
            input.label,
            await digest(token),
            token.slice(0, 13),
            input.scope,
            created,
            expires,
          )
          .run();
        return json({ id, token, expires }, 201);
      }
      if (method === "DELETE" && path[1]) {
        await db()
          .prepare("DELETE FROM api_keys WHERE id=? AND owner=?")
          .bind(path[1], user.id)
          .run();
        return json({ revoked: true });
      }
    }
    if (path[0] === "verify" && method === "POST") {
      if (!user)
        throw new HttpError(401, "Sign in to verify passport records.");
      const { jws } = z
        .object({ jws: z.string().max(65536) })
        .parse(await parse(req));
      const c = config();
      const signed = await verify(jws, c.publicJwk, c.kid);
      if (!signed)
        return json({
          valid: false,
          reason:
            "Signature does not match this registry, or the credential was altered.",
        });
      const vc = JSON.parse(new TextDecoder().decode(unb64(jws.split(".")[1])));
      if (
        vc.issuer !== c.issuer ||
        !vc.type?.includes("VerifiableCredential") ||
        !vc["@context"]?.includes("https://www.w3.org/ns/credentials/v2") ||
        !vc.validFrom ||
        Date.parse(vc.validFrom) > Date.now() ||
        (vc.validUntil && Date.parse(vc.validUntil) <= Date.now())
      )
        return json({
          valid: false,
          reason:
            "Credential issuer, data model, or validity period is invalid.",
        });
      const subject = vc.credentialSubject;
      const code = subject?.record?.agent || subject?.record?.passport?.code;
      if (!code)
        return json({ valid: false, reason: "No passport is referenced." });
      const row = await getAgent(code, user?.id);
      const records = await getRecords(code);
      const r = subject.record;
      const saved = records.find((x) => x.id === r.id);
      const active = row.status === "active";
      if (r.exportedAt) {
        const latest =
          r.revision === row.revision && r.ledgerHead === records.at(-1)?.hash;
        return json({
          valid: active && latest,
          signatureValid: true,
          current: latest,
          status: row.status,
          code,
          reason: !active
            ? "This passport is " + row.status
            : latest
              ? "Signed snapshot matches the current passport revision. Claims remain reported, not independently verified."
              : "Signature is intact, but newer passport records exist.",
        });
      }
      return json({
        valid: !!saved && saved.jws === jws && !saved.withdrawn && active,
        signatureValid: true,
        status: row.status,
        code,
        withdrawn: saved?.withdrawn || false,
        reason: !saved
          ? "This record is not in the registry."
          : saved.jws !== jws
            ? "This credential is not the stored record receipt. Work permits are not completion receipts."
            : saved.withdrawn
              ? "The issuer withdrew this record."
              : !active
                ? "The passport is " + row.status
                : "Record signature and current status confirmed. Claims remain reported, not independently verified.",
      });
    }
    if (path[0] === "agents" && !path[1]) {
      if (method === "GET") {
        if (!user) return json({ agents: [], records: [] });
        const { results } = await db()
          .prepare("SELECT * FROM agents WHERE owner=? ORDER BY created DESC")
          .bind(user.id)
          .all<AgentRow>();
        const all = await db()
          .prepare(
            "SELECT records.* FROM records JOIN agents ON records.agent=agents.code WHERE agents.owner=? ORDER BY records.sequence ASC",
          )
          .bind(user.id)
          .all<RecordRow>();
        return json({
          agents: results.map((r) => agentView(r, user.id)),
          records: all.results.map((r) => ({
            ...r,
            payload: JSON.parse(r.payload),
          })),
        });
      }
      if (method === "POST") {
        if (!user) throw new HttpError(401, "Sign in to create a passport.");
        const input = agentSchema.parse(await parse(req));
        const code =
          "FTAI-" +
          crypto
            .randomUUID()
            .replace(/-/g, "")
            .slice(0, 12)
            .toUpperCase()
            .match(/.{4}/g)!
            .join("-");
        const actor = "owner:" + (await digest(user.id)).slice(0, 16);
        const record = await makeRecord(
          code,
          1,
          "profile",
          "Passport registered",
          input,
          actor,
          "GENESIS",
        );
        await db().batch([
          db()
            .prepare(
              "INSERT INTO agents(code,owner,name,role,organization,profile,status,visibility,revision,created,updated) VALUES(?,?,?,?,?,?,?,?,1,?,?)",
            )
            .bind(
              code,
              user.id,
              input.name,
              input.role,
              input.organization,
              JSON.stringify(input.profile),
              input.status,
              input.visibility,
              record.created,
              record.created,
            ),
          insertRecord(record),
        ]);
        return json(
          { agent: agentView(await getAgent(code, user.id), user.id) },
          201,
        );
      }
    }
    if (path[0] === "agents" && path[1]) {
      if (!user) throw new HttpError(401, "Sign in to view this passport.");
      const code = path[1].toUpperCase();
      const row = await getAgent(code, user?.id, write);
      if (path[2] === "profile" && path.length === 3 && method === "GET")
        return json(portableProfile(agentView(row, user.id), config().origin));
      if (path[2] === "identity-lock" && method === "GET")
        return json(await identitySeal(code));
      if (path[2] === "did.json" && method === "GET") {
        const c = config();
        const id = agentView(row).did;
        return json({
          "@context": ["https://www.w3.org/ns/did/v1"],
          id,
          controller: c.issuer,
          service: [
            {
              id: id + "#passport",
              type: "FTAIProfessionalPassport",
              serviceEndpoint: `${c.origin}/api/v1/agents/${code}`,
            },
          ],
        });
      }
      if (!path[2] && method === "GET") {
        const rs = await getRecords(code);
        return json({
          agent: agentView(row, user?.id),
          identity: await identitySeal(code),
          records: rs,
          metrics: metrics(rs),
        });
      }
      if (!path[2] && method === "PATCH") {
        const body = await parse(req);
        const input = agentSchema.parse(body);
        if (body.revision !== row.revision)
          throw new HttpError(
            409,
            "This passport has changed. Refresh before saving.",
          );
        await append(
          row,
          "profile",
          "Passport details updated",
          input,
          "owner:" + (await digest(user.id)).slice(0, 16),
          undefined,
          input,
        );
        return json({
          agent: agentView(await getAgent(code, user.id), user.id),
        });
      }
      if (path[2] === "records" && method === "POST") {
        if (row.status !== "active")
          throw new HttpError(
            409,
            "Reactivate this passport before adding work records.",
          );
        const input = recordSchema.parse(await parse(req));
        if (
          input.kind === "employment" &&
          input.endDate &&
          input.endDate < input.startDate
        )
          throw new HttpError(400, "End date must be on or after start date.");
        if (
          input.kind === "credential" &&
          input.expires &&
          input.expires < input.issued
        )
          throw new HttpError(400, "Expiry must be on or after issue date.");
        const rs = await getRecords(code);
        const existing = rs.find((r) => r.id === input.id);
        if (existing) {
          if (JSON.stringify(existing.payload) !== JSON.stringify(input))
            throw new HttpError(
              409,
              "This request ID is already used by another record.",
            );
          return json({ record: existing, idempotent: true });
        }
        if (input.kind === "correction") {
          const target = rs.find((r) => r.id === input.targetId);
          if (
            !target ||
            target.withdrawn ||
            ["correction", "profile", "version", "runtime_access"].includes(
              target.kind,
            )
          )
            throw new HttpError(
              400,
              "Choose an active work record to withdraw.",
            );
          if (
            rs.some(
              (r) =>
                !r.withdrawn &&
                (r.payload.employmentId === target.id ||
                  r.payload.incidentId === target.id),
            )
          )
            throw new HttpError(
              409,
              "Withdraw linked outcomes, reviews, or closure records before withdrawing this record.",
            );
        }
        if (
          "employmentId" in input &&
          input.employmentId &&
          !rs.some(
            (r) =>
              r.id === input.employmentId &&
              r.kind === "employment" &&
              !r.withdrawn,
          )
        )
          throw new HttpError(
            400,
            "The linked employment record is missing or withdrawn.",
          );
        if (input.kind === "incident_resolution") {
          const incident = rs.find(
            (r) =>
              r.id === input.incidentId &&
              r.kind === "incident" &&
              !r.withdrawn,
          );
          if (
            !incident ||
            incident.payload.state === "resolved" ||
            rs.some(
              (r) =>
                r.kind === "incident_resolution" &&
                !r.withdrawn &&
                r.payload.incidentId === input.incidentId,
            )
          )
            throw new HttpError(409, "Choose an unresolved incident.");
        }
        if (input.kind === "employment_end") {
          const job = rs.find((r) => r.id === input.employmentId);
          if (
            !job ||
            !job.payload.startDate ||
            input.endDate < job.payload.startDate
          )
            throw new HttpError(
              400,
              "End date must be on or after the employment start date.",
            );
          if (
            job.payload.endDate ||
            rs.some(
              (r) =>
                r.kind === "employment_end" &&
                !r.withdrawn &&
                r.payload.employmentId === job.id,
            )
          )
            throw new HttpError(
              409,
              "This employment already has an end date.",
            );
        }
        const versionUpdate =
          input.kind === "version"
            ? {
                ...row,
                profile: {
                  ...JSON.parse(row.profile),
                  version: input.version,
                  model: input.model,
                },
              }
            : undefined;
        const r = await append(
          row,
          input.kind,
          input.title,
          input,
          "owner:" + (await digest(user.id)).slice(0, 16),
          input.id,
          versionUpdate,
        );
        return json({ record: r }, 201);
      }
      if (path[2] === "verify" && method === "GET") {
        const check = await checkChain(row, await getRecords(code));
        return json({
          ...check,
          status: row.status,
          signatureValid: check.valid,
          valid: check.valid && row.status === "active",
          meaning:
            row.status === "active"
              ? check.meaning
              : "Signatures may be intact, but this passport is " +
                row.status +
                ".",
        });
      }
      if (path[2] === "export" && method === "GET") {
        const c = config();
        const rs = await getRecords(code);
        if (!(await checkChain(row, rs)).valid)
          throw new HttpError(
            409,
            "The record ledger could not be verified. Export is unavailable.",
          );
        const agent = agentView(row);
        const summary = metrics(rs);
        const time = new Date().toISOString();
        const vc = credential(
          {
            id: agent.did,
            record: {
              passport: agent,
              ledgerHead: rs.at(-1)?.hash,
              recordCount: rs.length,
              metrics: {
                tasks: summary.tasks,
                success: summary.success,
                intervention: summary.intervention,
                average: summary.average,
                evidence: summary.evidence,
                incidents: summary.incidents,
              },
              revision: row.revision,
              exportedAt: time,
              assurance:
                "Owner-reported or runtime-reported claims. FTAI confirms record integrity, not claim accuracy.",
            },
          },
          crypto.randomUUID(),
          time,
        );
        vc["validUntil"] = new Date(Date.now() + 86400000).toISOString();
        const jws = await sign(vc, c.jwk, c.kid);
        const format = url.searchParams.get("format");
        if (format === "jwt")
          return new Response(jws, {
            headers: {
              "Content-Type": "application/vc+jwt",
              "Content-Disposition": `attachment; filename="${code}.jwt"`,
              "Cache-Control": "no-store",
            },
          });
        return new Response(
          JSON.stringify(
            {
              credential: vc,
              jws,
              records: rs.map((r) => ({
                id: r.id,
                sequence: r.sequence,
                jws: r.jws,
              })),
              publicKeyJwk: c.publicJwk,
              verificationUrl: `${c.origin}/api/v1/agents/${code}/verify`,
            },
            null,
            2,
          ),
          {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": `attachment; filename="${code}-passport.json"`,
              "Cache-Control": "no-store",
            },
          },
        );
      }
    }
    throw new HttpError(404, "This endpoint does not exist.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    // Never log request bodies, tokens, claims or database exception text.
    console.error(
      "Registry request failed",
      error instanceof Error ? error.name : "unknown",
    );
    return json(
      {
        error:
          "The registry could not complete this request. Please try again.",
      },
      503,
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
