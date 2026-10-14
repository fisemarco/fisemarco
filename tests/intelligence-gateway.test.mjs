import assert from "node:assert/strict";
import http from "node:http";
import { startOpenAICompatibleGateway } from "../public/sdk/intelligence.mjs";
// Isolate the bridge protocol; signed execution is covered by intelligence.integration.mjs.
let seen;
const bridge = await startOpenAICompatibleGateway({
  control: {
    run: async (input) => ({
      value: input,
      executionId: "fixture",
      route: "tool",
      report: { inputTokens: null },
    }),
  },
  token: "u".repeat(40),
  prepare: async (body) => (seen = body.messages[0].content),
  validate: () => ({ valid: true, score: 1 }),
});
try {
  const raw = Buffer.from(
    JSON.stringify({
      messages: [{ role: "user", content: "Hyvää päivää — Espoo" }],
    }),
  );
  const split = raw.indexOf(Buffer.from("ä")) + 1;
  const result = await new Promise((resolve, reject) => {
    const request = http.request(
      bridge.baseUrl + "/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + "u".repeat(40),
          "Content-Type": "application/json",
        },
      },
      (response) => {
        let text = "";
        response.on("data", (b) => (text += b));
        response.on("end", () =>
          resolve({ status: response.statusCode, body: JSON.parse(text) }),
        );
      },
    );
    request.on("error", reject);
    request.write(raw.subarray(0, split));
    request.end(raw.subarray(split));
  });
  assert.equal(result.status, 200);
  assert.equal(seen, "Hyvää päivää — Espoo");
  assert.equal(result.body.choices[0].message.content, seen);
  console.log(
    "PASS OpenAI-compatible gateway preserves Finnish UTF-8 across request chunks.",
  );
} finally {
  await bridge.close();
}
