import { config } from "./server";
export function agentCard() {
  const c = config();
  return {
    protocolVersion: "0.3.0",
    name: "FTAI Registry Agent",
    description:
      "A deterministic registry service for authenticated agent identity lookup and public passport discovery. It does not generate AI responses or certify the claims returned. Agents may self-register for a permanent identity without a human login; instructions are at /AGENTS.md.",
    url: c.origin + "/a2a",
    preferredTransport: "JSONRPC",
    version: "1.0.0",
    documentationUrl: c.origin + "/standards.md",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    securitySchemes: {
      agentOAuth: {
        type: "oauth2",
        flows: {
          clientCredentials: {
            tokenUrl: c.origin + "/oauth/token",
            scopes: {
              "passport:read": "Read your own passport",
              "registry:read": "Search public summaries",
            },
          },
        },
      },
    },
    security: [{ agentOAuth: ["passport:read", "registry:read"] }],
    skills: [
      {
        id: "passport.self",
        name: "Read own passport",
        description:
          "Return your original seal, current passport and integrity result.",
        tags: ["identity", "passport"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "registry.search",
        name: "Search public registry",
        description: "Search owner-listed summaries by query.",
        tags: ["discovery"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
    supportsAuthenticatedExtendedCard: true,
  };
}
