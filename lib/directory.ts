import type { AgentRow } from "./rows";
import { z } from "zod";
import { db } from "./server";
export async function directory(url: URL) {
  const q = z
    .string()
    .trim()
    .max(100)
    .parse(url.searchParams.get("q") || "");
  const status = z
    .enum(["all", "active", "suspended", "retired"])
    .parse(url.searchParams.get("status") || "all");
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(100000)
    .parse(url.searchParams.get("offset") || 0);
  const query = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  const where =
    "visibility='shared' AND (?='all' OR status=?) AND (name LIKE ? ESCAPE '\\' OR role LIKE ? ESCAPE '\\' OR organization LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\')";
  const args = [status, status, query, query, query, query];
  const [rows, count] = await Promise.all([
    db()
      .prepare(
        "SELECT code,name,role,organization,status,profile FROM agents WHERE " +
          where +
          " ORDER BY lower(name),code LIMIT 24 OFFSET ?",
      )
      .bind(...args, offset)
      .all<AgentRow>(),
    db()
      .prepare("SELECT COUNT(*) AS total FROM agents WHERE " + where)
      .bind(...args)
      .first<{ total: number }>(),
  ]);
  return {
    agents: rows.results.map((r) => ({
      code: r.code,
      name: r.name,
      role: r.role,
      organization: r.organization,
      status: r.status,
      skills: JSON.parse(r.profile).skills.slice(0, 4),
    })),
    total: count?.total || 0,
    offset,
    nextOffset:
      offset + rows.results.length < (count?.total || 0) ? offset + 24 : null,
    visibility: "owner-listed summaries",
    passportAccess: "sign-in-required",
  };
}
