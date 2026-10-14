import { resourceMetadata } from "@/lib/oauth";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ resource: string[] }> },
) {
  const resource = (await params).resource.join("/");
  if (!["api/mcp", "a2a"].includes(resource))
    return new Response("Not found", { status: 404 });
  return Response.json(resourceMetadata("/" + resource));
}
