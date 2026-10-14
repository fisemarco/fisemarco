import { z } from "zod";
import { config, db, HttpError } from "./server";
import { b64, unb64, digest } from "./crypto";
import { pubVerify } from "./runtime";
import { rateLimit, clientBucket, rejectCrossOrigin } from "./security";
const scopeSet = ["passport:read", "registry:read"];
export function authorizationMetadata() {
  const c = config();
  return {
    issuer: c.origin,
    token_endpoint: c.origin + "/oauth/token",
    revocation_endpoint: c.origin + "/oauth/revoke",
    jwks_uri: c.origin + "/.well-known/jwks.json",
    grant_types_supported: ["client_credentials"],
    token_endpoint_auth_methods_supported: ["private_key_jwt"],
    token_endpoint_auth_signing_alg_values_supported: ["EdDSA"],
    scopes_supported: scopeSet,
    client_id_metadata_document_supported: false,
  };
}
export function resourceMetadata(resource: string) {
  const c = config();
  return {
    resource: c.origin + resource,
    authorization_servers: [c.origin],
    bearer_methods_supported: ["header"],
    scopes_supported: scopeSet,
    resource_documentation: c.origin + "/standards.md",
  };
}
async function form(req: Request) {
  rejectCrossOrigin(req);
  if (
    !req.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    throw new HttpError(415, "Use application/x-www-form-urlencoded.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "A body is required.");
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new HttpError(413, "OAuth request too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  const params = new URLSearchParams(new TextDecoder().decode(bytes));
  for (const key of params.keys())
    if (params.getAll(key).length !== 1)
      throw new HttpError(400, "Duplicate OAuth parameter.");
  return params;
}
export async function issueToken(req: Request) {
  await rateLimit("oauth:" + clientBucket(req), 60, 60);
  const c = config(),
    p = await form(req),
    now = Math.floor(Date.now() / 1000);
  if (
    p.get("grant_type") !== "client_credentials" ||
    p.get("client_assertion_type") !==
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
  )
    throw new HttpError(
      400,
      "Use client_credentials with a private_key_jwt assertion.",
    );
  const resource = p.get("resource");
  if (resource !== c.origin + "/api/mcp" && resource !== c.origin + "/a2a")
    throw new HttpError(
      400,
      "An exact supported resource audience is required.",
    );
  const scopes = (p.get("scope") || "").split(" ").filter(Boolean);
  if (!scopes.length || scopes.some((s) => !scopeSet.includes(s)))
    throw new HttpError(400, "Request passport:read and/or registry:read.");
  const assertion = p.get("client_assertion") || "";
  const [h, b, s, ...extra] = assertion.split(".");
  if (extra.length || !h || !b || !s)
    throw new HttpError(401, "Invalid client assertion.");
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(unb64(h)));
    claims = JSON.parse(new TextDecoder().decode(unb64(b)));
  } catch {
    throw new HttpError(401, "Invalid client assertion encoding.");
  }
  const data = z
    .object({
      iss: z.string(),
      sub: z.string(),
      aud: z.string(),
      iat: z.number().int(),
      exp: z.number().int(),
      jti: z.string().uuid(),
    })
    .passthrough()
    .safeParse(claims);
  if (
    !data.success ||
    !header ||
    typeof header !== "object" ||
    header.alg !== "EdDSA" ||
    header.crit ||
    header.jku ||
    header.jwk ||
    data.data.iss !== data.data.sub ||
    p.get("client_id") !== data.data.sub ||
    data.data.aud !== c.origin + "/oauth/token" ||
    data.data.exp <= now ||
    data.data.exp > now + 120 ||
    data.data.iat > now + 10 ||
    data.data.iat < now - 120 ||
    data.data.exp <= data.data.iat
  )
    throw new HttpError(401, "Client assertion claims are invalid or expired.");
  const runtime = await db()
    .prepare(
      "SELECT r.agent,r.public_key,r.thumbprint FROM runtime_agents r JOIN agents a ON a.code=r.agent JOIN enrollment_policies p ON p.id=r.policy_id WHERE r.agent=? AND r.revoked=0 AND a.status='active' AND p.status='active'",
    )
    .bind(data.data.sub)
    .first<{ agent: string; public_key: string; thumbprint: string }>();
  if (
    !runtime ||
    !(await pubVerify(JSON.parse(runtime.public_key), s, h + "." + b))
  )
    throw new HttpError(401, "Client signing key is invalid or revoked.");
  const jti = crypto.randomUUID(),
    exp = now + 300;
  const head = b64(
    new TextEncoder().encode(
      JSON.stringify({ alg: "EdDSA", typ: "at+jwt", kid: c.kid }),
    ),
  );
  const body = b64(
    new TextEncoder().encode(
      JSON.stringify({
        iss: c.origin,
        sub: runtime.agent,
        aud: resource,
        client_id: runtime.agent,
        scope: [...new Set(scopes)].join(" "),
        iat: now,
        exp,
        jti,
        ftai_key_thumbprint: runtime.thumbprint,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "jwk",
    c.jwk,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const token =
    head +
    "." +
    body +
    "." +
    b64(
      new Uint8Array(
        await crypto.subtle.sign(
          "Ed25519",
          key,
          new TextEncoder().encode(head + "." + body),
        ),
      ),
    );
  try {
    await db().batch([
      db().prepare("DELETE FROM oauth_tokens WHERE expires<?").bind(now),
      db()
        .prepare("INSERT INTO runtime_replays(id,expires) VALUES(?,?)")
        .bind("oauth:" + runtime.agent + ":" + data.data.jti, data.data.exp),
      db()
        .prepare(
          "INSERT INTO oauth_tokens(id,agent,token_hash,audience,scopes,thumbprint,expires) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          jti,
          runtime.agent,
          await digest(token),
          resource,
          scopes.join(" "),
          runtime.thumbprint,
          exp,
        ),
    ]);
  } catch {
    throw new HttpError(
      401,
      "Client assertion was already used. Generate a fresh jti.",
    );
  }
  return {
    access_token: token,
    token_type: "Bearer",
    expires_in: 300,
    scope: scopes.join(" "),
  };
}
export async function oauthIdentity(
  req: Request,
  resource: string,
  scope?: string,
) {
  rejectCrossOrigin(req);
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const row = await db()
    .prepare(
      "SELECT t.agent,t.scopes FROM oauth_tokens t JOIN runtime_agents r ON r.agent=t.agent JOIN agents a ON a.code=t.agent JOIN enrollment_policies p ON p.id=r.policy_id WHERE t.token_hash=? AND t.expires>? AND t.audience=? AND t.thumbprint=r.thumbprint AND r.revoked=0 AND a.status='active' AND p.status='active'",
    )
    .bind(
      await digest(token),
      Math.floor(Date.now() / 1000),
      config().origin + resource,
    )
    .first<{ agent: string; scopes: string }>();
  if (!row)
    throw new HttpError(
      401,
      "A current, audience-bound agent access token is required.",
    );
  if (scope && !row.scopes.split(" ").includes(scope))
    throw new HttpError(403, "Insufficient OAuth scope.");
  await rateLimit("standard:" + row.agent, 180, 60);
  return row;
}
export async function revokeToken(req: Request) {
  await rateLimit("revoke:" + clientBucket(req), 60, 60);
  const p = await form(req);
  const token = p.get("token") || "";
  await db()
    .prepare("DELETE FROM oauth_tokens WHERE token_hash=?")
    .bind(await digest(token))
    .run();
  return {};
}
export function oauthError(error: unknown, resource = "/api/mcp") {
  const status = error instanceof HttpError ? error.status : 503;
  return Response.json(
    {
      error:
        status === 401
          ? "invalid_token"
          : status === 403
            ? "insufficient_scope"
            : "invalid_request",
      error_description:
        error instanceof HttpError
          ? error.message
          : "The service is temporarily unavailable.",
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer resource_metadata="${config().origin}/.well-known/oauth-protected-resource${resource}", scope="passport:read registry:read"`,
      },
    },
  );
}

export function tokenError(error: unknown) {
  const status = error instanceof HttpError ? error.status : 503;
  return Response.json(
    {
      error:
        status === 401
          ? "invalid_client"
          : status === 429
            ? "temporarily_unavailable"
            : status >= 500
              ? "server_error"
              : "invalid_request",
      error_description:
        error instanceof HttpError
          ? error.message
          : "The token service is unavailable.",
    },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}
