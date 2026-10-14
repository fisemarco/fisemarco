import { z } from "zod";
import { db, parse, HttpError } from "@/lib/server";
import { oauthIdentity, oauthError } from "@/lib/oauth";
import { executeProtocolTool } from "@/lib/protocol-tools";
import { agentCard } from "@/lib/a2a";
import { digest } from "@/lib/crypto";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  let id: string | number | null = null;
  try {
    const identity = await oauthIdentity(req, "/a2a");
    const parsed = z
      .object({
        jsonrpc: z.literal("2.0"),
        id: z.union([z.string(), z.number()]),
        method: z.string(),
        params: z.record(z.unknown()).optional(),
      })
      .strict()
      .safeParse(await parse(req));
    if (!parsed.success)
      return json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid JSON-RPC request." },
        },
        400,
      );
    const input = parsed.data;
    id = input.id;
    const error = (code: number, message: string) =>
      json({ jsonrpc: "2.0", id, error: { code, message } });
    const now = Math.floor(Date.now() / 1000);
    await db().prepare("DELETE FROM a2a_tasks WHERE expires<?").bind(now).run();
    let result: unknown;
    if (input.method === "agent/getAuthenticatedExtendedCard") {
      result = agentCard();
    } else if (
      input.method === "tasks/get" ||
      input.method === "tasks/cancel"
    ) {
      const p = z
        .object({
          id: z.string().uuid(),
          historyLength: z.number().int().min(0).optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .strict()
        .parse(input.params);
      const task = await db()
        .prepare(
          "SELECT result,scopes FROM a2a_tasks WHERE id=? AND agent=? AND expires>?",
        )
        .bind(p.id, identity.agent, now)
        .first<{ result: string; scopes: string }>();
      if (!task) return error(-32001, "Task not found.");
      if (!identity.scopes.split(" ").includes(task.scopes))
        throw new HttpError(403, "Insufficient scope for this task.");
      if (input.method === "tasks/cancel")
        return error(
          -32002,
          "The task already completed and cannot be canceled.",
        );
      result = JSON.parse(task.result);
    } else if (input.method === "message/send") {
      const p = z
        .object({
          message: z
            .object({
              kind: z.literal("message").optional(),
              role: z.literal("user"),
              messageId: z.string().uuid(),
              contextId: z.string().uuid().optional(),
              taskId: z.string().uuid().optional(),
              parts: z
                .array(
                  z
                    .object({
                      kind: z.literal("data"),
                      data: z
                        .object({
                          operation: z.enum([
                            "passport.self",
                            "registry.search",
                          ]),
                          query: z.string().max(100).optional(),
                          offset: z
                            .number()
                            .int()
                            .min(0)
                            .max(100000)
                            .optional(),
                        })
                        .strict(),
                      metadata: z.record(z.unknown()).optional(),
                    })
                    .strict(),
                )
                .length(1),
              metadata: z.record(z.unknown()).optional(),
            })
            .strict(),
          configuration: z
            .object({
              acceptedOutputModes: z.array(z.string()).optional(),
              blocking: z.boolean().optional(),
              historyLength: z.number().int().min(0).optional(),
              pushNotificationConfig: z.unknown().optional(),
            })
            .strict()
            .optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .strict()
        .parse(input.params);
      if (p.configuration?.pushNotificationConfig)
        return error(-32003, "Push notifications are not supported.");
      if (
        p.configuration?.acceptedOutputModes &&
        !p.configuration.acceptedOutputModes.includes("application/json")
      )
        return error(-32005, "Only application/json output is supported.");
      if (p.message.taskId)
        return error(
          -32004,
          "This registry service completes each request; start a new message.",
        );
      const requestHash = await digest(JSON.stringify(p.message));
      const existing = await db()
        .prepare(
          "SELECT request_hash,result,scopes FROM a2a_tasks WHERE agent=? AND message_id=?",
        )
        .bind(identity.agent, p.message.messageId)
        .first<{ request_hash: string; result: string; scopes: string }>();
      if (existing) {
        if (existing.request_hash !== requestHash)
          return error(
            -32602,
            "Message identifier already used with different content.",
          );
        if (!identity.scopes.split(" ").includes(existing.scopes))
          throw new HttpError(403, "Insufficient task scope.");
        return json({
          jsonrpc: "2.0",
          id,
          result: JSON.parse(existing.result),
        });
      }
      const data = p.message.parts[0].data,
        scope =
          data.operation === "passport.self"
            ? "passport:read"
            : "registry:read";
      const output = await executeProtocolTool(
        data.operation === "passport.self"
          ? "ftai_self"
          : "ftai_search_registry",
        data.operation === "passport.self"
          ? {}
          : { query: data.query || "", offset: data.offset || 0 },
        identity,
      );
      const taskId = crypto.randomUUID(),
        created = new Date().toISOString();
      result = {
        id: taskId,
        contextId: p.message.contextId || crypto.randomUUID(),
        kind: "task",
        status: { state: "completed", timestamp: created },
        artifacts: [
          {
            artifactId: crypto.randomUUID(),
            name: data.operation,
            parts: [{ kind: "data", data: output }],
          },
        ],
      };
      try {
        await db()
          .prepare(
            "INSERT INTO a2a_tasks(id,agent,message_id,request_hash,result,scopes,expires) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            taskId,
            identity.agent,
            p.message.messageId,
            requestHash,
            JSON.stringify(result),
            scope,
            now + 3600,
          )
          .run();
      } catch {
        return error(
          -32602,
          "Concurrent request for this message. Retry the same request.",
        );
      }
    } else
      return error(
        -32601,
        "Method not supported by this non-streaming registry agent.",
      );
    return json({ jsonrpc: "2.0", id, result });
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403))
      return oauthError(e, "/a2a");
    return json(
      {
        jsonrpc: "2.0",
        id,
        error: {
          code:
            e instanceof z.ZodError
              ? -32602
              : e instanceof HttpError && e.status === 400
                ? -32700
                : -32603,
          message:
            e instanceof z.ZodError
              ? "Invalid parameters."
              : e instanceof HttpError
                ? e.message
                : "Internal service error.",
        },
      },
      e instanceof HttpError ? e.status : 200,
    );
  }
}
