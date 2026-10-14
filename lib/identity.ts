import type { RecordRow } from "./rows";
import { db, config, HttpError } from "./server";
import { verify, digest, unb64 } from "./crypto";

/** The first signed record is the permanent identity anchor, separate from mutable metadata. */
export async function identitySeal(code: string) {
  const root = await db()
    .prepare("SELECT * FROM records WHERE agent=? AND sequence=1")
    .bind(code)
    .first<RecordRow>();
  if (!root || root.previous_hash !== "GENESIS" || root.kind !== "profile")
    throw new HttpError(409, "The original identity record is unavailable.");
  const c = config();
  const signed = await verify(root.jws, c.publicJwk, c.kid);
  const content = {
    id: root.id,
    agent: root.agent,
    sequence: root.sequence,
    kind: root.kind,
    title: root.title,
    payload: JSON.parse(root.payload),
    actor: root.actor,
    created: root.created,
    previous_hash: root.previous_hash,
  };
  const hash = await digest(JSON.stringify(content));
  const receipt = JSON.parse(
    new TextDecoder().decode(unb64(root.jws.split(".")[1])),
  );
  const valid =
    signed &&
    hash === root.hash &&
    JSON.stringify(receipt.credentialSubject?.record) ===
      JSON.stringify({ ...content, hash });
  if (!valid)
    throw new HttpError(409, "The original identity seal failed verification.");
  return {
    version: 1,
    identityId: "urn:uuid:" + root.id,
    code,
    issued: root.created,
    birthHash: root.hash,
    issuer: c.issuer,
    keyId: c.kid,
    publicKeyJwk: c.publicJwk,
    originalReceipt: root.jws,
    lock: "append-only",
    signatureValid: true,
    meaning:
      "Permanent code and original registration. Profile updates are signed additions. Database guards and signatures expose tampering; privileged infrastructure administrators remain a trust boundary.",
  };
}
