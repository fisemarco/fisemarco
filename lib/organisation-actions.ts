import { z } from "zod";
import { db, getAgent, HttpError } from "./server";
import { member } from "./enterprise-core";

// Both the browser API and authenticated MCP call these authorization-preserving services.
export async function createOrganisation(
  user: string,
  body: unknown,
  requestId?: string,
) {
  const { name } = z
    .object({ name: z.string().trim().min(2).max(160) })
    .strict()
    .parse(body);
  const id = requestId
    ? z.string().uuid().parse(requestId)
    : crypto.randomUUID();
  const created = new Date().toISOString();
  const existing = await db()
    .prepare("SELECT owner,name FROM organisations WHERE id=?")
    .bind(id)
    .first<{ owner: string; name: string }>();
  if (existing) {
    if (existing.owner !== user || existing.name !== name)
      throw new HttpError(
        409,
        "Request ID already used for another organisation.",
      );
    return { id, name, assurance: "declared", created: false };
  }
  const results = await db().batch([
    db()
      .prepare(
        "INSERT INTO organisations(id,name,owner,created) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(id, name, user, created),
    db()
      .prepare(
        "INSERT INTO organisation_members(organisation,user,role,joined) SELECT id,owner,'owner',? FROM organisations WHERE id=? AND owner=? AND name=? ON CONFLICT(organisation,user) DO NOTHING",
      )
      .bind(created, id, user, name),
  ]);
  const saved = await db()
    .prepare("SELECT owner,name FROM organisations WHERE id=?")
    .bind(id)
    .first<{ owner: string; name: string }>();
  if (!saved || saved.owner !== user || saved.name !== name)
    throw new HttpError(
      409,
      "Request ID already used for another organisation.",
    );
  return {
    id,
    name,
    assurance: "declared",
    created: results[0].meta.changes === 1,
  };
}

export async function assignOrganisationAgent(
  org: string,
  user: string,
  body: unknown,
) {
  await member(z.string().uuid().parse(org), user, true);
  const input = z
    .object({
      agent: z.string().regex(/^FTAI-(?:[A-F0-9]{4}-){2}[A-F0-9]{4}$/),
      classification: z.enum(["A1", "A2", "A3", "A4", "A5", "A6", "A7"]),
      team: z.string().trim().max(100),
    })
    .strict()
    .parse(body);
  await getAgent(input.agent, user, true);
  const result = await db()
    .prepare(
      "INSERT INTO organisation_agents(agent,organisation,classification,team) VALUES(?,?,?,?) ON CONFLICT(agent) DO UPDATE SET classification=excluded.classification,team=excluded.team WHERE organisation_agents.organisation=excluded.organisation",
    )
    .bind(input.agent, org, input.classification, input.team)
    .run();
  if (!result.meta.changes)
    throw new HttpError(
      409,
      "Remove the existing organisation assignment first.",
    );
  return { assigned: true, agent: input.agent, organisation: org };
}
