import { authorizationMetadata } from "@/lib/oauth";
export async function GET() {
  return Response.json(authorizationMetadata());
}
