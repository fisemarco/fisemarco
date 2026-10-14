"use client";
import { useEffect, useState } from "react";
import TrustGraph from "./trust-graph";
import Certificates from "./certificates";
import Assessment from "./assessment";
type Approval = {
  id: string;
  agent: string;
  grant_id: string;
  request: string;
  input_hash: string;
  state: string;
  expires: string;
  reason: string | null;
  receipt: string | null;
};
type Event = {
  id: string;
  agent: string;
  kind: string;
  decision: string;
  created: string;
  receipt: string;
  data: string;
};
type Monitor = {
  trends: {
    agent: string;
    current: { n: number; failed: number };
    previous: { n: number; failed: number };
    failureRateIncrease: number | null;
    alert: string;
    provenance: string;
  }[];
  events: Event[];
  summary: { agent: string; decision: string; count: number }[];
  workforce: {
    code: string;
    name: string;
    status: string;
    last_seen: string | null;
    runtime_status: string | null;
    revoked: number | null;
  }[];
  windowStart: string;
  source: string;
};
type Verification = {
  status: string;
  attestation: null | {
    legalName: string;
    registrationNumber: string;
    country: string;
    iss: string;
    exp: number;
    evidenceUrl: string;
  };
};
async function api<T>(
  org: string,
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<T> {
  const r = await fetch(`/api/v1/organisations/${org}/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(d.error || "Unable to complete this request.");
  return d;
}
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Governance({
  org,
  role,
}: {
  org: string;
  role: string;
}) {
  const [approvals, setApprovals] = useState<Approval[]>([]),
    [approvalNext, setApprovalNext] = useState<string | null>(null),
    [monitor, setMonitor] = useState<Monitor | null>(null),
    [verification, setVerification] = useState<Verification | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [tab, setTab] = useState("approvals");
  const admin = ["owner", "admin"].includes(role);
  async function refresh() {
    const [a, m, v] = await Promise.all([
      api<{ approvals: Approval[]; next: string | null }>(org, "approvals"),
      api<Monitor>(org, "monitoring"),
      api<Verification>(org, "verification"),
    ]);
    setApprovals(a.approvals);
    setApprovalNext(a.next);
    setMonitor(m);
    setVerification(v);
    setLoaded(true);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [org]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="governance">
      <h2>Governance centre</h2>
      <p>
        Review exact-action approvals, inspect observed activity and verify
        operator evidence.
      </p>
      <div className="enterprise-tabs" aria-label="Governance views">
        {[
          "approvals",
          "monitoring",
          "verification",
          "assessment",
          "graph",
          "certificates",
        ].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button disabled={busy} onClick={() => void act(refresh)}>
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="public-error">
          {error}
        </p>
      )}
      {!loaded && !error && <p role="status">Loading governance records…</p>}
      {tab === "graph" && <TrustGraph org={org} />}
      {tab === "certificates" && <Certificates org={org} admin={admin} />}
      {tab === "assessment" && <Assessment org={org} admin={admin} />}
      {tab === "approvals" && loaded && (
        <>
          <h3>Human approval queue</h3>
          <p>
            Review the action and task-input fingerprint before approving. Each
            approval is valid for one use, expires within one hour, and cannot
            bypass a revoked grant. A task permit is still required.
          </p>
          {!approvals.length ? (
            <p>
              No approval requests have been recorded. Integrated agents submit
              requests when an action needs escalation.
            </p>
          ) : (
            <ul className="governance-list">
              {approvals.map((a) => {
                const r = JSON.parse(a.request);
                const expired = Date.parse(a.expires) <= Date.now();
                return (
                  <li key={a.id}>
                    <h4>
                      {r.action} · {r.resource}
                    </h4>
                    <p>
                      {a.agent} · {r.country} · {r.currency} {r.amountMinor}{" "}
                      minor units
                    </p>
                    <p>
                      <strong>
                        {expired && ["pending", "approved"].includes(a.state)
                          ? "expired"
                          : a.state}
                      </strong>{" "}
                      · Expires {new Date(a.expires).toLocaleString()}
                    </p>
                    <details>
                      <summary>Inspect exact request</summary>
                      <dl>
                        <dt>Approval</dt>
                        <dd>{a.id}</dd>
                        <dt>Grant</dt>
                        <dd>{a.grant_id}</dd>
                        <dt>SHA-256 task input</dt>
                        <dd>{a.input_hash}</dd>
                      </dl>
                    </details>
                    {a.reason && <p>Decision reason: {a.reason}</p>}
                    {admin &&
                      !expired &&
                      ["pending", "approved"].includes(a.state) && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void act(() =>
                              api(org, "approvals/" + a.id, {
                                decision: f.get("decision"),
                                reason: f.get("reason"),
                              }),
                            );
                          }}
                        >
                          <label>
                            Decision reason
                            <input
                              name="reason"
                              required
                              minLength={5}
                              maxLength={1000}
                            />
                          </label>
                          <label>
                            Decision
                            <select name="decision">
                              {a.state === "pending" ? (
                                <>
                                  <option value="approved">
                                    Approve this exact action once
                                  </option>
                                  <option value="rejected">Reject</option>
                                </>
                              ) : (
                                <option value="revoked">
                                  Revoke unused approval
                                </option>
                              )}
                            </select>
                          </label>
                          <button disabled={busy}>Record decision</button>
                        </form>
                      )}
                    <button
                      onClick={() =>
                        download("ftai-approval-" + a.id + ".json", a)
                      }
                    >
                      Export evidence
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p>
            Requests are shown newest first. Expired requests cannot be approved
            or consumed.
          </p>
          {approvalNext && (
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void api<{ approvals: Approval[]; next: string | null }>(
                  org,
                  "approvals?after=" + encodeURIComponent(approvalNext),
                )
                  .then((page) => {
                    setApprovals((old) => [...old, ...page.approvals]);
                    setApprovalNext(page.next);
                  })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Load older approval requests
            </button>
          )}
        </>
      )}
      {tab === "monitoring" && monitor && (
        <>
          <h3>Observed activity</h3>
          <p>{monitor.source}</p>
          <p>
            Decision counts since{" "}
            {new Date(monitor.windowStart).toLocaleString()}. Refresh to
            retrieve current data.
          </p>
          <div className="enterprise-table">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Decision</th>
                  <th>Count / 24 hours</th>
                </tr>
              </thead>
              <tbody>
                {monitor.summary.map((s) => (
                  <tr key={s.agent + s.decision}>
                    <td>{s.agent}</td>
                    <td>{s.decision}</td>
                    <td>{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!monitor.summary.length && (
            <p>No authority decisions recorded in this window.</p>
          )}
          <h3>Outcome trend alerts</h3>
          <p>
            Compare runtime-reported failures in the last 24 hours with the
            preceding 24 hours. An alert requires 20 results per window and a
            failure-rate increase of 20 percentage points. This does not
            independently verify external work.
          </p>
          <ul className="governance-list">
            {monitor.trends.map((t) => (
              <li key={t.agent}>
                <strong>{t.agent}</strong>
                <p>{t.alert}</p>
                <p>
                  Current: {t.current.failed} failures / {t.current.n} reports.
                  Previous: {t.previous.failed} / {t.previous.n}.
                </p>
              </li>
            ))}
          </ul>
          <h3>Fleet health</h3>
          <div className="enterprise-table">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Passport</th>
                  <th>Runtime</th>
                  <th>Last authenticated contact</th>
                </tr>
              </thead>
              <tbody>
                {monitor.workforce.map((a) => (
                  <tr key={a.code}>
                    <td>
                      {a.name}
                      <small>{a.code}</small>
                    </td>
                    <td>{a.status}</td>
                    <td>
                      {a.revoked ? "Revoked" : a.runtime_status || "No runtime"}
                    </td>
                    <td>
                      {a.last_seen
                        ? new Date(a.last_seen).toLocaleString()
                        : "Not observed"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Signed audit records</h3>
          <p>
            Latest 200 events. Download evidence before deleting a workspace or
            erasing an identity.
          </p>
          <button
            onClick={() => download("ftai-audit-" + org + ".json", monitor)}
          >
            Export audit evidence
          </button>
          <ul className="governance-list">
            {monitor.events.map((e) => (
              <li key={e.id}>
                <strong>
                  {e.kind} · {e.decision}
                </strong>
                <p>
                  {e.agent} · {new Date(e.created).toLocaleString()}
                </p>
                <details>
                  <summary>View event</summary>
                  <pre>{JSON.stringify(JSON.parse(e.data), null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === "verification" && verification && (
        <>
          <h3>Operator verification</h3>
          <p>
            Status: <strong>{verification.status}</strong>
          </p>
          {verification.attestation && (
            <dl>
              <dt>Legal name</dt>
              <dd>{verification.attestation.legalName}</dd>
              <dt>Registration</dt>
              <dd>
                {verification.attestation.country} ·{" "}
                {verification.attestation.registrationNumber}
              </dd>
              <dt>Independent issuer</dt>
              <dd>{verification.attestation.iss}</dd>
              <dt>Valid until</dt>
              <dd>
                {new Date(verification.attestation.exp * 1000).toLocaleString()}
              </dd>
              <dt>Evidence</dt>
              <dd>
                <a
                  href={verification.attestation.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open verifier evidence
                </a>
              </dd>
            </dl>
          )}
          <p>
            Fisemarco accepts signed legal-existence and representative-authority
            attestations only from separately configured trusted verification
            providers. A company name, domain or uploaded document alone earns
            no verified status.
          </p>
          {role === "owner" && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(() =>
                    api(org, "verification", {
                      credential: f.get("credential"),
                    }),
                  );
                }}
              >
                <label>
                  Verifier-issued signed credential
                  <textarea
                    name="credential"
                    required
                    minLength={100}
                    maxLength={16000}
                    rows={5}
                  />
                </label>
                <button disabled={busy}>Validate and attach credential</button>
              </form>
              {verification.status !== "declared" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() => api(org, "verification", {}, "DELETE"))
                  }
                >
                  Remove attestation
                </button>
              )}
            </>
          )}
          <a href="/governance-protocol.md">
            Verification provider integration requirements
          </a>
        </>
      )}
    </section>
  );
}
