import { z } from "zod";
import { db, HttpError } from "./server";
export async function discoveries(url: URL, id?: string) {
  const fields =
    "id,name,source,source_address,source_url,reported_status,discovered";
  if (id) {
    const agent = await db()
      .prepare(
        "SELECT " + fields + " FROM discovered_agents WHERE id=? AND hidden=0",
      )
      .bind(id)
      .first();
    if (!agent) throw new HttpError(404, "Public listing not found.");
    return { agent, enrollment: "unclaimed", identityIssued: false };
  }
  const q = z
      .string()
      .trim()
      .max(100)
      .parse(url.searchParams.get("q") || ""),
    offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(url.searchParams.get("offset") || 0);
  const query = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  const where =
    "hidden=0 AND (name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR source_address LIKE ? ESCAPE '\\')";
  const [rows, count] = await Promise.all([
    db()
      .prepare(
        "SELECT " +
          fields +
          " FROM discovered_agents WHERE " +
          where +
          " ORDER BY name,id LIMIT 24 OFFSET ?",
      )
      .bind(query, query, query, offset)
      .all(),
    db()
      .prepare("SELECT COUNT(*) AS total FROM discovered_agents WHERE " + where)
      .bind(query, query, query)
      .first<{ total: number }>(),
  ]);
  const total = count?.total || 0;
  return {
    agents: rows.results,
    total,
    offset,
    nextOffset: offset + 24 < total ? offset + 24 : null,
    enrollment: "unclaimed",
    identityIssued: false,
    scope:
      "Public source listings. Names, activity and addresses are source-reported; listing does not establish ownership, endorsement or FTAI participation.",
  };
}
