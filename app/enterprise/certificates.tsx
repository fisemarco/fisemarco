"use client";
import { useEffect, useState } from "react";
type Certificate = {
  id: string;
  agent: string;
  scheme: string;
  expires: string;
  status: string;
  credential: string;
};
type Assessment = {
  eligible: boolean;
  scope: string;
  checks: { id: string; pass: boolean; basis: string }[];
};
export default function Certificates({
  org,
  admin,
}: {
  org: string;
  admin: boolean;
}) {
  const [next, setNext] = useState<string | null>(null);
  const [items, setItems] = useState<Certificate[]>([]),
    [agent, setAgent] = useState(""),
    [assessment, setAssessment] = useState<Assessment | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState("");
  async function api<T = unknown>(
    path = "",
    body?: unknown,
    method = body ? "POST" : "GET",
  ) {
    const r = await fetch(
      `/api/v1/organisations/${org}/certifications${path}`,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    const d = (await r.json()) as T & { error?: string };
    if (!r.ok) throw Error(d.error || "Certificate operation failed");
    return d;
  }
  async function refresh() {
    const page = await api<{
      certificates: Certificate[];
      next: string | null;
    }>();
    setItems(page.certificates);
    setNext(page.next);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [org]);
  async function act(fn: () => Promise<void>) {
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
  function download(c: Certificate) {
    const u = URL.createObjectURL(
      new Blob([c.credential], { type: "application/vc+jwt" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = c.id + ".jwt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  return (
    <section>
      <h3>Fisemarco technical certification</h3>
      <p>
        Fisemarco issues the Runtime Identity v1 certificate after live technical
        checks. Valid for up to 24 hours, subject to current requirements and
        revocation. This certifies identity integration, not competence, output
        safety, legal ownership, ISO conformity or EU compliance.
      </p>
      <a href="/certification-scheme.md">
        Published scheme and verification rules
      </a>
      {error && <p role="alert">{error}</p>}
      {admin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () =>
              setAssessment(await api<Assessment>("", { agent, issue: false })),
            );
          }}
        >
          <label>
            Agent personnel code
            <input
              required
              value={agent}
              onChange={(e) => {
                setAgent(e.target.value);
                setAssessment(null);
              }}
              placeholder="FTAI-0000-0000-0000"
            />
          </label>
          <button disabled={busy}>Run assessment</button>
          {assessment && (
            <>
              <ul>
                {assessment.checks.map((c) => (
                  <li key={c.id}>
                    {c.pass ? "Pass" : "Fail"} · {c.id} — {c.basis}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy || !assessment.eligible}
                onClick={() =>
                  void act(async () => {
                    await api("", { agent, issue: true });
                    setAssessment(null);
                  })
                }
              >
                Issue Fisemarco certificate
              </button>
            </>
          )}
        </form>
      )}
      {admin && (
        <label>
          Reason for revoking a certificate
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={3}
            maxLength={500}
          />
        </label>
      )}
      {next && (
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void api<{ certificates: Certificate[]; next: string | null }>(
              "?after=" + encodeURIComponent(next),
            )
              .then((page) => {
                setItems((old) => [...old, ...page.certificates]);
                setNext(page.next);
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Load older certificates
        </button>
      )}
      {!items.length && (
        <p>No certificates have been issued for this organisation.</p>
      )}
      {items.map((c) => (
        <article className="enterprise-card" key={c.id}>
          <h4>{c.agent}</h4>
          <p>
            {c.scheme} · {c.status} · expires{" "}
            {new Date(c.expires).toLocaleString()}
          </p>
          <button onClick={() => download(c)}>Download credential</button>
          {admin && c.status !== "revoked" && (
            <button
              disabled={busy || reason.trim().length < 3}
              onClick={() =>
                void act(async () => {
                  await api("/" + c.id, { reason }, "DELETE");
                })
              }
            >
              Revoke certificate
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
