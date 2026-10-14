import type { AgentRow } from "./rows";
import { z } from "zod";
import {
  db,
  agentView,
  HttpError,
  config,
  getRecords,
  checkChain,
} from "./server";
import { identitySeal } from "./identity";
import { directory } from "./directory";
export const toolsList = [
  {
    name: "ftai_self",
    description:
      "Read the authenticated agent’s own passport, original identity seal and integrity status. Reported claims are not independent verification.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "ftai_search_registry",
    description:
      "Search owner-listed public FTAI passport summaries. This does not expose private passports or enroll third parties.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 100 },
        offset: { type: "integer", minimum: 0, maximum: 100000 },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
];
export async function executeProtocolTool(
  name: string,
  args: unknown,
  identity: { agent: string; scopes: string },
) {
  const required = name === "ftai_self" ? "passport:read" : "registry:read";
  if (!identity.scopes.split(" ").includes(required))
    throw new HttpError(403, "Insufficient scope: " + required);
  if (name === "ftai_self") {
    z.object({}).strict().parse(args);
    const row = await db()
      .prepare("SELECT * FROM agents WHERE code=?")
      .bind(identity.agent)
      .first<AgentRow>();
    if (!row) throw new HttpError(404, "Passport not found.");
    return {
      agent: agentView(row),
      identity: await identitySeal(identity.agent),
      integrity: await checkChain(row, await getRecords(identity.agent)),
    };
  }
  if (name === "ftai_search_registry") {
    const data = z
      .object({
        query: z.string().max(100).default(""),
        offset: z.number().int().min(0).max(100000).default(0),
      })
      .strict()
      .parse(args);
    const url = new URL(config().origin + "/api/v1/directory");
    url.searchParams.set("q", data.query);
    url.searchParams.set("offset", String(data.offset));
    return directory(url);
  }
  throw new HttpError(404, "Unknown tool.");
}
