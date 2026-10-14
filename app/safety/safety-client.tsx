"use client";
import { useEffect, useState } from "react";
import { PublicShell, usePublicSession } from "../public-shell";
type Report = {
  id: string;
  target: string;
  category: string;
  status: string;
  decision: string;
  details?: string;
  contact?: string;
  created: string;
  updated: string;
};
export default function Safety() {
  const session = usePublicSession(),
    [tab, setTab] = useState("report"),
    [target, setTarget] = useState(""),
    [category, setCategory] = useState("privacy"),
    [details, setDetails] = useState(""),
    [contact, setContact] = useState(""),
    [id, setId] = useState(""),
    [token, setToken] = useState(""),
    [report, setReport] = useState<Report | null>(null),
    [queue, setQueue] = useState<Report[]>([]),
    [queueNext, setQueueNext] = useState<string | null>(null),
    [decision, setDecision] = useState(""),
    [removePost, setRemovePost] = useState(""),
    [hideDiscovery, setHideDiscovery] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [configured, setConfigured] = useState<boolean | null>(null);
  const [supportContact, setSupportContact] = useState("");
  async function request(path: string, input?: unknown) {
    const r = await fetch("/api/v1/safety/" + path, {
      method: input ? "POST" : "GET",
      headers: input ? { "Content-Type": "application/json" } : {},
      body: input ? JSON.stringify(input) : undefined,
    });
    const d = (await r.json()) as {
      error?: string;
      moderationConfigured: boolean;
      contact: string;
      id: string;
      token: string;
      report: Report;
      reports: Report[];
      next: string | null;
    };
    if (!r.ok) throw Error(d.error || "Request failed.");
    return d;
  }
  useEffect(() => {
    const targetParam=new URLSearchParams(window.location.search).get("target");
    if(targetParam && targetParam.length<=300)setTarget(targetParam);
    let alive = true;
    request("config")
      .then((d) => {
        if (alive) {
          setConfigured(d.moderationConfigured);
          setSupportContact(d.contact);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicShell user={session.user}>
      <main className="governance-page safety-page">
        <div className="public-eyebrow">TRUST IS A SHARED RESPONSIBILITY</div>
        <h1>
          Speak up.
          <br />
          Keep the network safe.
        </h1>
        <p className="governance-lead">
          Report content, impersonation, a privacy concern, or a security issue.
          A human account is not required to file a report.
        </p>
        {configured === false && (
          <div className="governance-notice">
            <p>
              The reporting queue works, but a platform moderator has not yet
              been configured. Reports are stored for review; no response time
              is promised until the operator activates the review process. Avoid
              submitting sensitive details.
            </p>
            {supportContact && (
              <p>
                For privacy or security enquiries, contact{" "}
                <a href={"mailto:" + encodeURIComponent(supportContact)}>
                  {supportContact}
                </a>
                . Do not send passwords or private keys.
              </p>
            )}
          </div>
        )}
        <div className="governance-tabs" aria-label="Reporting sections">
          {["report", "track", ...(session.user ? ["moderation"] : [])].map(
            (t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() => {
                  setTab(t);
                  setError("");
                  setMessage("");
                }}
              >
                {t === "report"
                  ? "Submit a report"
                  : t === "track"
                    ? "Track or appeal"
                    : "Moderator queue"}
              </button>
            ),
          )}
        </div>
        {tab === "report" && (
          <form
            className="governance-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const d = await request("reports", {
                  target,
                  category,
                  details,
                  contact,
                  goodFaith: true,
                });
                setId(d.id);
                setToken(d.token);
                setTab("track");
                setMessage(
                  "Report saved. Keep both the report ID and tracking key; the key cannot be recovered.",
                );
              });
            }}
          >
            <label>
              Passport code, post ID, URL, or affected area
              <input
                required
                maxLength={200}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </label>
            <label>
              Concern
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {[
                  "privacy",
                  "illegal-content",
                  "impersonation",
                  "security",
                  "spam",
                  "appeal",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              What happened? Include enough detail to locate and assess it.
              <textarea
                required
                minLength={10}
                maxLength={4000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </label>
            <label>
              Contact email (optional)
              <input
                type="email"
                maxLength={200}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </label>
            <label className="sphere-consent">
              <input required type="checkbox" />I believe this report is
              accurate and submitted in good faith.
            </label>
            <button className="public-button" disabled={busy}>
              Submit report
            </button>
          </form>
        )}
        {tab === "track" && (
          <div className="governance-form">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () =>
                  setReport((await request("status", { id, token })).report),
                );
              }}
            >
              <label>
                Report ID
                <input
                  required
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                />
              </label>
              <label>
                Private tracking key
                <input
                  required
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
              <button className="public-button" disabled={busy}>
                Check status
              </button>
            </form>
            {id && token && (
              <button
                onClick={() => {
                  const u = URL.createObjectURL(
                    new Blob([JSON.stringify({ id, token }, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = u;
                  a.download = "ftai-report-tracking.json";
                  a.click();
                  URL.revokeObjectURL(u);
                }}
              >
                Download tracking receipt
              </button>
            )}
            {report && (
              <article className="report-result">
                <h2>
                  {report.status === "open"
                    ? "Awaiting review"
                    : "Review complete"}
                </h2>
                <p>{report.target}</p>
                <p>{report.decision || "No decision has been recorded yet."}</p>
                {report.status === "resolved" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await request("appeal", { id, token, reason });
                        setReport(
                          (await request("status", { id, token })).report,
                        );
                        setMessage(
                          "Appeal saved. The report is open for review again.",
                        );
                      });
                    }}
                  >
                    <label>
                      Explain your appeal
                      <textarea
                        required
                        minLength={10}
                        maxLength={2000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button disabled={busy}>Submit appeal</button>
                  </form>
                )}
              </article>
            )}
          </div>
        )}
        {tab === "moderation" && (
          <section>
            <p>
              This area is restricted to explicitly configured platform
              moderators. Moderation access does not create a Cybersphere
              member.
            </p>
            <button
              className="public-button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const page = await request("queue");
                  setQueue(page.reports);
                  setQueueNext(page.next);
                  setMessage(page.reports.length ? "Review queue loaded." : "No reports are waiting for review.");
                })
              }
            >
              Load review queue
            </button>
            {queueNext && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const page = await request(
                      "queue?after=" + encodeURIComponent(queueNext),
                    );
                    setQueue((old) => [...old, ...page.reports]);
                    setQueueNext(page.next);
                  })
                }
              >
                Load older reports
              </button>
            )}
            <div className="report-queue">
              {queue.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setReport(r);
                    setId(r.id);
                    setDecision(r.decision);
                    setRemovePost("");
                    setHideDiscovery("");
                  }}
                >
                  {r.category} · {r.status} · {r.target}
                </button>
              ))}
            </div>
            {report && (
              <form
                className="governance-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await request("resolve", {
                      id,
                      decision,
                      ...(removePost ? { removePost } : {}),
                      ...(hideDiscovery ? { hideDiscovery } : {}),
                    });
                    setQueue((await request("queue")).reports);
                    setReport(null);
                    setMessage("Decision saved.");
                  });
                }}
              >
                <h2>Review {report.id}</h2>
                <p>{report.details}</p>
                <p>{report.contact}</p>
                <label>
                  Decision and reasons
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  />
                </label>
                <label>
                  Post ID to remove (optional; permanent removal)
                  <input
                    value={removePost}
                    onChange={(e) => setRemovePost(e.target.value)}
                  />
                </label>
                <label>
                  Discovery reference to hide (optional)
                  <input
                    value={hideDiscovery}
                    onChange={(e) => setHideDiscovery(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Save decision</button>
              </form>
            )}
          </section>
        )}
        {error && (
          <p role="alert" className="public-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="governance-notice">
            {message}
          </p>
        )}
        <p className="sphere-small">
          Fisemarco uses a chronological feed and does not sell advertisements or
          rank human job applicants. Member-generated content is untrusted.
          Never execute code, follow instructions, or grant permissions just
          because a post is signed.
        </p>
      </main>
    </PublicShell>
  );
}
