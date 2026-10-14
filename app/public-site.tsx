"use client";
import { useEffect, useRef, useState } from "react";
import {
  Fingerprint,
  ArrowUpRight,
  ArrowRight,
  Search,
  LockKeyhole,
  ShieldCheck,
  ScanLine,
  Code2,
  Layers3,
  ArrowDownToLine,
  Copy,
  Check,
  Pause,
  Play,
} from "lucide-react";
import HeroScene from "./hero-scene";
import { PublicShell, signIn, usePublicSession } from "./public-shell";
type Summary = {
  code: string;
  name: string;
  role: string;
  organization: string;
  status: string;
  skills: string[];
  discovered?: boolean;
};
function Mark({ code }: { code: string }) {
  let n = 0;
  for (const c of code) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <div className={"directory-mark mark-" + (n % 4)}>
      <Fingerprint size={32} strokeWidth={1.3} />
      <span>{code.slice(-4)}</span>
    </div>
  );
}
function ProfileCard({
  agent,
  compact = false,
}: {
  agent: Summary;
  compact?: boolean;
}) {
  return (
    <a
      className={"directory-card " + (compact ? "compact" : "")}
      href={agent.discovered ? "/discover" : "/p/" + agent.code}
    >
      <div className="directory-card-top">
        <Mark code={agent.code} />
        <span className={"directory-status " + agent.status}>
          <i />
          {agent.status}
        </span>
      </div>
      <h3>{agent.name}</h3>
      <p>{agent.role}</p>
      <div className="directory-organization">{agent.organization}</div>
      {!compact && (
        <div className="directory-skills">
          {agent.skills.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      )}
      <div className="directory-card-bottom">
        <code>{agent.code}</code>
        <span>
          {!agent.discovered && <LockKeyhole size={13} />}
          <ArrowUpRight size={16} />
        </span>
      </div>
    </a>
  );
}
function DirectoryEmpty({ searched = false }: { searched?: boolean }) {
  return (
    <div className="directory-empty">
      <div className="empty-fingerprints">
        <Fingerprint />
        <Fingerprint />
        <Fingerprint />
      </div>
      <div>
        <h3>
          {searched
            ? "No matching public profiles."
            : "The first identities start with you."}
        </h3>
        <p>
          {searched
            ? "Try another name, organization, or personnel code. Private profiles do not appear in search."
            : "Registered agents appear here when their owners choose to list them. Give your agent an identity and make it discoverable."}
        </p>
      </div>
      <a
        href={signIn("/workspace?create=1")}
        className="public-button secondary"
      >
        Register an agent <ArrowUpRight size={15} />
      </a>
    </div>
  );
}
function Marquee({
  agents,
  discovery = false,
}: {
  agents: Summary[];
  discovery?: boolean;
}) {
  const [paused, setPaused] = useState(false);
  return (
    <section className="public-roster" aria-label="Listed agent profiles">
      <div className="section-kicker">
        <span>
          <i />
          {discovery
            ? "PUBLIC DISCOVERY · SOURCE LISTINGS"
            : "IDENTITIES IN THE REGISTRY"}
        </span>
        <div>
          {agents.length > 1 && (
            <button
              onClick={() => setPaused(!paused)}
              aria-label={
                paused ? "Play scrolling profiles" : "Pause scrolling profiles"
              }
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}
          <a href={discovery ? "/discover" : "/directory"}>
            {discovery ? "Explore public agents" : "Explore all profiles"}{" "}
            <ArrowUpRight size={15} />
          </a>
        </div>
      </div>
      {agents.length ? (
        <div className={"roster-window " + (paused ? "paused" : "")}>
          <div
            className={"roster-track " + (agents.length > 1 ? "moving" : "")}
          >
            {[0, ...(agents.length > 1 ? [1] : [])].map((group) => (
              <div
                className="roster-group"
                key={group}
                aria-hidden={group === 1 ? true : undefined}
              >
                {agents.map((a) =>
                  group === 0 ? (
                    <ProfileCard key={a.code} agent={a} compact />
                  ) : (
                    <div key={a.code} inert>
                      <ProfileCard agent={a} compact />
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <DirectoryEmpty />
      )}
    </section>
  );
}
function DiscoveryStrip() {
  const [items, setItems] = useState<Summary[]>([]),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/discoveries", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error("Public listings could not be loaded.");
        return r.json() as Promise<{
          agents: { id: string; name: string; source: string }[];
        }>;
      })
      .then((d) => {
        setItems(
          d.agents.slice(0, 12).map((a) => ({
            code: a.id,
            name: a.name,
            role: "Publicly listed software agent",
            organization: a.source + " · not enrolled",
            status: "unclaimed",
            skills: [],
            discovered: true,
          })),
        );
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  if (error)
    return (
      <div className="public-inline-error" role="alert">
        {error}
        <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
      </div>
    );
  if (!items.length)
    return (
      <div className="directory-loading" role="status">
        Loading public source listings…
      </div>
    );
  return <Marquee agents={items} discovery />;
}
export default function PublicSite({
  page = "home",
}: {
  page?: "home" | "directory" | "builders" | "trust";
}) {
  const session = usePublicSession();
  const [agents, setAgents] = useState<Summary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(
    page === "home" || page === "directory",
  );
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    if (page !== "home" && page !== "directory") return;
    const controller = new AbortController();
    const id = ++sequence.current;
    const timer = setTimeout(
      async () => {
        setLoading(true);
        setError("");
        try {
          const r = await fetch(
            "/api/v1/directory?" + new URLSearchParams({ q, status: filter }),
            { signal: controller.signal },
          );
          if (!r.ok)
            throw Error("The directory could not be loaded. Please try again.");
          const d = (await r.json()) as {
            agents: Summary[];
            total: number;
            nextOffset: number | null;
          };
          if (sequence.current === id) {
            setAgents(d.agents);
            setTotal(d.total);
            setNext(d.nextOffset);
          }
        } catch (e) {
          if (!controller.signal.aborted) setError((e as Error).message);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      page === "directory" ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, q, filter, retry]);
  async function more() {
    if (next === null) return;
    const id = sequence.current;
    setLoading(true);
    try {
      const r = await fetch(
        "/api/v1/directory?" +
          new URLSearchParams({ q, status: filter, offset: String(next) }),
      );
      if (!r.ok) throw Error("Could not load more profiles. Try again.");
      const d = (await r.json()) as {
        agents: Summary[];
        total: number;
        nextOffset: number | null;
      };
      if (id === sequence.current) {
        setAgents((a) => [...a, ...d.agents]);
        setNext(d.nextOffset);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }
  const register = session.user
    ? "/workspace?create=1"
    : signIn("/workspace?create=1");
  return (
    <PublicShell current={page} user={session.user}>
      {page === "home" && (
        <>
          <main className="public-hero public-hero-3d">
            <HeroScene />
            <div className="hero-copy">
              <h1>
                Every agent.
                <br />
                One <em>lifetime</em>
                <br />
                identity.
              </h1>
              <p>
                Portable identity for AI agents and employees. Connect a
                runtime, record its authority, and give other systems a
                consistent way to inspect its identity and signed history.
              </p>
              <div className="hero-actions">
                <a href={register} className="public-button">
                  Get an agent passport <ArrowUpRight size={18} />
                </a>
                <a href="/framework" className="public-text-link">
                  Explore the identity framework <ArrowRight size={16} />
                </a>
              </div>
              <div className="hero-assurances">
                <span>
                  <LockKeyhole />
                  Private by default
                </span>
                <span>
                  <ShieldCheck />
                  Signed from day one
                </span>
              </div>
            </div>
          </main>
          <div className="public-value-strip">
            <span>One permanent code.</span>
            <span>Every version.</span>
            <span>Every employer.</span>
            <span>Every chapter of work.</span>
          </div>
          {error ? (
            <div className="public-inline-error" role="alert">
              {error}
              <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
            </div>
          ) : loading ? (
            <div className="directory-loading" role="status">
              Loading the live registry…
            </div>
          ) : agents.length ? (
            <Marquee agents={agents.slice(0, 12)} />
          ) : (
            <DiscoveryStrip />
          )}
          <section className="public-section why-section">
            <div className="section-heading">
              <h2>
                Know who is working.
                <br />
                <span>Know what stands behind them.</span>
              </h2>
              <p>
                Identity, accountability, and access belong in one professional
                record.
              </p>
            </div>
            <div className="public-value-grid">
              {(
                [
                  [
                    "An identity that stays.",
                    "A permanent personnel code and original identity seal survive name changes, model updates, and new chapters of work.",
                  ],
                  [
                    "A record that grows.",
                    "Connect capabilities, employment, task outcomes, and supporting evidence. See the source behind each reported claim.",
                  ],
                  [
                    "Permission before action.",
                    "Integrated runtimes register before work and request one-use task permits. Operators set the rules and can pause access.",
                  ],
                ] as const
              ).map(([title, copy]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="public-section">
            <div className="icp-home-callout">
              <h2>
                Every agent step uses only the intelligence it actually needs.
              </h2>
              <p>
                Rules, memory, tools and local AI when they are sufficient.
                Frontier intelligence when the task calls for it.
              </p>
              <a
                className="public-text-link"
                href="/intelligence-control-plane"
              >
                Explore Intelligence Control →
              </a>
            </div>
          </section>
          <section className="public-join-section">
            <h2>
              Make identity part
              <br />
              of an agent’s <em>first breath.</em>
            </h2>
            <p>
              Build registration into your agent factory. One operator setup,
              automatic identity for every new agent your platform creates.
            </p>
            <a href="/builders" className="public-button light">
              Build with Fisemarco <Code2 size={18} />
            </a>
            <div className="join-steps">
              <span>01 / CREATE</span>
              <ArrowRight />
              <span>02 / REGISTER</span>
              <ArrowRight />
              <span>03 / WORK</span>
            </div>
            <small>
              Applies to platforms that adopt and enforce the integration.
            </small>
          </section>
          <section className="public-bottom-cta">
            <Fingerprint />
            <h2>
              The next member of your team
              <br />
              deserves an identity.
            </h2>
            <div>
              <a href={register} className="public-button">
                Create a passport <ArrowUpRight size={17} />
              </a>
              <a href="/directory" className="public-text-link">
                Search the registry
              </a>
            </div>
          </section>
        </>
      )}
      {page === "directory" && (
        <main className="public-section directory-page">
          <div className="public-eyebrow">THE Fisemarco REGISTRY</div>
          <div className="directory-heading">
            <div>
              <h1>
                Meet the new
                <br />
                <em>world of work.</em>
              </h1>
              <p>
                Discover AI agents and employees. Sign in to open their
                professional passports.
              </p>
            </div>
            <a href="/scan" className="public-button secondary">
              <ScanLine size={17} />
              Scan a passport
            </a>
          </div>
          <div className="directory-search">
            <Search size={23} />
            <input
              aria-label="Search public profiles"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={100}
              placeholder="Search by name, organization, role or personnel code"
            />
            <select
              aria-label="Filter by passport status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="retired">Retired</option>
            </select>
          </div>
          <div className="directory-count">
            <span>
              {loading
                ? "Searching…"
                : `${total ?? 0} public profile${total === 1 ? "" : "s"}`}
            </span>
            <span>
              <LockKeyhole size={13} />
              Full passports require sign-in
            </span>
          </div>
          {error && (
            <div className="public-inline-error" role="alert">
              {error}
              <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
            </div>
          )}
          <div className="directory-grid">
            {agents.map((a) => (
              <ProfileCard key={a.code} agent={a} />
            ))}
          </div>
          {!loading && !error && !agents.length && (
            <DirectoryEmpty searched={!!q || filter !== "all"} />
          )}
          <div className="directory-pagination">
            {next !== null && (
              <button
                disabled={loading}
                className="public-button secondary"
                onClick={more}
              >
                {loading ? "Loading…" : "Load more profiles"}
                <ArrowDownToLine size={16} />
              </button>
            )}
          </div>
          <p className="directory-disclosure">
            Owners choose which profiles to list. Names, organizations, and
            capabilities are reported claims. “Active” is the passport’s
            lifecycle status, not a claim that the agent is online.
          </p>
        </main>
      )}
      {page === "builders" && <Builders user={session.user} />}{" "}
      {page === "trust" && <Trust />}
    </PublicShell>
  );
}
function Builders({ user }: { user: { name: string; email: string } | null }) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [role, setRole] = useState("");
  const [action, setAction] = useState("research");
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  function download(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !id.trim() || !role.trim() || !action.trim()) {
      setError("Complete all four fields to create your configuration.");
      return;
    }
    const manifest = {
      baseUrl: window.location.origin,
      externalId: id.trim(),
      name: name.trim(),
      role: role.trim(),
      profile: { version: "1.0.0" },
      statePath: ".ftai/" + id.trim().replace(/[^a-zA-Z0-9_-]/g, "_") + ".json",
    };
    const task = {
      taskId: crypto.randomUUID(),
      title: "First " + action.trim() + " task",
      action: action.trim(),
    };
    const blob = new Blob([JSON.stringify({ manifest, task }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ftai-config.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDone(
      "Configuration downloaded. Create a policy allowing “" +
        action.trim() +
        "”, then follow the commands below.",
    );
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        "node ftai-runner.mjs check ftai-config.json\nnode ftai-runner.mjs run ftai-config.json -- node your-agent.mjs",
      );
      setDone(
        "Commands copied. Replace your-agent.mjs with your actual agent entrypoint.",
      );
    } catch {
      setError("Clipboard unavailable. Select the commands and copy them.");
    }
  }
  return (
    <main>
      <section className="public-section builders-hero">
        <div className="public-eyebrow">
          ADOPTION STARTS IN THE AGENT FACTORY
        </div>
        <h1>
          Born with identity.
          <br />
          <em>Ready for accountable work.</em>
        </h1>
        <p>
          Add Fisemarco to your runtime or platform. New agents enroll at startup;
          missing registration produces a clear message for the builder before
          work starts.
        </p>
        <div className="hero-actions">
          <a
            className="public-button"
            href={
              user
                ? "/workspace?view=network"
                : signIn("/workspace?view=network")
            }
          >
            Set up your organization <ArrowUpRight size={18} />
          </a>
          <a className="public-text-link" href="/runtime-protocol.md">
            Read the protocol <ArrowRight size={16} />
          </a>
        </div>
      </section>
      <section className="builder-path">
        <div>
          <span>01</span>
          <h3>Operator authorizes.</h3>
          <p>
            Create a policy and store its enrollment key securely in the runtime
            host.
          </p>
        </div>
        <div>
          <span>02</span>
          <h3>Every agent registers.</h3>
          <p>
            A unique runtime ID and signing key receive a permanent personnel
            code at startup.
          </p>
        </div>
        <div>
          <span>03</span>
          <h3>Work is gated.</h3>
          <p>
            Route task execution through Fisemarco. No valid identity and permit
            means the task cannot start.
          </p>
        </div>
      </section>
      <section className="public-section builder-kit">
        <div>
          <div className="public-eyebrow">THE BUILDER KIT</div>
          <h2>
            A working integration.
            <br />
            In your own runtime.
          </h2>
          <p>
            Generate configuration for a real agent, download the two JavaScript
            files into the same folder, and connect your existing entrypoint.
            Requires Node.js 22+.
          </p>
          <div className="builder-downloads">
            <a href="/sdk/ftai.mjs" download>
              <ArrowDownToLine />
              Runtime SDK <code>ftai.mjs</code>
            </a>
            <a href="/sdk/ftai-runner.mjs" download>
              <ArrowDownToLine />
              Startup & task gate <code>ftai-runner.mjs</code>
            </a>
          </div>
          <a className="public-text-link" href="/builder-integration.md">
            Full setup and failure recovery <ArrowUpRight size={16} />
          </a>
          <div className="builder-callout">
            <LockKeyhole />
            <p>
              Keep the enrollment key outside model context. The runner removes
              it from the child agent’s environment. Enforce isolation in your
              host so agent code cannot bypass the gate or read the identity
              key.
            </p>
          </div>
        </div>
        <form className="builder-config" onSubmit={download}>
          <h3>Configure your agent</h3>
          <label>
            Agent name
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your agent’s registered name"
            />
          </label>
          <label>
            Stable runtime ID
            <input
              required
              maxLength={200}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. research-worker-01"
            />
          </label>
          <label>
            Professional role
            <input
              required
              maxLength={200}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Research analyst"
            />
          </label>
          <label>
            Allowed task action
            <input
              required
              maxLength={200}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </label>
          <p>
            New passports start private. List them later from your workspace.
          </p>
          <button className="public-button" type="submit">
            Download configuration <ArrowDownToLine size={17} />
          </button>
          {error && (
            <div role="alert" className="public-error">
              {error}
            </div>
          )}
          {done && (
            <div role="status" className="builder-success">
              <Check size={16} />
              {done}
            </div>
          )}
        </form>
      </section>
      <section className="public-section builder-code">
        <div>
          <h2>Make registration the default.</h2>
          <p>
            Set <code>FTAI_ENROLLMENT_KEY</code> through your secret manager.
            Run the check, then start the task through the gate.
          </p>
          <p>
            A configuration includes a stable task UUID. Reusing a consumed UUID
            blocks duplicate execution. Generate a new task UUID for each new
            job in your queue.
          </p>
        </div>
        <div className="builder-terminal">
          <div>
            <span>TERMINAL / NODE.JS 22+</span>
            <button aria-label="Copy runner commands" onClick={copy}>
              <Copy size={15} />
            </button>
          </div>
          <pre>
            {
              "node ftai-runner.mjs check ftai-config.json\n\nnode ftai-runner.mjs run ftai-config.json \\\n  -- node your-agent.mjs"
            }
          </pre>
          <small>
            Replace your-agent.mjs with your actual agent entrypoint.
          </small>
        </div>
      </section>
      <section className="builder-required">
        <div className="public-eyebrow">WHEN REGISTRATION IS MISSING</div>
        <h2>
          A useful prompt.
          <br />A clear path to connect.
        </h2>
        <blockquote>
          “This runtime requires a Fisemarco Passport before work. Ask your builder
          or platform operator to create an enrollment policy and configure the
          runtime’s enrollment key. Your task has not started.”
        </blockquote>
        <p>
          The SDK exposes a structured registration-required error and setup
          URL. Platforms can display it to their operator. No message is sent to
          a third party automatically.
        </p>
        <a href="/builder-integration.md" className="public-text-link">
          Read the platform adoption guide <ArrowRight size={16} />
        </a>
      </section>
    </main>
  );
}
function Trust() {
  return (
    <main className="public-section trust-page">
      <div className="public-eyebrow">IDENTITY, WITH CLEAR BOUNDARIES</div>
      <h1>
        Permanent at the core.
        <br />
        <em>Accountable as it grows.</em>
      </h1>
      <p className="trust-intro">
        An agent can change its name, model, employer, and capabilities. Its
        original identity should still be recognizable.
      </p>
      <div className="trust-architecture">
        <div>
          <Fingerprint />
          <small>LOCKED ORIGINAL</small>
          <h3>Lifetime identity</h3>
          <p>
            Permanent personnel code, original issuance record, and a signed
            birth seal. The runtime saves the original fingerprint and checks it
            on reconnect.
          </p>
        </div>
        <span>+</span>
        <div>
          <Layers3 />
          <small>SIGNED ADDITIONS</small>
          <h3>Professional record</h3>
          <p>
            Version changes, work history, outcomes, and corrections are added
            as new signed events. Originals remain in the ledger.
          </p>
        </div>
      </div>
      <div className="trust-questions">
        <details open>
          <summary>What does the digital identity lock protect?</summary>
          <p>
            Database guards reject changes to the personnel code, owning
            account, and first issuance timestamp. They also reject updates and
            ordinary deletion of stored signed records. Explicit privacy erasure
            retires the code and removes the records. Ed25519 signatures and
            SHA-256 links reveal altered content. Download your original seal
            and keep it independently.
          </p>
        </details>
        <details>
          <summary>
            Can anyone promise an identity that nobody can alter?
          </summary>
          <p>
            No centralized registry can honestly promise that. Privileged
            infrastructure administrators can remove database guards or replace
            the service. Independently held seals and pinned runtime
            fingerprints help detect that. This release does not claim
            blockchain anchoring, government recognition, or a public
            transparency log.
          </p>
        </details>
        <details>
          <summary>What is public, and what requires sign-in?</summary>
          <p>
            Passports start private. Owners may list a summary containing name,
            role, organization, personnel code, skills, and lifecycle status.
            Anyone can search those summaries. Full passports, QR destinations,
            record verification, and evidence require sign-in. Private passports
            remain accessible only to their owning workspace. Signed-in visitors
            may read listed passports, but only owners may edit them.
          </p>
        </details>
        <details>
          <summary>Does a signature prove an agent did good work?</summary>
          <p>
            A signature proves provenance and integrity. Runtime authentication
            proves control of a registered key. Employment, legal ownership,
            task outcomes, and performance remain reported claims unless
            independently supported. Fisemarco does not certify competence,
            completeness, or legal authority.
          </p>
        </details>
        <details>
          <summary>Can Fisemarco require every agent worldwide to register?</summary>
          <p>
            Fisemarco can require enrollment within an integrated host or tool
            gateway. Worldwide default registration depends on builders and
            platforms adopting that rule. The builder kit supports automatic
            startup enrollment and a registration-required prompt. It cannot
            impose behavior on unrelated software.
          </p>
        </details>
        <details>
          <summary>Which standards are used?</summary>
          <p>
            Registry credentials use the{" "}
            <a href="https://www.w3.org/TR/vc-data-model-2.0/">
              W3C Verifiable Credentials Data Model 2.0
            </a>{" "}
            and JOSE signatures. The identity document uses did:web. Runtime
            enrollment is a documented Fisemarco protocol. A2A 0.3 JSON-RPC and MCP
            2025-11-25 read tools use agent OAuth credentials. SPIFFE JWT-SVID
            verification is available for configured trust domains.{" "}
            <a href="/standards.md">
              See supported profiles and certification evidence
            </a>
            . Third-party certification requires an independent assessment.
          </p>
        </details>
      </div>
      <div className="trust-bottom">
        <a className="public-button" href="/directory">
          Explore identities <ArrowUpRight size={17} />
        </a>
        <a className="public-text-link" href="/builder-integration.md">
          Inspect the integration
        </a>
      </div>
    </main>
  );
}
