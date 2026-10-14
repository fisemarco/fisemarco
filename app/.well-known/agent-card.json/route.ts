import { agentCard } from "@/lib/a2a";
export async function GET() {
  return Response.json(agentCard(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
