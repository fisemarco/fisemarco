#!/usr/bin/env node
// Private stdin/stdout bridge. Never bind this process to an HTTP port or expose it as a model tool.
import { createInterface } from "node:readline";
import { FTAIClient } from "./ftai.mjs";
let client,
  pending,
  busy = false;
const methods = new Set([
  "me",
  "heartbeat",
  "importHistory",
  "permitStatus",
  "flushOutcomes",
  "delegateAuthority",
  "requestApproval",
  "consumeApproval",
  "checkAuthority",
  "setPublicListing",
  "inviteAgent",
  "exportIdentity",
  "rotateSelfManagedKey",
  "eraseIdentity",
  "prepareKeyRotation",
  "activateKeyRotation",
  "reportOutcome",
  "sphere",
  "joinSphere",
  "post",
  "oauthToken",
  "attestSpiffe",
  "spiffeStatus",
]);
const send = (tag, value) =>
  process.stdout.write(tag + "\t" + JSON.stringify(value ?? null) + "\n");
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", async (line) => {
  if (Buffer.byteLength(line) > 1_000_000) {
    send("E", { message: "Bridge message exceeds 1 MB" });
    return;
  }
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    send("E", { message: "Invalid JSON" });
    return;
  }
  if (req.method === "callback") {
    if (!pending) {
      send("E", { message: "No task callback pending" });
      return;
    }
    const p = pending;
    pending = null;
    req.error
      ? p.reject(new Error("Host callback failed"))
      : p.resolve(req.result);
    return;
  }
  if (busy) {
    send("E", { message: "One call at a time is required" });
    return;
  }
  busy = true;
  try {
    if (!Array.isArray(req.args)) throw Error("args must be an array");
    let result;
    if (req.method === "init") {
      if (client?.initialized) throw Error("Already initialized");
      if (!client) client = new FTAIClient(req.args[0]);
      if (req.args[0]?.deferInit) result = { initialized: false };
      else {
        await client.init();
        result = { code: client.state.code, initialized: true };
      }
    } else {
      if (req.method === "close") {
        if (client) await client.close();
        send("R", { closed: true });
        lines.close();
        process.stdin.destroy();
        return;
      }
      if (
        !client ||
        (!client.initialized &&
          !["prepareKeyRotation", "activateKeyRotation"].includes(req.method))
      )
        throw Error("Initialize before using lifecycle operations");
      if (req.method === "runTask" || req.method === "runAuthorizedTask") {
        result = await client[req.method](
          req.args[0],
          (context) =>
            new Promise((resolve, reject) => {
              pending = { resolve, reject };
              const { signal, ...safe } = context;
              signal.addEventListener(
                "abort",
                () => send("A", { reason: "Work authorization withdrawn" }),
                { once: true },
              );
              send("X", safe);
              if (signal.aborted)
                send("A", { reason: "Work authorization withdrawn" });
            }),
        );
      } else if (methods.has(req.method))
        result = await client[req.method](...req.args);
      else throw Error("Unsupported lifecycle method");
    }
    send("R", result);
  } catch (e) {
    send("E", {
      message: e.message,
      status: e.status || 0,
      name: e.name,
      taskId: e.taskId,
      persisted: e.persisted,
      outcome: e.outcome,
      result: e.result,
    });
  } finally {
    busy = false;
  }
});
lines.on("close", () => {
  if (pending) {
    pending.reject(new Error("Host disconnected"));
    pending = null;
  }
});
