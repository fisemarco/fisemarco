#!/usr/bin/env node
/** Explicit opt-in runtime host. Node.js 22+. Download alongside ftai.mjs. */
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  FTAIClient,
  FTAIEnrollmentRequiredError,
  FTAIReportingError,
} from "./ftai.mjs";
const [operation, configPath, ...args] = process.argv.slice(2);
let client;
try {
  if (!["check", "enroll", "run"].includes(operation) || !configPath)
    throw Error(
      "Usage: node ftai-runner.mjs check|enroll|run ftai-config.json [-- command args...]",
    );
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (!config.manifest || typeof config.manifest !== "object")
    throw Error("Configuration must contain a manifest object.");
  if (Object.hasOwn(config.manifest, "enrollmentKey"))
    throw Error(
      "Keep the enrollment key in FTAI_ENROLLMENT_KEY, not in configuration files.",
    );
  client = new FTAIClient(config.manifest);
  if (operation === "check") {
    let cached = false;
    try {
      const state = JSON.parse(await readFile(client.statePath, "utf8"));
      cached =
        !!state.code &&
        state.externalId === client.externalId &&
        state.baseUrl === client.baseUrl;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (!cached && !client.enrollmentKey && !client.selfEnroll)
      throw new FTAIEnrollmentRequiredError(client.baseUrl);
    if (
      !cached &&
      !client.enrollmentKey &&
      client.selfEnroll &&
      !client.termsVersion
    )
      throw Error(
        "Self-enrollment requires the operator-approved participation termsVersion. See " +
          client.baseUrl +
          "/AGENTS.md",
      );
    console.log(
      JSON.stringify({
        configured: true,
        registeredLocally: cached,
        next: "Run enroll or run to authenticate with the registry.",
        scope:
          "Local configuration check; no network authorization has been granted.",
      }),
    );
  } else {
    if (operation === "run" && (args[0] !== "--" || !args[1] || !config.task))
      throw Error("run requires a task object and -- command args.");
    await client.init();
    if (operation === "enroll")
      console.log(
        JSON.stringify({
          registered: true,
          code: client.state.code,
          birthHash: client.state.birthHash,
        }),
      );
    else {
      await client.runTask(
        config.task,
        ({ signal, passportCode }) =>
          new Promise((resolve, reject) => {
            const childEnv = {
              ...process.env,
              FTAI_PASSPORT_CODE: passportCode,
              FTAI_TASK_ID: config.task.taskId,
            };
            delete childEnv.FTAI_ENROLLMENT_KEY;
            const child = spawn(args[1], args.slice(2), {
              stdio: "inherit",
              shell: false,
              env: childEnv,
              signal,
            });
            child.on("error", reject);
            child.on("exit", (code, exitSignal) =>
              code === 0
                ? resolve({ exitCode: 0 })
                : reject(
                    Error(
                      "Agent process exited unsuccessfully (" +
                        (exitSignal || code) +
                        ").",
                    ),
                  ),
            );
          }),
      );
    }
    await client.close();
  }
} catch (e) {
  if (e instanceof FTAIEnrollmentRequiredError) {
    console.error(
      JSON.stringify({
        error: e.code,
        message: e.builderMessage,
        setupUrl: e.setupUrl,
        workStarted: false,
      }),
    );
    process.exitCode = 2;
  } else if (e instanceof FTAIReportingError) {
    console.error(
      JSON.stringify({
        error: e.name,
        message: e.message,
        taskId: e.taskId,
        persisted: e.persisted,
        ...(!e.persisted ? { outcome: e.outcome } : {}),
      }),
    );
    process.exitCode = 3;
  } else {
    console.error(
      JSON.stringify({ error: e.name || "Error", message: e.message }),
    );
    process.exitCode = 1;
  }
  if (client?.initialized) await client.close().catch(() => {});
}
