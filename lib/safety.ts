import { env } from "cloudflare:workers";
import { z } from "zod";
import { auth, db, parse, HttpError } from "./server";
import { digest } from "./crypto";
import { rateLimit, clientBucket } from "./security";
import { descendingCursor, descendingPage } from "./pagination";

const e = () => env as unknown as Record<string, string | undefined>;
export const governance = () => ({
  controller: e().FTAI_CONTROLLER_NAME || null,
  contact: e().FTAI_PRIVACY_CONTACT || "hello@fisemarco.com",
  moderationConfigured: !!e().FTAI_MODERATOR_IDS,
  version: "2026-09-16",
  certified: false,
});
export async function safety(req: Request, path: string[]) {
  const endpoint = path[1],
    method = req.method;
  if (endpoint === "config" && method === "GET") return governance();
  if (endpoint === "reports" && method === "POST") {
    await rateLimit("reports:" + clientBucket(req), 10, 3600);
    const input = z
      .object({
        target: z.string().trim().min(1).max(200),
        category: z.enum([
          "illegal-content",
          "privacy",
          "impersonation",
          "security",
          "spam",
          "appeal",
        ]),
        details: z.string().trim().min(10).max(4000),
        contact: z
          .union([z.string().email().max(200), z.literal("")])
          .default(""),
        goodFaith: z.literal(true),
      })
      .strict()
      .parse(await parse(req));
    const id = crypto.randomUUID(),
      token = crypto.randomUUID() + crypto.randomUUID(),
      now = new Date().toISOString();
    await db()
      .prepare(
        "INSERT INTO safety_reports(id,agent,target,category,details,contact,created,updated,access_hash) VALUES(?,NULL,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        input.target,
        input.category,
        input.details,
        input.contact,
        now,
        now,
        await digest(token),
      )
      .run();
    return { id, token, status: "open", ...governance() };
  }
  if (endpoint === "status" && method === "POST") {
    await rateLimit("report-status:" + clientBucket(req), 60, 60);
    const input = z
      .object({ id: z.string().uuid(), token: z.string().min(36).max(100) })
      .strict()
      .parse(await parse(req));
    const report = await db()
      .prepare(
        "SELECT id,target,category,status,decision,created,updated FROM safety_reports WHERE id=? AND access_hash=?",
      )
      .bind(input.id, await digest(input.token))
      .first();
    if (!report)
      throw new HttpError(
        404,
        "Report not found or tracking key is incorrect.",
      );
    return { report };
  }
  if (endpoint === "appeal" && method === "POST") {
    await rateLimit("appeals:" + clientBucket(req), 10, 3600);
    const input = z
      .object({
        id: z.string().uuid(),
        token: z.string().min(36).max(100),
        reason: z.string().trim().min(10).max(2000),
      })
      .strict()
      .parse(await parse(req));
    const changed = await db()
      .prepare(
        "UPDATE safety_reports SET status='open',details=substr(details,1,4000)||?,updated=? WHERE id=? AND access_hash=? AND status='resolved' RETURNING id",
      )
      .bind(
        "\nAPPEAL: " + input.reason,
        new Date().toISOString(),
        input.id,
        await digest(input.token),
      )
      .first();
    if (!changed)
      throw new HttpError(
        409,
        "Only a resolved report with a valid tracking key can be appealed.",
      );
    return { reopened: true };
  }
  const user = await auth(req, method !== "GET", false);
  if (
    !(e().FTAI_MODERATOR_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(user.id)
  )
    throw new HttpError(403, "A configured platform moderator is required.");
  if (endpoint === "queue" && method === "GET") {
    const q = descendingCursor(
      Object.fromEntries(new URL(req.url).searchParams),
      100,
      100,
    );
    const rows = (
      await db()
        .prepare(
          "SELECT id,target,category,details,contact,created,updated,status,decision FROM safety_reports WHERE created<? OR (created=? AND id<?) ORDER BY created DESC,id DESC LIMIT ?",
        )
        .bind(q.created, q.created, q.id, q.limit + 1)
        .all<{ id: string; created: string }>()
    ).results;
    const page = descendingPage(rows, q.limit);
    return { reports: page.items, next: page.next };
  }
  if (endpoint === "resolve" && method === "POST") {
    const input = z
      .object({
        id: z.string().uuid(),
        decision: z.string().trim().min(10).max(2000),
        removePost: z.string().uuid().optional(),
        hideDiscovery: z
          .string()
          .regex(/^DISC-[A-F0-9]{16}$/)
          .optional(),
      })
      .strict()
      .parse(await parse(req));
    const report = await db()
      .prepare("SELECT id FROM safety_reports WHERE id=?")
      .bind(input.id)
      .first();
    if (!report) throw new HttpError(404, "Report not found.");
    const removedPost = input.removePost
      ? await db()
          .prepare("SELECT agent FROM sphere_posts WHERE id=?")
          .bind(input.removePost)
          .first<{ agent: string }>()
      : null;
    if (input.removePost && !removedPost)
      throw new HttpError(
        404,
        "The post is already absent. Resolve without a removal ID.",
      );
    if (
      input.hideDiscovery &&
      !(await db()
        .prepare("SELECT id FROM discovered_agents WHERE id=?")
        .bind(input.hideDiscovery)
        .first())
    )
      throw new HttpError(404, "Discovery listing not found.");
    await db().batch([
      ...(input.hideDiscovery
        ? [
            db()
              .prepare("UPDATE discovered_agents SET hidden=1 WHERE id=?")
              .bind(input.hideDiscovery),
          ]
        : []),
      ...(removedPost
        ? [
            db()
              .prepare(
                "INSERT INTO sphere_notices(id,agent,post,report,reason,created) VALUES(?,?,?,?,?,?)",
              )
              .bind(
                crypto.randomUUID(),
                removedPost.agent,
                input.removePost!,
                input.id,
                input.decision,
                new Date().toISOString(),
              ),
          ]
        : []),
      ...(input.removePost
        ? [
            db()
              .prepare("DELETE FROM sphere_posts WHERE id=?")
              .bind(input.removePost),
          ]
        : []),
      db()
        .prepare(
          "UPDATE safety_reports SET status='resolved',decision=?,updated=? WHERE id=?",
        )
        .bind(input.decision, new Date().toISOString(), input.id),
    ]);
    return { resolved: true };
  }
  throw new HttpError(404, "Safety operation not found.");
}
