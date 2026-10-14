"use client";
import { useState } from "react";
import { PublicShell } from "../public-shell";
import { inspectProfile } from "@/lib/interop";

const example = {
  profileVersion: "ftai.identity/0.1",
  id: "urn:example:procurement-agent",
  name: "Example procurement agent",
  type: "agent",
  role: "Compare supplier quotes",
  status: "active",
  issuer: "https://registry.example.org",
  operator: { name: "Example organisation — fictional", assurance: "declared" },
  capabilities: ["supplier.compare"],
  authority: {
    allowed: ["quotes.read"],
    denied: ["payments.send"],
    assurance: "declared",
  },
  lifecycle: { revision: 1, updated: "2026-10-01T00:00:00.000Z" },
  references: {
    passport: "https://registry.example.org/p/example",
    credential: "https://registry.example.org/credentials/example",
  },
};
export default function Framework() {
  const [source, setSource] = useState("");
  const [report, setReport] = useState<ReturnType<
    typeof inspectProfile
  > | null>(null);
  const [error, setError] = useState("");
  function validate() {
    setError("");
    setReport(null);
    if (source.length > 65536) {
      setError("Use a profile smaller than 64 KB.");
      return;
    }
    try {
      setReport(inspectProfile(JSON.parse(source)));
    } catch {
      setError("Enter valid JSON. Check quotation marks, commas and brackets.");
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "ftai-profile-report.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <PublicShell current="framework">
      <main className="framework-page">
        <header className="framework-intro">
          <span className="public-eyebrow">Fisemarco FRAMEWORK / DRAFT 0.1</span>
          <h1>
            Identity that another
            <br />
            <em>system can understand.</em>
          </h1>
          <p>
            A shared language for who an agent is, who operates it, and what
            authority it declares. Built for integration across platforms, with
            evidence kept separate from claims.
          </p>
          <div className="hero-actions">
            <a className="public-button" href="#workbench">
              Check a profile ↓
            </a>
            <a
              className="public-text-link"
              href="/identity-profile.md"
              download
            >
              Download the specification ↗
            </a>
          </div>
        </header>
        <section className="framework-principles" aria-label="Identity layers">
          {[
            [
              "01",
              "Identify",
              "Keep a persistent reference across models, jobs and deployments.",
            ],
            [
              "02",
              "Establish evidence",
              "Distinguish a registered key from a verified operator and delegated authority.",
            ],
            [
              "03",
              "Decide locally",
              "Your system controls trust, access and the right to stop an agent.",
            ],
          ].map(([n, t, d]) => (
            <article key={n}>
              <span>{n}</span>
              <h2>{t}</h2>
              <p>{d}</p>
            </article>
          ))}
        </section>
        <section id="workbench" className="framework-workbench">
          <div>
            <span className="public-eyebrow">BUILDER WORKBENCH</span>
            <h2>Inspect before you integrate.</h2>
            <p>
              Validation runs entirely in your browser. Pasted profiles are not
              uploaded or saved. Passing this check establishes format
              compatibility only.
            </p>
            <label htmlFor="profile-json">Identity profile JSON</label>
            <textarea
              id="profile-json"
              value={source}
              maxLength={65537}
              spellCheck={false}
              onChange={(e) => {
                setSource(e.target.value);
                setReport(null);
                setError("");
              }}
              placeholder="Paste a portable identity profile…"
            />
            <div className="hero-actions">
              <button className="public-button" onClick={validate}>
                Validate profile
              </button>
              <button
                className="public-text-link"
                onClick={() => {
                  setSource(JSON.stringify(example, null, 2));
                  setReport(null);
                  setError("");
                }}
              >
                Load fictional example
              </button>
            </div>
          </div>
          <aside aria-live="polite" className="framework-report">
            <span className="public-eyebrow">VALIDATION REPORT</span>
            {error ? (
              <p role="alert">{error}</p>
            ) : report ? (
              <>
                <h2>
                  {report.conforms ? "Format conforms." : "Changes required."}
                </h2>
                <p>
                  {report.conforms
                    ? "Identity, operator and permissions have not been authenticated by this check."
                    : "Correct these fields and validate again."}
                </p>
                {report.errors.map((e, i) => (
                  <p key={i}>
                    <strong>{e.path}</strong>: {e.message}
                  </p>
                ))}
                {report.checks.map((c) => (
                  <article key={c.name}>
                    <h3>{c.name}</h3>
                    <p>{c.detail}</p>
                  </article>
                ))}
                <button className="public-text-link" onClick={download}>
                  Download report ↓
                </button>
              </>
            ) : (
              <>
                <h2>Bring your own profile.</h2>
                <p>
                  Use the fictional example to learn the format, or export a
                  real profile from your authenticated Fisemarco passport API.
                </p>
                <code>GET /api/v1/agents/&#123;code&#125;/profile</code>
                <p>
                  The same passport access rules apply. Private identities stay
                  private.
                </p>
              </>
            )}
          </aside>
        </section>
        <section className="framework-next">
          <h2>Earn adoption through a working pilot.</h2>
          <p>
            Start with one agent builder and one receiving service. Register an
            agent, prove key possession, exchange the profile, verify a signed
            credential, enforce a narrow permission, then test revocation.
            Measure successful verification, integration time and denied
            unauthorized actions.
          </p>
          <a href="/builders" className="public-button">
            Connect your runtime ↗
          </a>
          <h3>Designed to contribute to an emerging ecosystem</h3>
          <p>
            This is a Fisemarco draft profile, not an approved international
            standard. Estonia’s agent identity initiative and ITU’s trust and
            identity work are relevant context; Fisemarco has no claimed partnership
            or endorsement.
          </p>
          <a href="https://www.valitsus.ee/en/news/prime-minister-michal-estonia-become-first-country-create-digital-identities-ai-agents">
            Estonia’s announcement ↗
          </a>{" "}
          ·{" "}
          <a href="https://www.itu.int/en/ITU-T/focusgroups/tida/Pages/default.aspx">
            ITU FG-TIDA ↗
          </a>
        </section>
      </main>
    </PublicShell>
  );
}
