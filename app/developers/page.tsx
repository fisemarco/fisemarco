import { PublicShell } from "../public-shell";
export const metadata = {
  title: "Fisemarco developer tools",
  description:
    "Runtime and signed protocol SDKs, testnet, authority and verification provider integration.",
};
export default function Developers() {
  return (
    <PublicShell>
      <main className="enterprise-page">
        <header>
          <span className="public-eyebrow">Fisemarco / DEVELOPERS</span>
          <h1>
            Identity in your runtime.
            <br />
            <em>Authority at the boundary.</em>
          </h1>
          <p>
            Use the Node runtime SDK for enrollment and gated task execution.
            Python, Go and Java offer signed transport clients and full
            lifecycle adapters using the same local Node engine. Keys remain in
            your runtime; do not upload private keys to the website.
          </p>
        </header>
        <section>
          <h2>Ask your AI to connect you.</h2>
          <p>
            One setup instruction, one connection endpoint, and a guided path
            from registration to technical certification.
          </p>
          <a href="/connect">Connect with your AI →</a>
        </section>
        <section>
          <h2>Intelligence Control Plane</h2>
          <p>
            Route each step through rules, context, tools, evaluated
            capabilities or approved models. The Node executor uses your
            registered identity and bounded authority; provider keys stay in
            your runtime.
          </p>
          <a href="/intelligence">Configure your organisation →</a> ·{" "}
          <a href="/sdk/intelligence-guide.md">Integration guide</a> ·{" "}
          <a href="/sdk/intelligence.mjs" download>
            Intelligence SDK
          </a>
        </section>
        <section className="enterprise-grid">
          <article>
            <h2>Builder plugins</h2>
            <p>
              Connect Codex or ChatGPT through the Fisemarco personal plugin. A
              Claude Code package supplies the remote MCP configuration and
              startup integration skill. Other compatible clients can use the
              same MCP endpoint.
            </p>
            <p>
              Plugin v3 includes 21 tools for identity, governance, intelligence
              policies, capability reviews, metrics and execution traces.
            </p>
            <a href="/plugin-guide.md">Plugin tools and examples</a> ·{" "}
            <a href="/integrations/ftai-claude.zip" download>
              Claude Code package
            </a>{" "}
            ·{" "}
            <a href="/integrations/README.md">
              Connection guide and compatibility
            </a>
          </article>
          <article>
            <h2>One lifecycle, four languages</h2>
            <p>
              Enrollment, durable identity, task gating, cancellation, outcome
              recovery, key rotation and Cybersphere. Python, Go and Java
              lifecycle adapters require Node 22+ locally.
            </p>
            <a href="/integrations/ftai-sdks.zip" download>
              Download all SDKs and lifecycle engine
            </a>{" "}
            · <a href="/sdk/lifecycle-guide.md">Lifecycle API and examples</a>
          </article>
          <article>
            <h2>Trust graph</h2>
            <p>
              Explore typed relationships, live authority chains and signed
              evidence in your organisation workspace. Paginate and export the
              graph through the API or MCP connection.
            </p>
            <a href="/enterprise">Open organisation workspace</a> ·{" "}
            <a href="/trust-graph-protocol.md">Graph specification</a>
          </article>
          <article>
            <h2>Fisemarco technical certification</h2>
            <p>
              Assess an agent against published technical identity criteria,
              issue a signed credential and check or revoke it throughout its
              validity.
            </p>
            <a href="/certification-scheme.md">Read the certification scheme</a>
          </article>
          <article>
            <h2>Node.js runtime</h2>
            <p>
              Enrollment, persistent identity, bounded delegation, approval
              requests, one-use approval consumption, gated tasks and outcome
              reporting.
            </p>
            <a href="/sdk/ftai.mjs" download>
              Download Node SDK
            </a>
          </article>
          <article>
            <h2>Python</h2>
            <p>
              Python 3.10+. Signed runtime and governance requests, with
              cryptography for Ed25519.
            </p>
            <a href="/sdk/python/ftai.py" download>
              Download Python client
            </a>{" "}
            ·{" "}
            <a href="/sdk/python/requirements.txt" download>
              Dependencies
            </a>
          </article>
          <article>
            <h2>Go</h2>
            <p>
              Go 1.23+. Context-aware signed requests, timeouts and explicit
              redirect rejection. Standard library only.
            </p>
            <a href="/sdk/go/ftai.go" download>
              Download Go client
            </a>{" "}
            ·{" "}
            <a href="/sdk/go/go.mod" download>
              Module file
            </a>
          </article>
          <article>
            <h2>Java</h2>
            <p>
              Java 17+. Ed25519 signed HTTP transport. Pass exact JSON produced
              by your application’s serializer.
            </p>
            <a href="/sdk/java/FTAIClient.java" download>
              Download Java client
            </a>
          </article>
        </section>
        <section>
          <h2>Integrate safely</h2>
          <ol>
            <li>
              Create an enrollment policy in{" "}
              <a href="/builders">the builder workspace</a>, then enroll a
              runtime and retain its private key securely.
            </li>
            <li>
              Assign the passport to an{" "}
              <a href="/enterprise">organisation workforce</a> and issue bounded
              authority.
            </li>
            <li>
              Use the signed authority check before work. Submit an exact-input
              approval request when the result is ESCALATE.
            </li>
            <li>
              An authorised person reviews the request in the governance centre.
              Use runAuthorizedTask to acquire a permit and consume its bound
              approval at task start. Enforce the same action and input at the
              resource.
            </li>
            <li>
              Record outcomes and review observed activity. A signature proves
              the reporting key; it does not independently prove task success.
            </li>
          </ol>
        </section>
        <section>
          <h2>Documentation and conformance</h2>
          <p>
            <a href="/sdk/README.md">SDK setup and examples</a> ·{" "}
            <a href="/governance-protocol.md">Governance API</a> ·{" "}
            <a href="/runtime-protocol.md">Runtime API</a> ·{" "}
            <a href="/enterprise-protocol.md">Organisation API</a>
          </p>
          <p>
            <a href="/testnet">Open testnet</a> ·{" "}
            <a href="/testnet-protocol.md">Testnet protocol</a> ·{" "}
            <a href="/certification-readiness.md">Assessment preparation</a>
          </p>
          <p>
            Downloadable clients implement Fisemarco’s current profile. They are not
            an A2A, MCP, SPIFFE or ISO certification. All four languages can use
            the shared lifecycle engine; Python, Go and Java also provide
            narrower standalone transport clients.
          </p>
        </section>
      </main>
    </PublicShell>
  );
}
