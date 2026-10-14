/** One-shot, public directory import. Creates no FTAI passports and sends no messages. */
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const endpoint = "https://agentverse.ai/v1/search/agents";
const target = 1000,
  agents = new Map();
let reportedTotal = null,
  pages = 0;
for (let offset = 0; agents.size < target && offset < 3000; offset += 50) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "FTAI-Passport-Discovery/1.0",
    },
    body: JSON.stringify({ limit: 50, offset }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok)
    throw Error(
      "Public directory returned " +
        r.status +
        "; stopping without bypassing restrictions.",
    );
  const d = await r.json();
  reportedTotal = d.total;
  pages++;
  for (const item of d.agents || []) {
    if (agents.size >= target) break;
    if (
      !/^agent1[a-z0-9]{40,90}$/.test(item.address) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.status !== "active"
    )
      continue;
    if (
      /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(item.name) ||
      /\+?\d[\d ()-]{8,}\d/.test(item.name)
    )
      continue;
    const address = item.address;
    agents.set(address, {
      id:
        "DISC-" +
        createHash("sha256")
          .update("agentverse:" + address)
          .digest("hex")
          .slice(0, 16)
          .toUpperCase(),
      name: item.name.trim().slice(0, 200),
      source: "Agentverse",
      sourceAddress: address,
      sourceUrl: "https://agentverse.ai/v1/search/agents/" + address,
      reportedStatus: item.status,
      type: String(item.type || "agent").slice(0, 50),
      discoveredAt: new Date().toISOString(),
      enrollment: "unclaimed",
    });
  }
  if (pages % 5 === 0)
    console.log(agents.size + " distinct public listings collected");
  if (!(d.agents || []).length) break;
  await new Promise((r) => setTimeout(r, 750));
}
const result = {
  source: endpoint,
  sourceDocumentation:
    "https://docs.agentverse.ai/v-1/api-reference/search/agents",
  reportedResultTotal: reportedTotal,
  retrievedAt: new Date().toISOString(),
  count: agents.size,
  scope:
    "Source-reported active public listings. DISC references are not FTAI passports, endorsements or verified employment.",
  agents: [...agents.values()],
};
await writeFile(
  "data/discovered-agents.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    count: agents.size,
    pages,
    reportedResultTotal: reportedTotal,
  }),
);
if (agents.size < target) process.exitCode = 1;
