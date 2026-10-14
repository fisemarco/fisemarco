"use client";
import { useEffect, useState } from "react";
import { PublicShell, usePublicSession, signIn } from "../public-shell";
type Space = { id: string; name: string; expires: string; constraints: string };
type Detail = {
  agents: { code: string; name: string; revoked: number }[];
  permits: { id: string; agent: string; state: string; expires: string }[];
};
async function api<T>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<T> {
  const r = await fetch("/api/v1/testnet/spaces" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(d.error || "Testnet is unavailable.");
  return d;
}
export default function Testnet() {
  const session = usePublicSession();
  const [spaces, setSpaces] = useState<Space[]>([]),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [key, setKey] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState("");
  async function refresh() {
    setSpaces((await api<{ spaces: Space[] }>("")).spaces);
  }
  useEffect(() => {
    if (session.user) void refresh().catch((e) => setError(e.message));
  }, [session.user]);
  useEffect(() => {
    setDetail(null);
    setConfirm("");
    if (!selected) return;
    let active = true;
    api<Detail>("/" + selected)
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
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicShell user={session.user}>
      <main className="enterprise-page">
        <header>
          <span className="public-eyebrow">Fisemarco / TESTNET</span>
          <h1>
            Test the boundary.
            <br />
            <em>Before it matters.</em>
          </h1>
          <p>
            Exercise signed enrollment, bounded authority, one-use permits and
            revocation. Test identities live in separate tables, use Fisemarco-TEST
            codes and cannot enter the production registry or Cybersphere.
          </p>
        </header>
        <p>
          Use synthetic data only. Access expires after seven days; records
          remain until you delete the space. This sandbox covers the four
          primitives above; use the local conformance suite for the complete
          production API.
        </p>
        <p>
          <a href="/testnet-protocol.md">Protocol and test instructions</a> ·{" "}
          <a href="/sdk/testnet.mjs" download>
            Download testnet SDK
          </a>{" "}
          · <a href="/developers">All SDKs</a>
        </p>
        {(error || session.error) && (
          <p className="public-error" role="alert">
            {error || session.error}
          </p>
        )}
        {session.loading ? (
          <p>Checking your session…</p>
        ) : !session.user ? (
          <a className="public-button" href={signIn("/testnet")}>
            Sign in to create a test space
          </a>
        ) : (
          <>
            <form
              className="enterprise-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  const space = await api<{ id: string; key: string }>("", {
                    name: f.get("name"),
                    constraints: {
                      actions: [String(f.get("action"))],
                      resources: [String(f.get("resource"))],
                      countries: [String(f.get("country")).toUpperCase()],
                      currency: String(f.get("currency")).toUpperCase(),
                      maxAmountMinor: Number(f.get("max")),
                      approvalAboveMinor: Number(f.get("max")),
                      mayDelegate: false,
                    },
                  });
                  setKey(space.key);
                  setSelected(space.id);
                });
              }}
            >
              <h2>Create a test space</h2>
              <label>
                Space name
                <input name="name" required minLength={2} maxLength={100} />
              </label>
              <label>
                Allowed action
                <input name="action" defaultValue="document.read" required />
              </label>
              <label>
                Allowed resource
                <input
                  name="resource"
                  defaultValue="test-document:1"
                  required
                />
              </label>
              <label>
                Country
                <input
                  name="country"
                  defaultValue="FI"
                  pattern="[A-Za-z]{2}"
                  required
                />
              </label>
              <label>
                Currency
                <input
                  name="currency"
                  defaultValue="EUR"
                  pattern="[A-Za-z]{3}"
                  required
                />
              </label>
              <label>
                Maximum per action, minor units
                <input
                  type="number"
                  min="0"
                  max="1000000000000"
                  step="1"
                  name="max"
                  defaultValue="0"
                  required
                />
              </label>
              <button disabled={busy} className="public-button">
                Create test space
              </button>
            </form>
            {key && (
              <section role="status">
                <h2>Enrollment key · shown once</h2>
                <p>
                  Keep this key private. It admits up to 20 test agents into
                  this space.
                </p>
                <code className="enterprise-output">{key}</code>
                <button onClick={() => setKey("")}>Hide key</button>
              </section>
            )}
            <section>
              <h2>Your test spaces</h2>
              <label>
                Space
                <select
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setKey("");
                  }}
                >
                  <option value="">Select a space</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · expires{" "}
                      {new Date(s.expires).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <p>
                  Space ID: <code>{selected}</code>
                </p>
              )}
              {detail && (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(async () =>
                        setDetail(await api<Detail>("/" + selected)),
                      )
                    }
                  >
                    Refresh activity
                  </button>
                  <h3>Test identities</h3>
                  {!detail.agents.length && (
                    <p>
                      No agents enrolled. Connect the testnet SDK using your
                      enrollment key.
                    </p>
                  )}
                  <ul className="governance-list">
                    {detail.agents.map((a) => (
                      <li key={a.code}>
                        <strong>{a.name}</strong>
                        <p>
                          {a.code} · {a.revoked ? "Revoked" : "Active"}
                        </p>
                        {!a.revoked && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                await api("/" + selected + "/revoke", {
                                  agent: a.code,
                                });
                                setDetail(await api<Detail>("/" + selected));
                              })
                            }
                          >
                            Revoke test identity
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <h3>Latest test permits</h3>
                  <div className="enterprise-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Task</th>
                          <th>State</th>
                          <th>Expires</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.permits.map((p) => (
                          <tr key={p.id}>
                            <td>{p.id}</td>
                            <td>{p.state}</td>
                            <td>{new Date(p.expires).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act(async () => {
                        await api("/" + selected, { confirm }, "DELETE");
                        setSelected("");
                        setDetail(null);
                        setKey("");
                      });
                    }}
                  >
                    <h3>Delete test space</h3>
                    <p>Removes every test identity and permit in this space.</p>
                    <label>
                      Type the space ID
                      <input
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                      />
                    </label>
                    <button disabled={busy || confirm !== selected}>
                      Delete test data
                    </button>
                  </form>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </PublicShell>
  );
}
