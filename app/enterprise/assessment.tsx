"use client";
import { useEffect, useState } from "react";
type Control = {
  id: string;
  title: string;
  evidence: string;
  status?: string;
  notes?: string;
  evidence_url?: string;
  evidence_hash?: string;
  updated?: string;
};
type Report = {
  controls: Control[];
  receipt: string;
  certified: false;
  generatedAt: string;
};
export default function Assessment({
  org,
  admin,
}: {
  org: string;
  admin: boolean;
}) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch(`/api/v1/organisations/${org}/assurance`);
    const d = (await r.json()) as Report & { error?: string };
    if (!r.ok) throw Error(d.error || "Assessment unavailable");
    setReport(d);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [org]);
  return (
    <section>
      <h3>Assessment preparation</h3>
      <p>
        Collect evidence for an independent assessment. These are Fisemarco
        preparation controls, not ISO clause certifications. Marking evidence
        ready does not certify your organisation.
      </p>
      {error && (
        <p role="alert" className="public-error">
          {error}
        </p>
      )}
      {!report && !error && <p>Loading assessment…</p>}
      {report && (
        <>
          <p>
            {
              report.controls.filter((c) => c.status === "ready-for-review")
                .length
            }{" "}
            / {report.controls.length} controls have evidence marked ready for
            review.
          </p>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(report, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "ftai-assessment-" + org + ".json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export signed assessment pack
          </button>
          <ul className="governance-list">
            {report.controls.map((c) => (
              <li key={c.id}>
                <h4>{c.title}</h4>
                <p>{c.evidence}</p>
                <strong>{c.status || "not-started"}</strong>
                {c.updated && (
                  <p>Updated {new Date(c.updated).toLocaleString()}</p>
                )}
                <details>
                  <summary>
                    {admin ? "Update evidence" : "View evidence"}
                  </summary>
                  {admin ? (
                    <form
                      key={c.updated || c.id}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        setBusy(true);
                        setError("");
                        void (async () => {
                          try {
                            const r = await fetch(
                              `/api/v1/organisations/${org}/assurance`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  control: c.id,
                                  status: f.get("status"),
                                  notes: f.get("notes"),
                                  evidenceUrl: f.get("url"),
                                  evidenceHash: f.get("hash"),
                                }),
                              },
                            );
                            const d = (await r.json()) as { error?: string };
                            if (!r.ok)
                              throw Error(d.error || "Could not save evidence");
                            await load();
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      <label>
                        Status
                        <select
                          name="status"
                          defaultValue={c.status || "not-started"}
                        >
                          <option value="not-started">Not started</option>
                          <option value="in-progress">In progress</option>
                          <option value="ready-for-review">
                            Evidence ready for review
                          </option>
                        </select>
                      </label>
                      <label>
                        Review notes
                        <textarea
                          name="notes"
                          required
                          minLength={5}
                          maxLength={2000}
                          defaultValue={c.notes || ""}
                        />
                      </label>
                      <label>
                        Evidence link (HTTPS)
                        <input
                          type="url"
                          name="url"
                          defaultValue={c.evidence_url || ""}
                        />
                      </label>
                      <label>
                        Evidence SHA-256
                        <input
                          name="hash"
                          pattern="[a-f0-9]{64}|"
                          defaultValue={c.evidence_hash || ""}
                        />
                      </label>
                      <p>
                        Keep documents in your approved evidence store. Do not
                        paste secrets or personal documents into notes.
                      </p>
                      <button disabled={busy}>Save evidence</button>
                    </form>
                  ) : (
                    <>
                      <p>{c.notes || "No notes recorded."}</p>
                      {c.evidence_url && (
                        <a
                          href={c.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open evidence reference
                        </a>
                      )}
                    </>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
