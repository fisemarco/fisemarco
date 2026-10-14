import { z } from "zod";
import { verify, unb64 } from "./crypto";
import { HttpError } from "./http-error";
const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const attestationSchema = z
  .object({
    iss: z.string().min(1),
    aud: z.string(),
    iat: z.number().int(),
    exp: z.number().int(),
    jti: uuid,
    organisation: uuid,
    legalName: z.string().min(2).max(200),
    country: z.string().regex(/^[A-Z]{2}$/),
    registrationNumber: z.string().min(1).max(100),
    evidenceUrl: z
      .string()
      .url()
      .max(2000)
      .refine((v) => v.startsWith("https://")),
    evidenceHash: hash,
    checks: z
      .array(z.enum(["legal-existence", "representative-authority"]))
      .min(2)
      .max(2),
  })
  .strict();
export async function validateOperatorCredential(
  credential: string,
  org: string,
  origin: string,
  trusted: { issuer: string; kid: string; jwk: JsonWebKey }[],
  revoked: string[],
  now = Math.floor(Date.now() / 1000),
) {
  let data: z.infer<typeof attestationSchema>;
  try {
    data = attestationSchema.parse(
      JSON.parse(new TextDecoder().decode(unb64(credential.split(".")[1]))),
    );
  } catch {
    throw new HttpError(400, "Invalid operator attestation payload.");
  }
  const verifier = trusted.find((v) => v.issuer === data.iss);
  if (!verifier || !(await verify(credential, verifier.jwk, verifier.kid)))
    throw new HttpError(
      403,
      "Attestation must be signed by an independently configured trusted verifier.",
    );
  if (
    data.organisation !== org ||
    data.aud !== origin ||
    data.iat > now + 60 ||
    data.exp <= now ||
    data.exp <= data.iat ||
    data.exp - data.iat > 86400 * 366 ||
    !data.checks.includes("legal-existence") ||
    !data.checks.includes("representative-authority")
  )
    throw new HttpError(
      403,
      "Attestation scope, checks or validity are not acceptable.",
    );
  if (revoked.includes(data.jti))
    throw new HttpError(403, "Operator attestation has been revoked.");
  return data;
}
