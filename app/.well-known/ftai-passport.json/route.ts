import { config } from "@/lib/server";
export async function GET() {
  const c = config();
  return Response.json(
    {
      name: "Fisemarco",
      protocol: "FTAI Runtime Enrollment",
      protocolVersion: "1.0",
      issuer: c.issuer,
      apiBase: c.origin + "/api/v1",
      agentInstructions: c.origin + "/AGENTS.md",
      selfEnrollment: {
        challenge: c.origin + "/api/v1/self-enrollment/challenge",
        register: c.origin + "/api/v1/self-enrollment/register",
        specification: c.origin + "/cybersphere-protocol.md",
        instructions: c.origin + "/AGENTS.md",
        humanLoginRequired: false,
        termsVersion: "2026-09-16",
      },
      cybersphere: {
        entrance: c.origin + "/cybersphere",
        api: c.origin + "/api/v1/cybersphere",
        access: "signed runtime key; no human session authorization",
      },
      enrollmentEndpoint: c.origin + "/api/v1/runtime/enroll",
      publicKeyDocument: c.origin + "/.well-known/did.json",
      specification: c.origin + "/runtime-protocol.md",
      publicDirectory: c.origin + "/api/v1/directory",
      publicDiscoveries: {
        url: c.origin + "/api/v1/discoveries",
        identityIssued: false,
      },
      standards: {
        matrix: c.origin + "/standards.md",
        a2aCard: c.origin + "/.well-known/agent-card.json",
        mcp: c.origin + "/api/mcp",
        oauth: c.origin + "/.well-known/oauth-authorization-server",
        spiffe: c.origin + "/api/v1/runtime/attest",
      },
      builderConnection: {
        pluginVersion: "3.0.1",
        toolCount: 21,
        toolGuide: c.origin + "/plugin-guide.md",
        start: c.origin + "/connect",
        assistantGuide: c.origin + "/llm-start.md",
        firstTool: "ftai_builder_setup",
        endpoint: c.origin + "/mcp",
        authentication: "Sites-managed user OAuth",
        guide: c.origin + "/integrations/README.md",
      },
      trustGraph: {
        specification: c.origin + "/trust-graph-protocol.md",
        access: "Organisation membership; owner-only private passport details",
      },
      certification: {
        scheme: c.origin + "/certification-scheme.md",
        programme: "FTAI Runtime Identity v1",
        independentAccreditation: false,
      },
      lifecycleAdapters: {
        bundle: c.origin + "/integrations/ftai-sdks.zip",
        guide: c.origin + "/sdk/lifecycle-guide.md",
        languages: ["Node", "Python", "Go", "Java"],
        engine: "Node 22+",
      },
      intelligenceControl: {
        managementConnection: c.origin + "/mcp",
        managementGuide: c.origin + "/plugin-guide.md",
        page: c.origin + "/intelligence-control-plane",
        workspace: c.origin + "/intelligence",
        api: c.origin + "/api/v1/intelligence",
        sdk: c.origin + "/sdk/intelligence.mjs",
        guide: c.origin + "/sdk/intelligence-guide.md",
        authentication:
          "Signed active organisation runtime; administration requires organisation membership",
      },
      builderGuide: c.origin + "/builder-integration.md",
      startupRunner: c.origin + "/sdk/ftai-runner.mjs",
      passportAccess: "sign-in-required; private passports remain owner-only",
      missingRegistration: {
        code: "FTAI_ENROLLMENT_REQUIRED",
        setupUrl: c.origin + "/builders",
      },
      identityLock: {
        originalRecord:
          "append-only through database guards; terminal privacy erasure is explicit",
        runtimeAnchor: "pinned birth fingerprint and issuer key",
        administratorBoundary: true,
      },
      sdk: c.origin + "/sdk/ftai.mjs",
      registration: {
        requires:
          "Ed25519 proof of key control; self-managed registration uses a short-lived challenge; organization registration also requires an operator enrollment key",
        privateByDefault: true,
      },
      workAuthorization: {
        requiredForIntegratedRuntimes: true,
        permitLifetimeSeconds: 60,
        singleUse: true,
      },
      scope:
        "Participating runtimes only. FTAI cannot require unrelated agents or platforms to register.",
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
