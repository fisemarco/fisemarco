import { issueToken, tokenError } from "@/lib/oauth";
export async function POST(req: Request) {
  try {
    return Response.json(await issueToken(req), {
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  } catch (e) {
    return tokenError(e);
  }
}
