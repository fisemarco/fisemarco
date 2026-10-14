import { env } from "cloudflare:workers";
import { verifySvid, type Settings } from "./spiffe-verifier";
import { z } from "zod";
import { config, db, HttpError } from "./server";
import { runtimeAuth } from "./runtime";
import { digest } from "./crypto";

export async function spiffeAttestation(req: Request) {
  const ctx = await runtimeAuth(req);
  if (ctx.row.status !== "active" || ctx.policy.status !== "active")
    throw new HttpError(
      403,
      "An active passport and enrollment policy are required.",
    );
  const e = env as unknown as Record<string, string | undefined>;
  const settings: Settings = {
    bundles: JSON.parse(e.FTAI_SPIFFE_BUNDLES || "{}"),
    bindings: JSON.parse(e.FTAI_SPIFFE_BINDINGS || "{}"),
  };
  if (req.method === "GET") {
    const row = await db()
      .prepare(
        "SELECT spiffe_id,valid_until,bundle_hash,attested FROM runtime_attestations WHERE agent=?",
      )
      .bind(ctx.row.code)
      .first<{
        spiffe_id: string;
        valid_until: number;
        bundle_hash: string;
        attested: string;
      }>();
    const subject = settings.bindings[ctx.row.code],
      bundle = subject ? settings.bundles[new URL(subject).host] : undefined;
    return {
      attestation: row,
      current: !!(
        row &&
        row.valid_until > Date.now() / 1000 &&
        subject === row.spiffe_id &&
        bundle &&
        (await digest(JSON.stringify(bundle))) === row.bundle_hash
      ),
      configured: !!subject,
    };
  }
  if (req.method !== "POST") throw new HttpError(405, "Use GET or POST.");
  const input = z
    .object({ jwtSvid: z.string().min(20).max(16000) })
    .strict()
    .parse(ctx.input);
  const verified = await verifySvid(
      input.jwtSvid,
      ctx.row.code,
      config().origin + "/api/v1/runtime/attest",
      settings,
    ),
    attested = new Date().toISOString();
  await db()
    .prepare(
      "INSERT INTO runtime_attestations(agent,spiffe_id,valid_until,bundle_hash,attested,proof_hash) VALUES(?,?,?,?,?,?) ON CONFLICT(agent) DO UPDATE SET spiffe_id=excluded.spiffe_id,valid_until=excluded.valid_until,bundle_hash=excluded.bundle_hash,attested=excluded.attested,proof_hash=excluded.proof_hash",
    )
    .bind(
      ctx.row.code,
      verified.spiffeId,
      verified.validUntil,
      verified.bundleHash,
      attested,
      verified.proofHash,
    )
    .run();
  return {
    attestation: { ...verified, attested },
    meaning:
      "A configured SPIFFE issuer attested this workload identity. This does not verify employment or autonomous operation.",
  };
}
