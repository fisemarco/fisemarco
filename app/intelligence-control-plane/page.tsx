import { PublicShell } from "../public-shell";
import { StepExplorer, Architecture } from "./step-explorer";
export const metadata = {
  title: "Intelligence Control Plane · Fisemarco",
  description:
    "Every agent step uses only the intelligence it actually needs. Route rules, memory, tools, capabilities and approved models through Fisemarco governance.",
};
export default function Page() {
  return (
    <PublicShell current="intelligence">
      <main className="icp-page">
        <header className="icp-hero">
          <div>
            <span className="public-eyebrow">
              Fisemarco / INTELLIGENCE CONTROL PLANE
            </span>
            <h1>
              Every agent step uses only the intelligence it{" "}
              <em>actually needs.</em>
            </h1>
            <p>
              Fisemarco separates agent execution from model execution. Use rules,
              memory, tools, local AI or frontier models when each is sufficient
              to complete the step reliably.
            </p>
            <div className="icp-actions">
              <a className="public-button" href="/intelligence">
                Explore Intelligence Control ↗
              </a>
              <a className="public-text-link" href="#step-explorer">
                See how it works ↓
              </a>
            </div>
            <small>
              Identity establishes who. Authority establishes what. Intelligence
              Control chooses how.
            </small>
          </div>
          <Architecture />
        </header>
        <section className="icp-section" id="step-explorer">
          <span className="public-eyebrow">STEP-LEVEL EXECUTION</span>
          <h2>One agent. Different intelligence.</h2>
          <p>
            Explore the routing of an enterprise sales workflow. These
            recommendations use the same decision engine as the runtime API,
            with declared example tools and model capabilities. No providers are
            called and no production results are implied.
          </p>
          <StepExplorer />
        </section>
        <section className="icp-section icp-split">
          <div>
            <span className="public-eyebrow">THE PROBLEM</span>
            <h2>Agents are becoming model-call machines.</h2>
            <p>
              Many workflows call a model for each step, including database
              lookups and known calculations. Each unnecessary call adds
              latency, external dependency and data exposure.
            </p>
          </div>
          <div className="icp-comparison">
            <article>
              <small>EVERY STEP USES A MODEL</small>
              <p>
                Lookup → model
                <br />
                Relationship → model
                <br />
                Scoring → model
                <br />
                Objection → model
              </p>
            </article>
            <article>
              <small>MINIMUM SUFFICIENT INTELLIGENCE</small>
              <p>
                Lookup → tool
                <br />
                Relationship → memory
                <br />
                Scoring → capability
                <br />
                Objection → frontier
              </p>
            </article>
          </div>
        </section>
        <section className="icp-section">
          <span className="public-eyebrow">HOW IT WORKS</span>
          <h2>Intelligence becomes an execution decision.</h2>
          <div className="icp-process">
            {[
              [
                "01",
                "Request an outcome",
                "Your existing agent submits an individual step, its requirements and available resources.",
              ],
              [
                "02",
                "Resolve what is known",
                "Check validated context, memory, tools and versioned capabilities.",
              ],
              [
                "03",
                "Apply the constraints",
                "Enforce quality, action permissions, privacy, residency and human oversight.",
              ],
              [
                "04",
                "Execute the chosen route",
                "Your runtime executes a permitted callback or approved model with a bounded work permit.",
              ],
              [
                "05",
                "Measure and improve",
                "Report the outcome. Evaluate repeated patterns before promoting a reusable capability.",
              ],
            ].map(([n, t, d]) => (
              <article key={n}>
                <span>{n}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="icp-section icp-split">
          <div>
            <span className="public-eyebrow">CONTROL BEFORE OPTIMISATION</span>
            <h2>Start by observing. Enforce when ready.</h2>
            <p>
              <strong>Observe</strong> records the actual route.{" "}
              <strong>Shadow</strong> adds a recommendation while preserving
              execution. <strong>Enforce</strong> selects the route. Privacy and
              human-approval constraints apply in every mode.
            </p>
            <a className="public-button" href="/intelligence">
              Run in Shadow Mode ↗
            </a>
          </div>
          <div className="icp-policy-list">
            <p>
              Personal or restricted data <strong>Local by default</strong>
            </p>
            <p>
              Strategic planning <strong>Approved frontier model</strong>
            </p>
            <p>
              Financial transfer <strong>Exact-task human approval</strong>
            </p>
            <p>
              No sufficient approved route <strong>Explicit escalation</strong>
            </p>
          </div>
        </section>
        <section className="icp-section icp-split">
          <div>
            <span className="public-eyebrow">VALIDATED REUSE</span>
            <h2>Repeated reasoning can become a capability.</h2>
            <p>
              Repeated successful model tasks create review candidates. A
              developer implements a versioned handler, tests it against a
              dataset and safety cases, and an administrator reviews the
              evidence before promotion. New versions are candidates again.
              Withdraw a version to stop reuse.
            </p>
          </div>
          <div>
            <span className="public-eyebrow">CONTEXT MINIMISATION</span>
            <h2>Relevant facts. Smaller exposure.</h2>
            <p>
              Relevant context stays in your runtime. External providers receive
              selected fields with sensitive entries excluded and common
              identifiers redacted. Fisemarco stores routing metadata, hashes and
              reported outcomes; it does not store raw context, outputs or
              provider secrets.
            </p>
            <p>
              Your context engineering and memory systems remain the sources of
              knowledge. Fisemarco selects the execution resource.
            </p>
          </div>
        </section>
        <section className="icp-section">
          <span className="public-eyebrow">MEASURE THE REAL WORK</span>
          <h2>Intelligence Mix. Cloud Dependency. Quality.</h2>
          <div className="icp-metric-outline">
            {[
              "Completed step executions",
              "No-LLM execution",
              "Local intelligence",
              "Cloud dependency",
              "Frontier dependency",
              "Context kept local",
              "Success by route",
              "Reported cost",
            ].map((t) => (
              <span key={t}>
                {t}
                <strong>From your traces</strong>
              </span>
            ))}
          </div>
          <p>
            Organisation dashboards aggregate real traces on the backend.
            Unknown costs remain unknown. Savings are labelled estimates against
            your configured baseline. Shadow recommendations are not claimed as
            realised savings or equivalent quality.
          </p>
          <a href="/intelligence">Open your intelligence dashboard →</a>
        </section>
        <section className="icp-section icp-split">
          <div>
            <span className="public-eyebrow">WORKS ALONGSIDE YOUR HARNESS</span>
            <h2>Keep your agent. Add control.</h2>
            <p>
              The Node SDK and signed REST API work with custom agents and
              orchestration callbacks. A local, text-only OpenAI-compatible
              bridge supports non-streaming chat completions with an explicit
              task mapping and validator. Ollama, vLLM and OpenAI-compatible
              provider adapters keep credentials in your runtime.
            </p>
            <p>
              LangGraph, LangChain, CrewAI, Microsoft and MCP orchestration can
              call this SDK or REST boundary. Framework-specific integrations
              are not independently certified.
            </p>
            <a href="/sdk/intelligence-guide.md">Integration guide →</a> ·{" "}
            <a href="/integrations/ftai-sdks.zip" download>
              SDK bundle
            </a>
          </div>
          <pre className="icp-code">
            <code>{`import { IntelligenceControl } from './intelligence.mjs';\n\nconst control = new IntelligenceControl({\n  client: ftai,\n  handlers: { 'crm.lookup': lookupAccount },\n  models: { 'local-writer': localWriter },\n  outboxPath: './private/intelligence-outbox'\n});\n\nconst result = await control.run({\n  step, context, grant, request\n}, { validate: validateOutput });`}</code>
          </pre>
        </section>
        <section className="icp-section icp-split">
          <div>
            <h2>External intelligence is optional until required.</h2>
            <p>
              Rules, memory, capabilities and local models can run without a
              cloud model. Tools still need their own connectivity. Routing
              currently requires the Fisemarco service; unavailable routing fails
              closed. A missing or failed provider yields an explicit error and
              trace rather than an unapproved fallback.
            </p>
          </div>
          <div>
            <h2>Connect the agent you already have.</h2>
            <p>
              Configure your organisation, register its runtime, issue bounded
              authority, and start in shadow mode.
            </p>
            <div className="icp-actions">
              <a className="public-button" href="/connect">
                Connect an agent ↗
              </a>
              <a href="/intelligence">Configure Intelligence Control →</a>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
