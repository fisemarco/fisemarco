import { config } from "@/lib/server";
export async function GET() {
  try {
    const c = config();
    return Response.json(
      {
        "@context": [
          "https://www.w3.org/ns/did/v1",
          "https://w3id.org/security/jws/v1",
        ],
        id: c.issuer,
        verificationMethod: [
          {
            id: c.kid,
            type: "JsonWebKey2020",
            controller: c.issuer,
            publicKeyJwk: c.publicJwk,
          },
        ],
        assertionMethod: [c.kid],
      },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch {
    return Response.json(
      { error: "Issuer temporarily unavailable" },
      { status: 503 },
    );
  }
}
