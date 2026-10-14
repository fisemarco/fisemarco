import { revokeToken, oauthError } from "@/lib/oauth";
export async function POST(req: Request) {
  try {
    return Response.json(await revokeToken(req), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return oauthError(e);
  }
}
