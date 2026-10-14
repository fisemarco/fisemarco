import { PublicShell } from "../public-shell";
import { ConnectKit } from "./setup";
export const metadata = {
  title: "Connect your AI · Fisemarco",
  description:
    "One starting point for AI-assisted setup, runtime registration and Fisemarco technical certification.",
};
export default function Connect() {
  return (
    <PublicShell>
      <main className="enterprise-page connect-page">
        <header>
          <span className="public-eyebrow">Fisemarco / CONNECT</span>
          <h1>
            Start with a conversation.
            <br />
            <em>Build with an identity.</em>
          </h1>
          <p>
            Give your coding assistant one instruction. It can check your setup,
            connect your runtime and guide you through Fisemarco technical
            certification.
          </p>
        </header>
        <ConnectKit />
        <section className="enterprise-grid">
          <article>
            <span className="public-eyebrow">01 / CONNECT</span>
            <h2>Bring your assistant</h2>
            <p>
              In Codex or ChatGPT, install and connect the Fisemarco personal plugin.
              For Claude Code, download the package and authenticate through its
              MCP connection. Compatible clients can use the same endpoint.
            </p>
            <p>
              Version 3 brings 21 tools across identity, governance and
              Intelligence Control. Your assistant can configure requested
              policies, review capability evidence and inspect execution traces.
            </p>
            <a href="/plugin-guide.md">See the plugin tools</a> ·{" "}
            <a href="/integrations/ftai-claude.zip" download>
              Claude Code package
            </a>{" "}
            · <a href="/integrations/README.md">Connection instructions</a>
          </article>
          <article>
            <span className="public-eyebrow">02 / REGISTER</span>
            <h2>Your runtime keeps its keys</h2>
            <p>
              The assistant uses your connected account to set up an
              organisation. Configure its enrollment policy once in the builder
              workspace, then place the key directly in your runtime’s secret
              store. The SDK creates and preserves the identity locally.
            </p>
            <a href="/builders">Set up enrollment</a> ·{" "}
            <a href="/AGENTS.md">Self-managed registration</a>
          </article>
          <article>
            <span className="public-eyebrow">03 / CERTIFY</span>
            <h2>Evidence before a badge</h2>
            <p>
              Ask your assistant to assign your owned agent, assess its
              identity, explain any failed checks and issue a certificate when
              eligible. It can check live status, revoke certificates and
              inspect the trust graph.
            </p>
            <a href="/certification-scheme.md">What Fisemarco certifies</a> ·{" "}
            <a href="/enterprise">Organisation workspace</a>
          </article>
        </section>
        <section>
          <h2>No MCP support? Use the same runtime.</h2>
          <p>
            Your model does not need a special Fisemarco capability. Its host
            application can use the Node SDK, Python, Go or Java lifecycle
            adapters, or the signed HTTP API. MCP login depends on the client
            supporting this host’s authentication; SDK enrollment works
            independently.
          </p>
          <a href="/integrations/ftai-sdks.zip" download>
            Download the SDK bundle
          </a>{" "}
          · <a href="/llm-start.md">Guide for coding assistants</a> ·{" "}
          <a href="/developers">All developer tools</a>
        </section>
        <section>
          <h2>Clear boundaries from the first step</h2>
          <p>
            Passports start private. Registry listings do not become identities
            automatically. Fisemarco Runtime Identity certificates cover technical
            identity checks; they do not certify competence, safety or
            regulatory compliance. Organisation work still requires bounded
            authority and resource-level enforcement.
          </p>
        </section>
      </main>
    </PublicShell>
  );
}
