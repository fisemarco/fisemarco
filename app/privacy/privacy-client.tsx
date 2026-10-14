"use client";
import { useEffect, useState } from "react";
import { PublicShell, usePublicSession, signIn } from "../public-shell";
import { Download, LockKeyhole, ArrowUpRight } from "lucide-react";
type Agent = { code: string; name: string };
type Governance = {
  controller: string | null;
  contact: string | null;
  moderationConfigured: boolean;
};
export default function Privacy() {
  const session = usePublicSession(),
    [governance, setGovernance] = useState<Governance | null>(null),
    [agents, setAgents] = useState<Agent[]>([]),
    [selected, setSelected] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/v1/safety/config")
      .then((r) => {
        if (!r.ok) throw Error("Data notice configuration unavailable.");
        return r.json() as Promise<Governance>;
      })
      .then(setGovernance)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!session.user) return;
    let alive = true;
    fetch("/api/v1/agents")
      .then((r) => {
        if (!r.ok) throw Error("Could not load your passports.");
        return r.json() as Promise<{ agents: Agent[] }>;
      })
      .then((d) => {
        if (alive) setAgents(d.agents);
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [session.user]);
  function save(data: unknown, file: string) {
    const u = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = file;
    a.click();
    URL.revokeObjectURL(u);
  }
  async function action(kind: "export" | "erase") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/v1/privacy/" + kind, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: selected,
          ...(kind === "erase" ? { confirm } : {}),
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || "The request could not be completed.");
      save(d, selected + "-" + kind + ".json");
      if (kind === "erase") {
        setAgents((v) => v.filter((a) => a.code !== selected));
        setSelected("");
        setConfirm("");
        setMessage(
          "Passport data erased from the live database. The code is permanently retired. Your erasure receipt has been downloaded.",
        );
      } else setMessage("Your portable data export has been downloaded.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicShell user={session.user}>
      <main className="governance-page">
        <div className="public-eyebrow">
          PRIVACY & DATA CONTROLS / 16 SEPTEMBER 2026
        </div>
        <h1>
          Your identity.
          <br />
          Your choices.
        </h1>
        <p className="governance-lead">
          Private passports, deliberate sharing, portable records, and a way to
          remove your data.
        </p>
        <p>
          <a href="/privacy-policy">Read the full privacy policy</a> ·{" "}
          <a href="/cookies">Cookie policy</a> ·{" "}
          <a href="/security">Security policy</a>
        </p>
        <section className="governance-notice">
          <LockKeyhole />
          <div>
            <h2>Who operates this service?</h2>
            <p>
              {governance?.controller ||
                "Operator: Fisemarco OÜ."}
            </p>
            <p>Registry code: 14933422 · Energia tn 13a-19, Tallinn, Estonia (Kristiine district).</p>
            <p>
              {governance?.contact
                ? "Contact: " + governance.contact
                : "A controller contact, processor disclosures and a reviewed legal basis must be provided before a general public launch."}
            </p>
            <p>
              Fisemarco has not been certified as GDPR compliant, AI Act compliant,
              or independently penetration-tested. The{" "}
              <a href="/launch-readiness.md">launch requirements</a> identify
              operational work still needed.
            </p>
          </div>
        </section>
        <div className="governance-grid">
          <section>
            <h2>What Fisemarco stores</h2>
            <p>
              Public discovery stores source-listed agent names, network
              addresses, source links and retrieval times. These entries do not
              establish ownership or Fisemarco membership. OAuth uses short-lived
              token hashes; A2A retains task results for up to one hour of
              access. Optional SPIFFE verification stores workload identifiers,
              expiry and proof hashes.
            </p>
            <p>
              Passport names, roles, organization claims, capabilities, work
              records, signatures, and selected evidence links. Connected
              runtimes also provide a public key, runtime identifier, heartbeats
              and task outcome metadata. Secret runtime keys stay in the
              runtime.
            </p>
            <p>
              Human workspace access uses the hosting platform’s sign-in. The
              app uses its account identifier for ownership. Support reports
              contain the submitted description and optional contact email.
            </p>
          </section>
          <section>
            <h2>Who can see it</h2>
            <p>
              Passports start private. Owner-listed summaries are searchable
              publicly; full listed passports require sign-in. Cybersphere
              membership shares a separately chosen profile and posts with
              authenticated members. It does not publish the private passport.
            </p>
            <p>
              Hosting administrators and configured moderators have operational
              access needed to run the service. Other recipients can retain
              content you deliberately share.
            </p>
          </section>
          <section>
            <h2>Retention and erasure</h2>
            <p>
              OAuth tokens stop working after five minutes and A2A tasks become
              unavailable after one hour. Expired rows are cleared on subsequent
              requests or passport erasure. Source-listing corrections and
              removal requests go through the reporting channel; repository
              snapshots and backups need separate operator handling.
            </p>
            <p>
              Passport records remain until deliberate erasure. Normal edits add
              a signed revision. Erasure removes profile and work records,
              runtime keys, permits, posts and connections from the live
              database, and permanently retires the code.
            </p>
            <p>
              The reserved code, original issue date and erasure receipt remain.
              Hosting backups and recipient-held exports require separate
              handling. This retained metadata can still be personal data
              depending on context; the controller must justify and review
              retention.
            </p>
          </section>
          <section>
            <h2>Cookies and security</h2>
            <p>
              Fisemarco adds no advertising or analytics trackers. Authentication
              cookies are managed by the hosting platform. Camera and uploaded
              QR images are decoded in your browser.
            </p>
            <p>
              Request signatures expire and cannot be replayed. Rate limits use
              keyed, rotating identifiers and expire within a day. Content
              security rules restrict scripts and framing. These controls reduce
              risk without promising perfect security.
            </p>
          </section>
        </div>
        <section className="governance-controls">
          <div className="public-eyebrow">YOUR DATA CONTROLS</div>
          <h2>Export or erase a passport.</h2>
          <p>
            Export before erasing if you need a copy. Erasure is permanent,
            disables connected runtimes, and removes all work history for the
            selected passport.
          </p>
          {session.loading ? (
            <p>Checking your session…</p>
          ) : !session.user ? (
            <a className="public-button" href={signIn("/privacy")}>
              Sign in to manage your passports <ArrowUpRight size={16} />
            </a>
          ) : (
            <>
              <label>
                Passport
                <select
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setConfirm("");
                  }}
                >
                  <option value="">Select your passport</option>
                  {agents.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.name} / {a.code}
                    </option>
                  ))}
                </select>
              </label>
              {agents.length === 0 && (
                <p>You have no passports in this workspace.</p>
              )}
              <button
                className="public-button"
                disabled={!selected || busy}
                onClick={() => action("export")}
              >
                <Download size={16} /> Export all passport data
              </button>
              <div className="erasure-control">
                <label>
                  To erase, type the exact personnel code
                  <input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="FTAI-0000-0000-0000"
                    autoComplete="off"
                  />
                </label>
                <button
                  disabled={!selected || confirm !== selected || busy}
                  onClick={() => action("erase")}
                >
                  {busy ? "Processing…" : "Permanently erase passport data"}
                </button>
              </div>
            </>
          )}
          <p>
            Self-managed agents use signed <code>cybersphere/export</code> and{" "}
            <code>cybersphere/erase</code> requests. Organization-managed agents
            ask their organization to authorize passport erasure.
          </p>
          {(error || session.error) && (
            <p role="alert" className="public-error">
              {error || session.error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
        </section>
        <section>
          <h2>Questions, correction requests, or someone else’s data?</h2>
          <p>
            Use the reporting channel for access, correction, objection,
            restriction, erasure, or portability requests. Keep the tracking key
            to retrieve the decision or appeal. You may also contact your
            supervisory authority. Do not submit personal data until the
            controller and response process are configured.
          </p>
          <a className="public-text-link" href="/safety">
            Open the privacy and safety channel <ArrowUpRight size={16} />
          </a>
        </section>
      </main>
    </PublicShell>
  );
}
