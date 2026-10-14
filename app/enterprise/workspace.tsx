"use client";
import { useEffect, useState, useRef } from "react";
import Governance from "./governance";
import { PublicShell, usePublicSession, signIn } from "../public-shell";
type Organisation = { id: string; name: string; role: string };
type Grant = {
  id: string;
  subject: string;
  parent: string | null;
  constraints: string;
  expires: string;
  revoked: number;
  receipt: string;
};
type Detail = {
  invitations: { id: string; role: string; expires: string }[];
  organisation: Organisation;
  role: string;
  agents: {
    code: string;
    name: string;
    status: string;
    team: string;
    classification: string;
  }[];
  grants: Grant[];
  nextGrantCursor: string | null;
  members: { id: string; role: string; self: boolean }[];
};
const classes = {
  A1: "AI assistant",
  A2: "Autonomous agent",
  A3: "AI employee",
  A4: "AI service",
  A5: "Sub-agent",
  A6: "Agentic system",
  A7: "Collective / swarm",
};
async function request<T>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<T> {
  const r = await fetch("/api/v1/organisations" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(d.error || "The operation failed. Please retry.");
  return d;
}
const list = (v: FormDataEntryValue | null) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export default function Enterprise() {
  const session = usePublicSession();
  const [organisations, setOrganisations] = useState<Organisation[]>([]),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [invite, setInvite] = useState<{
      id: string;
      token: string;
      expires: string;
    } | null>(null),
    [result, setResult] = useState<unknown>(null);
  const currentOrganisation = useRef(selected);
  currentOrganisation.current = selected;
  async function refresh() {
    const d = await request<{ organisations: Organisation[] }>("");
    setOrganisations(d.organisations);
    setLoaded(true);
  }
  useEffect(() => {
    if (session.user) refresh().catch((e) => setError(e.message));
  }, [session.user]);
  useEffect(() => {
    setDetail(null);
    setResult(null);
    setInvite(null);
    if (!selected) return;
    let active = true;
    request<Detail>("/" + selected)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (selected && currentOrganisation.current === selected) {
        const updated = await request<Detail>("/" + selected);
        if (currentOrganisation.current === selected) setDetail(updated);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const admin = detail && ["owner", "admin"].includes(detail.role);
  const base = "/" + selected;
  function download(grant: Grant) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(grant, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "ftai-grant-" + grant.id + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <PublicShell user={session.user}>
      <main className="enterprise-page">
        <header>
          <span className="public-eyebrow">Fisemarco / ORGANISATIONS</span>
          <h1>
            Your workforce.
            <br />
            <em>Explicit authority.</em>
          </h1>
          <p>
            Organise AI actors and constrain delegated authority. Organisation
            names start as declarations; independent attestation is managed in
            the governance centre. A decision check does not itself execute or
            authorise an external tool.
          </p>
        </header>
        {(error || session.error) && (
          <p className="public-error" role="alert">
            {error || session.error}
          </p>
        )}
        {session.loading ? (
          <p>Checking your session…</p>
        ) : !session.user ? (
          <a className="public-button" href={signIn("/enterprise")}>
            Sign in to your organisation workspace ↗
          </a>
        ) : (
          <>
            <section className="enterprise-grid">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const name = new FormData(form).get("name");
                  void act(async () => {
                    const d = await request<Organisation>("", { name });
                    await refresh();
                    setSelected(d.id);
                    form.reset();
                  });
                }}
              >
                <h2>Create an organisation</h2>
                <label>
                  Organisation name
                  <input name="name" required minLength={2} maxLength={160} />
                </label>
                <p>
                  You become its owner. Creating a workspace does not verify
                  legal ownership of this name.
                </p>
                <button disabled={busy} className="public-button">
                  Create workspace
                </button>
              </form>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const token = new FormData(form).get("token");
                  void act(async () => {
                    const d = await request<{ organisation: string }>("/join", {
                      token,
                    });
                    await refresh();
                    setSelected(d.organisation);
                    form.reset();
                  });
                }}
              >
                <h2>Join by invitation</h2>
                <label>
                  One-time invitation token
                  <input
                    name="token"
                    required
                    autoComplete="off"
                    type="password"
                  />
                </label>
                <p>
                  Accept only from someone you know. Invitations expire after 24
                  hours.
                </p>
                <button disabled={busy} className="public-button">
                  Join organisation
                </button>
              </form>
            </section>
            <label className="enterprise-selector">
              Your organisation
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setError("");
                }}
              >
                <option value="">
                  {loaded ? "Choose an organisation" : "Loading organisations…"}
                </option>
                {organisations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {o.role}
                  </option>
                ))}
              </select>
            </label>
            {loaded && !organisations.length && (
              <p>
                No organisations yet. Create one or join with an invitation.
              </p>
            )}
            {selected && !detail && <p>Loading workspace…</p>}
            {detail && (
              <>
                <section className="enterprise-overview">
                  <h2>{detail.organisation.name}</h2>
                  <p>
                    Your access: {detail.role} · Operator verification: see
                    Governance centre
                  </p>
                  <div className="enterprise-counts">
                    <span>
                      <strong>{detail.agents.length}</strong> assigned actors
                    </span>
                    <span>
                      <strong>
                        {
                          detail.agents.filter((a) => a.status === "active")
                            .length
                        }
                      </strong>{" "}
                      active
                    </span>
                    <span>
                      <strong>{detail.members.length}</strong> members
                    </span>
                  </div>
                </section>
                <nav
                  className="enterprise-tabs"
                  aria-label="Organisation sections"
                >
                  <a href="#workforce">Workforce</a>
                  <a href="#authority">Authority</a>
                  <a href="#governance">Approvals, monitoring & assessment</a>
                </nav>
                <section id="workforce">
                  <h2>AI workforce</h2>
                  <p>
                    Assignment shares the name, role, status and team with
                    organisation members. It does not transfer passport
                    ownership or reveal private work records.
                  </p>
                  <div className="enterprise-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Actor</th>
                          <th>Class / team</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.agents.map((a) => (
                          <tr key={a.code}>
                            <td>
                              {a.name}
                              <small>{a.code}</small>
                            </td>
                            <td>
                              {
                                classes[
                                  a.classification as keyof typeof classes
                                ]
                              }
                              <small>{a.team || "No team"}</small>
                            </td>
                            <td>{a.status}</td>
                            <td>
                              {admin && (
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "Remove this assignment and revoke its organisation grants?",
                                      )
                                    )
                                      void act(async () => {
                                        await request(
                                          base + "/agents/" + a.code,
                                          {},
                                          "DELETE",
                                        );
                                      });
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!detail.agents.length && <p>No actors assigned.</p>}
                  {admin && (
                    <form
                      className="enterprise-inline"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void act(async () => {
                          await request(base + "/agents", {
                            agent: String(f.get("agent")).trim().toUpperCase(),
                            classification: f.get("classification"),
                            team: f.get("team"),
                          });
                        });
                      }}
                    >
                      <label>
                        Passport you own
                        <input
                          name="agent"
                          required
                          placeholder="FTAI-0000-0000-0000"
                        />
                      </label>
                      <label>
                        Classification
                        <select name="classification">
                          {Object.entries(classes).map(([k, v]) => (
                            <option value={k} key={k}>
                              {k} · {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Team
                        <input name="team" maxLength={100} />
                      </label>
                      <button disabled={busy} className="public-button">
                        Assign / update
                      </button>
                    </form>
                  )}
                </section>
                <section>
                  <h2>People and access</h2>
                  <p>
                    Owners invite and remove people; administrators manage
                    actors and grants; auditors have read access. Member
                    identifiers are organisation-specific.
                  </p>
                  {detail.members.map((m) => (
                    <div className="enterprise-row" key={m.id}>
                      <code>
                        {m.id.slice(0, 12)}
                        {m.self ? " · you" : ""}
                      </code>
                      <span>{m.role}</span>
                      {detail.role === "owner" && m.role !== "owner" && (
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                "Remove this member's organisation access?",
                              )
                            )
                              void act(async () => {
                                await request(
                                  base + "/members/" + m.id,
                                  {},
                                  "DELETE",
                                );
                              });
                          }}
                        >
                          Remove member
                        </button>
                      )}
                    </div>
                  ))}
                  {detail.role === "owner" && (
                    <form
                      className="enterprise-inline"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const role = new FormData(e.currentTarget).get("role");
                        void act(async () =>
                          setInvite(
                            await request(base + "/invitations", { role }),
                          ),
                        );
                      }}
                    >
                      <label>
                        Invite access
                        <select name="role">
                          <option value="auditor">Auditor · read only</option>
                          <option value="admin">
                            Administrator · manage authority
                          </option>
                        </select>
                      </label>
                      <button disabled={busy} className="public-button">
                        Create invitation
                      </button>
                    </form>
                  )}
                  {detail.invitations.map((i) => (
                    <div className="enterprise-row" key={i.id}>
                      <span>
                        Pending {i.role} invitation · expires {i.expires}
                      </span>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await request(
                              base + "/invitations/" + i.id,
                              {},
                              "DELETE",
                            );
                            if (invite?.id === i.id) setInvite(null);
                          })
                        }
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                  {invite && (
                    <aside className="enterprise-output">
                      <strong>
                        Invitation created. Nothing has been sent.
                      </strong>
                      <p>
                        Share this once through your trusted channel. Expires{" "}
                        {invite.expires}.
                      </p>
                      <textarea
                        aria-label="Invitation token"
                        readOnly
                        value={invite.token}
                      />
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await request(
                              base + "/invitations/" + invite.id,
                              {},
                              "DELETE",
                            );
                            setInvite(null);
                          })
                        }
                      >
                        Revoke invitation
                      </button>
                    </aside>
                  )}
                </section>
                <section>
                  <h2 id="authority">Authority and delegation</h2>
                  <p>
                    Amounts are in minor units: EUR 10000 means €100. Limits
                    apply per action, not as a cumulative spending budget.
                    Actions and resources match exactly. A child must narrow the
                    parent's scope and expiry. Up to eight grants may form a
                    chain.
                  </p>
                  <div className="enterprise-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Grant / subject</th>
                          <th>Constraints</th>
                          <th>Lifecycle</th>
                          <th>Evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.grants.map((g) => {
                          const c = JSON.parse(g.constraints);
                          return (
                            <tr key={g.id}>
                              <td>
                                <code>{g.id}</code>
                                <small>{g.subject}</small>
                                <small>
                                  {g.parent
                                    ? "Parent: " + g.parent
                                    : "Root · organisation-issued"}
                                </small>
                              </td>
                              <td>
                                {c.actions.join(", ")}
                                <small>
                                  {c.currency} {c.maxAmountMinor} minor units
                                </small>
                                <small>{c.countries.join(", ")}</small>
                              </td>
                              <td>
                                {g.revoked
                                  ? "Revoked"
                                  : Date.parse(g.expires) <= Date.now()
                                    ? "Expired"
                                    : "Check chain before use"}
                                <small>{g.expires}</small>
                              </td>
                              <td>
                                <button onClick={() => download(g)}>
                                  Export signed record
                                </button>
                                {admin && !g.revoked && (
                                  <button
                                    disabled={busy}
                                    onClick={() => {
                                      if (
                                        confirm(
                                          "Revoke this grant and invalidate all descendant authority checks?",
                                        )
                                      )
                                        void act(async () => {
                                          await request(
                                            base + "/grants/" + g.id,
                                            {},
                                            "DELETE",
                                          );
                                        });
                                    }}
                                  >
                                    Revoke
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p>Showing {detail.grants.length} grants, newest first.</p>
                  {detail.nextGrantCursor && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const requestedOrg = selected;
                        setBusy(true);
                        setError("");
                        void request<{ grants: Grant[]; next: string | null }>(
                          base +
                            "/grants?after=" +
                            encodeURIComponent(detail.nextGrantCursor!),
                        )
                          .then((page) => {
                            if (currentOrganisation.current === requestedOrg)
                              setDetail((old) =>
                                old
                                  ? {
                                      ...old,
                                      grants: [...old.grants, ...page.grants],
                                      nextGrantCursor: page.next,
                                    }
                                  : old,
                              );
                          })
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      Load older grants
                    </button>
                  )}
                  {admin && (
                    <form
                      className="enterprise-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void act(async () => {
                          await request(base + "/grants", {
                            subject: f.get("subject"),
                            parent: f.get("parent") || null,
                            expires: new Date(
                              String(f.get("expires")),
                            ).toISOString(),
                            constraints: {
                              actions: list(f.get("actions")),
                              resources: list(f.get("resources")),
                              countries: list(f.get("countries")).map((s) =>
                                s.toUpperCase(),
                              ),
                              currency: String(f.get("currency")).toUpperCase(),
                              maxAmountMinor: Number(f.get("max")),
                              approvalAboveMinor: Number(f.get("approval")),
                              mayDelegate: f.get("delegate") === "on",
                              requireApproval: f.get("alwaysApprove") === "on",
                            },
                          });
                        });
                      }}
                    >
                      <h3>Issue bounded authority</h3>
                      <label>
                        Subject
                        <select name="subject" required>
                          <option value="">Choose assigned actor</option>
                          {detail.agents
                            .filter((a) => a.status === "active")
                            .map((a) => (
                              <option key={a.code} value={a.code}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Parent grant
                        <select name="parent">
                          <option value="">
                            Root authority (organisation declaration)
                          </option>
                          {detail.grants
                            .filter((g) => !g.revoked)
                            .map((g) => (
                              <option value={g.id} key={g.id}>
                                {g.subject} · {g.id}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Actions, comma-separated
                        <input
                          name="actions"
                          required
                          placeholder="procurement.purchase"
                        />
                      </label>
                      <label>
                        Exact resource identifiers, comma-separated
                        <input
                          name="resources"
                          required
                          placeholder="supplier:approved-123"
                        />
                      </label>
                      <label>
                        Countries, two-letter codes
                        <input name="countries" required placeholder="FI, EE" />
                      </label>
                      <label>
                        Currency code
                        <input
                          name="currency"
                          required
                          pattern="[A-Za-z]{3}"
                          defaultValue="EUR"
                        />
                      </label>
                      <label>
                        Maximum per action, minor units
                        <input
                          type="number"
                          name="max"
                          required
                          min="0"
                          max="1000000000000"
                          step="1"
                        />
                      </label>
                      <label>
                        Require approval above, minor units
                        <input
                          type="number"
                          name="approval"
                          required
                          min="0"
                          max="1000000000000"
                          step="1"
                        />
                      </label>
                      <label>
                        Expires (your local time; within 90 days)
                        <input type="datetime-local" name="expires" required />
                      </label>
                      <label className="enterprise-check">
                        <input type="checkbox" name="alwaysApprove" />
                        Always require exact-task human approval, including
                        zero-value actions
                      </label>
                      <label className="enterprise-check">
                        <input type="checkbox" name="delegate" />
                        Allow narrower child grants
                      </label>
                      <button disabled={busy} className="public-button">
                        Issue grant
                      </button>
                    </form>
                  )}
                </section>
                {admin && (
                  <section>
                    <h2>Policy decision workbench</h2>
                    <p>
                      Simulation only. ALLOW is not a tool permit. ESCALATE
                      requires a one-use approval from the governance centre.
                      Runtimes must use the signed live authorisation API and
                      still enforce their task permits.
                    </p>
                    <form
                      className="enterprise-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void act(async () =>
                          setResult(
                            await request(base + "/evaluate", {
                              grant: f.get("grant"),
                              request: {
                                action: f.get("action"),
                                resource: f.get("resource"),
                                country: String(f.get("country")).toUpperCase(),
                                currency: String(
                                  f.get("currency"),
                                ).toUpperCase(),
                                amountMinor: Number(f.get("amount")),
                              },
                            }),
                          ),
                        );
                      }}
                    >
                      <label>
                        Grant
                        <select name="grant" required>
                          <option value="">Choose grant</option>
                          {detail.grants.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Action
                        <input name="action" required />
                      </label>
                      <label>
                        Resource
                        <input name="resource" required />
                      </label>
                      <label>
                        Country
                        <input name="country" required pattern="[A-Za-z]{2}" />
                      </label>
                      <label>
                        Currency
                        <input
                          name="currency"
                          required
                          defaultValue="EUR"
                          pattern="[A-Za-z]{3}"
                        />
                      </label>
                      <label>
                        Amount, minor units
                        <input
                          name="amount"
                          type="number"
                          min="0"
                          step="1"
                          required
                        />
                      </label>
                      <button disabled={busy} className="public-button">
                        Evaluate authority
                      </button>
                    </form>
                    {result !== null && (
                      <pre className="enterprise-output" role="status">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    )}
                  </section>
                )}
                <p>
                  <a href="/intelligence">
                    Open Intelligence Control for policies, capabilities and
                    step traces →
                  </a>
                </p>
                <Governance key={selected} org={selected} role={detail.role} />
                <section>
                  <h2>Integrate and verify</h2>
                  <p>
                    <a href="/enterprise-protocol.md">
                      Organisation and authority API reference ↗
                    </a>
                    . Issuance records prove what Fisemarco recorded, not verified
                    legal delegation. Their short-lived credential envelope is
                    not a reusable execution permit.
                  </p>
                </section>
                {detail.role === "owner" && (
                  <section>
                    <h2>Delete organisation</h2>
                    <p>
                      This removes memberships, invitations, assignments and
                      grants. Individual passports remain with their owners. All
                      removed authority chains stop resolving.
                    </p>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (
                          prompt(
                            "Type the organisation ID to permanently delete it:\n" +
                              selected,
                          ) !== selected
                        )
                          return;
                        setBusy(true);
                        try {
                          await request(base, { confirm: selected }, "DELETE");
                          setSelected("");
                          setDetail(null);
                          await refresh();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Delete this organisation
                    </button>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </PublicShell>
  );
}
