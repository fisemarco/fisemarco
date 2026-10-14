import { createPublicKey, createHash, verify } from "node:crypto";
/** Verifies a page against an independently trusted registry key. A verified graph is still not an execution permit. */
export function verifyGraphPage(
  page,
  { issuer, kid, publicKeyJwk, organisation, now = Date.now() },
) {
  try {
    const { receipt, ...graph } = page;
    const [h, p, s, ...extra] = receipt.split(".");
    if (extra.length || !s) return false;
    const header = JSON.parse(Buffer.from(h, "base64url")),
      payload = JSON.parse(Buffer.from(p, "base64url"));
    if (
      header.alg !== "EdDSA" ||
      header.typ !== "vc+jwt" ||
      header.crit ||
      !Number.isFinite(now) ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= payload.iat ||
      header.kid !== kid ||
      payload.iss !== issuer ||
      payload.exp <= now / 1000 ||
      payload.iat > now / 1000 + 60 ||
      payload.exp - payload.iat > 300
    )
      return false;
    if (
      !verify(
        null,
        Buffer.from(h + "." + p),
        createPublicKey({ key: publicKeyJwk, format: "jwk" }),
        Buffer.from(s, "base64url"),
      )
    )
      return false;
    const subject = payload.vc?.credentialSubject;
    if (
      subject?.type !== "FTAITrustGraphPage" ||
      graph.schema !== "ftai-trust-graph/1" ||
      graph.organisation !== organisation
    )
      return false;
    const { type, hash, ...signedGraph } = subject;
    return (
      typeof type === "string" &&
      hash ===
        createHash("sha256").update(JSON.stringify(graph)).digest("hex") &&
      JSON.stringify(signedGraph) === JSON.stringify(graph)
    );
  } catch {
    return false;
  }
}
