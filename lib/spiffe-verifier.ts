import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { HttpError } from "./http-error";
import { digest } from "./crypto";
const algorithms = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
];
export type Settings = {
  bundles: Record<string, { keys: JWK[] }>;
  bindings: Record<string, string>;
};
export async function verifySvid(
  token: string,
  agent: string,
  audience: string,
  settings: Settings,
) {
  const subject = settings.bindings[agent];
  if (
    !subject ||
    !/^spiffe:\/\/[a-z0-9._-]+\/(?:[a-zA-Z0-9._-]+\/?)+$/.test(subject)
  )
    throw new HttpError(
      403,
      "No operator-approved SPIFFE binding exists for this passport.",
    );
  const bundle = settings.bundles[new URL(subject).host];
  if (!bundle)
    throw new HttpError(403, "The SPIFFE trust domain is not configured.");
  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw new HttpError(401, "Malformed JWT-SVID.");
  }
  if (
    !algorithms.includes(header.alg || "") ||
    Object.keys(header).some((k) => !["alg", "kid", "typ"].includes(k)) ||
    (header.typ && !["JWT", "JOSE"].includes(header.typ))
  )
    throw new HttpError(401, "Unsupported JWT-SVID header.");
  const candidates = bundle.keys.filter(
    (k) =>
      k.use === "jwt-svid" &&
      k.kid &&
      (!header.kid || k.kid === header.kid) &&
      (!k.alg || k.alg === header.alg) &&
      !k.d &&
      !k.k,
  );
  for (const candidate of candidates) {
    try {
      const key = await importJWK({ ...candidate, use: "sig" }, header.alg);
      const { payload } = await jwtVerify(token, key, {
        algorithms: [header.alg!],
        audience,
        subject,
        requiredClaims: ["sub", "aud", "exp"],
      });
      // FTAI uses a stricter, single-audience, one-hour maximum remaining lifetime.
      if (
        payload.exp! > Math.floor(Date.now() / 1000) + 3600 ||
        (Array.isArray(payload.aud) && payload.aud.length !== 1)
      )
        continue;
      return {
        spiffeId: subject,
        validUntil: payload.exp!,
        bundleHash: await digest(JSON.stringify(bundle)),
        proofHash: await digest(token),
      };
    } catch {
      /* Try another trusted key when a bundle contains rotated keys. */
    }
  }
  throw new HttpError(
    401,
    "JWT-SVID signature, audience, subject or lifetime is invalid.",
  );
}
