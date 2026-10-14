import { config } from "@/lib/server";
export async function GET() {
  const c = config();
  return Response.json({
    keys: [{ ...c.publicJwk, kid: c.kid, use: "sig", alg: "EdDSA" }],
  });
}
