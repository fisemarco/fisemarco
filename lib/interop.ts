import { z } from "zod";
import type { Agent } from "./model";

const label = z.string().trim().min(1).max(200);
const httpsUrl = z
  .string()
  .url()
  .max(2048)
  .refine((v) => {
    const url = new URL(v);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  }, "HTTPS is required except for loopback development URLs");
export const identityProfile = z
  .object({
    profileVersion: z.literal("ftai.identity/0.1"),
    id: label,
    name: label,
    type: z.enum(["agent", "employee", "assistant", "service", "swarm"]),
    role: label,
    status: z.enum(["active", "suspended", "retired"]),
    issuer: httpsUrl,
    operator: z
      .object({ name: label, assurance: z.literal("declared") })
      .strict(),
    capabilities: z.array(label).max(100),
    authority: z
      .object({
        allowed: z.array(label).max(100),
        denied: z.array(label).max(100),
        assurance: z.literal("declared"),
      })
      .strict(),
    lifecycle: z
      .object({
        revision: z.number().int().nonnegative(),
        updated: z.string().datetime(),
      })
      .strict(),
    references: z.object({ passport: httpsUrl, credential: httpsUrl }).strict(),
  })
  .strict();

export function portableProfile(agent: Agent, origin: string) {
  return identityProfile.parse({
    profileVersion: "ftai.identity/0.1",
    id: agent.did,
    name: agent.name,
    type: "agent",
    role: agent.role,
    status: agent.status,
    issuer: origin,
    operator: {
      name: agent.profile.operator || agent.organization || "Not declared",
      assurance: "declared",
    },
    capabilities: agent.profile.skills,
    authority: {
      allowed: agent.profile.allowed,
      denied: agent.profile.denied,
      assurance: "declared",
    },
    lifecycle: { revision: agent.revision, updated: agent.updated },
    references: {
      passport: origin + "/p/" + agent.code,
      credential: origin + "/api/v1/agents/" + agent.code + "/export",
    },
  });
}

export function inspectProfile(input: unknown) {
  const result = identityProfile.safeParse(input);
  if (!result.success)
    return {
      conforms: false,
      errors: result.error.issues.map((i) => ({
        path: i.path.join(".") || "$",
        message: i.message,
      })),
      checks: [],
    };
  const p = result.data;
  const overlap = p.authority.allowed.filter((a) =>
    p.authority.denied.includes(a),
  );
  return {
    conforms: true,
    errors: [],
    checks: [
      {
        name: "Lifecycle",
        detail:
          p.status === "active"
            ? "Reported active; obtain current issuer status before use."
            : `Reported ${p.status}; refuse operational use.`,
      },
      {
        name: "Operator",
        detail:
          "Declared only. No legal entity or delegation verification has been performed.",
      },
      {
        name: "Authority",
        detail: overlap.length
          ? `Conflicting rules: ${overlap.join(", ")}. Denial must take precedence.`
          : "Declared scopes are not an access grant. The resource owner must authorize every operation.",
      },
      {
        name: "Proof",
        detail:
          "This JSON is unsigned. Validate the referenced credential with a separately trusted issuer key; never trust a key merely because this document names it.",
      },
      {
        name: "Freshness",
        detail:
          "A structurally valid profile may be stale, copied or revoked. Check live status and prove current agent key possession.",
      },
    ],
  };
}
