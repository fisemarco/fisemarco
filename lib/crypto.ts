const encoder = new TextEncoder();
export function b64(data: Uint8Array) {
  let binary = "";
  for (let i = 0; i < data.length; i += 8192)
    binary += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
export function unb64(s: string) {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
}
export async function digest(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function sign(payload: unknown, jwk: JsonWebKey, kid: string) {
  const header = b64(
    encoder.encode(
      JSON.stringify({ alg: "EdDSA", typ: "vc+jwt", cty: "vc", kid }),
    ),
  );
  const body = b64(encoder.encode(JSON.stringify(payload)));
  const input = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "Ed25519",
    key,
    encoder.encode(input),
  );
  return `${input}.${b64(new Uint8Array(signature))}`;
}
export async function verify(jws: string, publicJwk: JsonWebKey, kid: string) {
  try {
    const [head, body, sig, ...extra] = jws.split(".");
    if (extra.length || !head || !body || !sig) return false;
    const header = JSON.parse(new TextDecoder().decode(unb64(head)));
    if (
      header.alg !== "EdDSA" ||
      header.typ !== "vc+jwt" ||
      header.kid !== kid ||
      header.crit
    )
      return false;
    const key = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      unb64(sig),
      encoder.encode(`${head}.${body}`),
    );
  } catch {
    return false;
  }
}
