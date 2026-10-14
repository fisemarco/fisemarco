"use client";
import { useEffect, useRef, useState } from "react";
import { PublicShell, usePublicSession, signIn } from "../public-shell";
import {
  policySchema,
  routes,
  type IntelligencePolicy,
  type Capability,
} from "@/lib/intelligence-engine";
type Org = { id: string; name: string; role: string };
type Policy = { version: number; document: IntelligencePolicy };
type Trace = {
  id: string;
  created: string;
  step_id: string;
  route: string;
  state: string;
  mode: string;
  decision: { recommended_route: string; reason_codes: string[] };
  report: {
    latencyMs: number;
    cost: number | null;
    success: boolean;
    evaluationScore: number | null;
  } | null;
};
type Metrics = {
  steps: number;
  completed: number;
  externalCalls: number | null;
  cost: number | null;
  costReports: number;
  contextTotal: number | null;
  retries: number;
  noLLMPercent: number | null;
  cloudDependency: number | null;
  frontierDependency: number | null;
  contextKeptLocalPercent: number | null;
  estimatedSavings: number | null;
  notice: string;
  mix: {
    route: string;
    total: number;
    completed: number;
    succeeded: number;
    failed: number;
    percent: number | null;
    successRate: number | null;
    evaluationScore: number | null;
    latencyMs: number | null;
    humanCorrections: number;
  }[];
};
const initialCapability = {
  id: "lead.score",
  description: "Score a prospect using an evaluated ruleset",
  taskTypes: ["classification"],
  aliases: ["score lead", "qualify prospect"],
  quality: 0.98,
  permissions: ["sales.read"],
  risk: "low",
  method: "lead.score",
  inputSchema: { type: "object", required: ["account"] },
  outputSchema: { type: "number" },
  source: "Internal evaluated ruleset",
  expectedVersion: 0,
};
const pct = (v: number | null | undefined) =>
  v == null ? "—" : v.toFixed(1) + "%";
async function call<T>(org: string, action: string, body?: unknown) {
  const r = await fetch(
    "/api/v1/intelligence/" +
      action +
      (action.includes("?") ? "&" : "?") +
      "organisation=" +
      encodeURIComponent(org),
    {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const d = (await r.json()) as { error?: string };
  if (!r.ok) throw new Error(d.error ?? "Request failed.");
  return d as T;
}
export default function Workspace() {
  const session = usePublicSession(),
    [orgs, setOrgs] = useState<Org[]>([]),
    [org, setOrg] = useState(""),
    [tab, setTab] = useState("Overview"),
    [policy, setPolicy] = useState<Policy | null>(null),
    [metrics, setMetrics] = useState<Metrics | null>(null),
    [traces, setTraces] = useState<Trace[]>([]),
    [next, setNext] = useState<string | null>(null),
    [caps, setCaps] = useState<Capability[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [models, setModels] = useState("[]"),
    [tools, setTools] = useState(""),
    [capText, setCapText] = useState(
      JSON.stringify(initialCapability, null, 2),
    ),
    [patterns, setPatterns] = useState<
      {
        pattern: string;
        samples: number;
        score: number;
        latencyMs: number;
        cost: number | null;
      }[]
    >([]),
    [history, setHistory] = useState<
      { version: number; document: string; created: string }[]
    >([]),
    [loaded, setLoaded] = useState(false),
    [capHistory, setCapHistory] = useState<
      Record<string, (Capability & { created: string; evidence: unknown })[]>
    >({}),
    [traceDetail, setTraceDetail] = useState<unknown>(null);
  const current = useRef(org);
  current.current = org;
  const editable = ["owner", "admin"].includes(
    orgs.find((o) => o.id === org)?.role ?? "",
  );
  useEffect(() => {
    if (session.user)
      fetch("/api/v1/organisations")
        .then(async (r) => {
          if (!r.ok) throw Error("Organisations could not be loaded.");
          const d = (await r.json()) as { organisations: Org[] };
          setOrgs(d.organisations);
          setLoaded(true);
          if (d.organisations[0]) setOrg(d.organisations[0].id);
        })
        .catch((e) => setError(e.message));
  }, [session.user]);
  async function refresh(target = org) {
    const [p, m, t, c, h, candidates] = await Promise.all([
      call<Policy>(target, "policy"),
      call<Metrics>(target, "metrics"),
      call<{ items: Trace[]; next: string | null }>(target, "executions"),
      call<{ capabilities: Capability[] }>(target, "capabilities"),
      call<{ policies: typeof history }>(target, "history"),
      call<{ patterns: typeof patterns }>(target, "candidates"),
    ]);
    if (current.current !== target) return;
    setPolicy(p);
    setModels(JSON.stringify(p.document.models, null, 2));
    setTools(p.document.allowedTools.join("\n"));
    setMetrics(m);
    setTraces(t.items);
    setNext(t.next);
    setCaps(c.capabilities);
    setHistory(h.policies);
    setPatterns(candidates.patterns);
  }
  useEffect(() => {
    setPolicy(null);
    setMetrics(null);
    setTraces([]);
    setCaps([]);
    setCapHistory({});
    setError("");
    setNotice("");
    setTraceDetail(null);
    if (org)
      refresh(org).catch((e) => current.current === org && setError(e.message));
  }, [org]);
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }
  if (session.loading)
    return (
      <PublicShell>
        <main className="icp-workspace">
          <p role="status">Checking your session…</p>
        </main>
      </PublicShell>
    );
  if (!session.user)
    return (
      <PublicShell signInTarget="/intelligence">
        <main className="icp-workspace">
          <span className="public-eyebrow">Fisemarco / INTELLIGENCE CONTROL</span>
          <h1>Your organisation’s intelligence, under control.</h1>
          <p>
            Sign in to configure routing policies, evaluate capabilities and see
            real execution metrics. Public examples are available without an
            account.
          </p>
          {session.error && <p role="alert">{session.error}</p>}
          <a className="public-button" href={signIn("/intelligence")}>
            Sign in / create account ↗
          </a>{" "}
          <a href="/intelligence-control-plane">Explore the product →</a>
        </main>
      </PublicShell>
    );
  return (
    <PublicShell current="intelligence" user={session.user}>
      <main className="icp-workspace">
        <span className="public-eyebrow">Fisemarco / ORGANISATION INTELLIGENCE</span>
        <h1>Every step. The right intelligence.</h1>
        <p>
          Policy-bound routing with private runtime execution.{" "}
          <a href="/sdk/intelligence-guide.md">Connect your runtime →</a>
        </p>
        <label>
          Organisation
          <select value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">Select an organisation</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.role}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div role="alert" className="icp-notice icp-error">
            {error}{" "}
            <button disabled={busy} onClick={() => work(() => refresh())}>
              Retry loading
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="icp-notice">
            {notice}
          </p>
        )}
        {loaded && !orgs.length && (
          <div className="icp-notice">
            <h2>Start with your organisation</h2>
            <p>
              Create an organisation, register a runtime and assign its
              passport. Configure a bounded grant before enabling execution.
            </p>
            <a className="public-button" href="/enterprise">
              Open organisation setup ↗
            </a>{" "}
            · <a href="/connect">Runtime setup</a>
          </div>
        )}
        {org && !policy && !error && (
          <p role="status">Loading intelligence controls…</p>
        )}
        {policy && (
          <>
            <div
              className="icp-tabs"
              role="group"
              aria-label="Intelligence views"
            >
              {["Overview", "Policy", "Capabilities", "Traces"].map((t) => (
                <button
                  aria-pressed={tab === t}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
              <button disabled={busy} onClick={() => work(() => refresh())}>
                Refresh
              </button>
            </div>
            {tab === "Overview" && metrics && (
              <>
                <div className="icp-notice">
                  Mode: <strong>{policy.document.mode}</strong> · Policy version{" "}
                  {policy.version} · All-time metrics are runtime-reported. Cost
                  currency: USD.
                </div>
                <div className="icp-stat-grid">
                  {[
                    ["Completed executions", metrics.completed],
                    ["No-LLM execution", pct(metrics.noLLMPercent)],
                    ["Cloud dependency", pct(metrics.cloudDependency)],
                    ["Frontier dependency", pct(metrics.frontierDependency)],
                    [
                      "Context kept local",
                      pct(metrics.contextKeptLocalPercent),
                    ],
                    [
                      "Reported cost",
                      metrics.cost === null
                        ? "Unknown"
                        : "$" + metrics.cost.toFixed(4),
                    ],
                    [
                      "Estimated savings",
                      metrics.estimatedSavings === null
                        ? "Unavailable"
                        : "$" + metrics.estimatedSavings.toFixed(4),
                    ],
                    ["Retry / escalation traces", metrics.retries],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <small>{label}</small>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <h2>Intelligence Mix</h2>
                {!metrics.completed ? (
                  <p>
                    No completed executions yet.{" "}
                    <a href="/sdk/intelligence-guide.md">Connect a runtime</a>{" "}
                    to begin recording real steps. The public example does not
                    add data here.
                  </p>
                ) : (
                  routes.map((r) => {
                    const m = metrics.mix.find((m) => m.route === r);
                    return (
                      <div className="icp-mix-row" key={r}>
                        <span>{r}</span>
                        <meter
                          min={0}
                          max={100}
                          value={m?.percent ?? 0}
                          aria-label={r + " execution percentage"}
                        />
                        <strong>{pct(m?.percent ?? 0)}</strong>
                      </div>
                    );
                  })
                )}
                <h2>Quality by route</h2>
                <div className="icp-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Route</th>
                        <th>Completed</th>
                        <th>Success</th>
                        <th>Failures / expired</th>
                        <th>Evaluation</th>
                        <th>Average latency</th>
                        <th>Human corrections</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.mix.map((m) => (
                        <tr key={m.route}>
                          <td>{m.route}</td>
                          <td>{m.completed}</td>
                          <td>{pct(m.successRate)}</td>
                          <td>{m.failed}</td>
                          <td>
                            {m.evaluationScore === null
                              ? "—"
                              : (m.evaluationScore * 100).toFixed(1) + "%"}
                          </td>
                          <td>
                            {m.latencyMs === null
                              ? "—"
                              : Math.round(m.latencyMs) + " ms"}
                          </td>
                          <td>{m.humanCorrections}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>{metrics.notice}</p>
                <p>
                  {metrics.steps} resolved steps · {metrics.costReports} cost
                  reports. Successful transport is not independent proof of task
                  correctness.
                </p>
              </>
            )}
            {tab === "Policy" && (
              <>
                <h2>Routing policy</h2>
                <p>
                  Edits create a new version. Existing resolved steps stop when
                  their policy changes. Restore a previous document as a new
                  version. Define model quality from your evaluations, not
                  vendor claims. Provider URLs and keys stay in your runtime.
                </p>
                {!editable && (
                  <p className="icp-notice">
                    Your role can view this policy. An owner or administrator
                    can change it.
                  </p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    work(async () => {
                      const document = policySchema.parse({
                        ...policy.document,
                        mode: form.get("mode"),
                        allowedRoutes: form.getAll("allowedRoute"),
                        localOnly: form.get("localOnly") === "on",
                        sensitiveLocalOnly:
                          form.get("sensitiveLocalOnly") === "on",
                        minimumQuality: Number(form.get("quality")),
                        regions: String(form.get("regions"))
                          .split(",")
                          .map((s) => s.trim().toUpperCase())
                          .filter(Boolean),
                        humanActions: String(form.get("humanActions"))
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                        allowedTools: tools
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                        models: JSON.parse(models),
                        baselineCostPerStep: form.get("baselineCost")
                          ? Number(form.get("baselineCost"))
                          : null,
                        baselineModel:
                          String(form.get("baselineModel") || "") || null,
                      });
                      await call(org, "policy", {
                        expectedVersion: policy.version,
                        document,
                      });
                      await refresh();
                      setNotice("A new routing policy version is active.");
                    });
                  }}
                >
                  <fieldset
                    disabled={!editable || busy}
                    style={{ border: 0, padding: 0 }}
                  >
                    <div className="icp-form-grid">
                      <label>
                        Execution mode
                        <select
                          name="mode"
                          defaultValue={policy.document.mode}
                          key={policy.version + "mode"}
                        >
                          {["observe", "shadow", "enforce"].map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Minimum evaluated quality (0–1)
                        <input
                          name="quality"
                          type="number"
                          min="0"
                          max="1"
                          step=".01"
                          defaultValue={policy.document.minimumQuality}
                          key={policy.version + "quality"}
                          required
                        />
                      </label>
                    </div>
                    <label>
                      <input
                        name="localOnly"
                        type="checkbox"
                        defaultChecked={policy.document.localOnly}
                        key={policy.version + "local"}
                      />
                      All model execution must stay local or within approved
                      private infrastructure
                    </label>
                    <label>
                      <input
                        name="sensitiveLocalOnly"
                        type="checkbox"
                        defaultChecked={policy.document.sensitiveLocalOnly}
                        key={policy.version + "pii"}
                      />
                      Personal and restricted data cannot go to external
                      providers
                    </label>
                    <label>
                      Approved processing countries (ISO codes, comma separated;
                      empty means no restriction)
                      <input
                        name="regions"
                        defaultValue={policy.document.regions.join(", ")}
                        key={policy.version + "regions"}
                      />
                    </label>
                    <label>
                      Actions requiring a human (comma separated; transfers,
                      termination and deletion always escalate)
                      <input
                        name="humanActions"
                        defaultValue={policy.document.humanActions.join(", ")}
                        key={policy.version + "human"}
                      />
                    </label>
                    <div>
                      <h3>Allowed execution routes</h3>
                      {routes.map((route) => (
                        <label key={policy.version + route}>
                          <input
                            type="checkbox"
                            name="allowedRoute"
                            value={route}
                            defaultChecked={policy.document.allowedRoutes.includes(
                              route,
                            )}
                          />
                          {route}
                        </label>
                      ))}
                    </div>
                    <label>
                      Approved tool IDs, one per line
                      <textarea
                        value={tools}
                        onChange={(e) => setTools(e.target.value)}
                        placeholder="crm.lookup"
                      />
                    </label>
                    <label>
                      Approved model metadata (JSON)
                      <textarea
                        rows={12}
                        value={models}
                        onChange={(e) => setModels(e.target.value)}
                        spellCheck={false}
                      />
                    </label>
                    <details>
                      <summary>Model configuration example</summary>
                      <pre>
                        {JSON.stringify(
                          [
                            {
                              id: "local-writer",
                              provider: "ollama",
                              tier: "local",
                              quality: 0.98,
                              taskTypes: ["generation", "classification"],
                              region: "FI",
                              external: false,
                              estimatedCost: null,
                              estimatedLatencyMs: null,
                            },
                          ],
                          null,
                          2,
                        )}
                      </pre>
                      <p>
                        Register only evaluated models you can run. The SDK
                        skips models without a configured adapter. Local routes
                        require a per-task confidence value at or above the
                        quality threshold.
                      </p>
                    </details>
                    <div className="icp-form-grid">
                      <label>
                        Baseline model ID (optional)
                        <input
                          name="baselineModel"
                          defaultValue={policy.document.baselineModel ?? ""}
                          key={policy.version + "baseline"}
                        />
                      </label>
                      <label>
                        Estimated baseline cost per completed step (USD;
                        optional)
                        <input
                          name="baselineCost"
                          type="number"
                          min="0"
                          max="100"
                          step=".000001"
                          defaultValue={
                            policy.document.baselineCostPerStep ?? ""
                          }
                          key={policy.version + "cost"}
                        />
                      </label>
                    </div>
                    <button className="icp-primary" disabled={busy}>
                      Save new policy version
                    </button>
                  </fieldset>
                </form>
                <h2>Version history</h2>
                {history.map((h) => (
                  <details key={h.version}>
                    <summary>
                      Version {h.version} ·{" "}
                      {new Date(h.created).toLocaleDateString()}
                    </summary>
                    <pre>{JSON.stringify(JSON.parse(h.document), null, 2)}</pre>
                    {editable && h.version !== policy.version && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          work(async () => {
                            await call(org, "policy", {
                              expectedVersion: policy.version,
                              document: JSON.parse(h.document),
                            });
                            await refresh();
                            setNotice(
                              "Previous policy restored as a new version.",
                            );
                          })
                        }
                      >
                        Restore as new version
                      </button>
                    )}
                  </details>
                ))}
              </>
            )}
            {tab === "Capabilities" && (
              <>
                <h2>Versioned reusable intelligence</h2>
                <p>
                  Register an implemented local handler, evaluate it on a
                  dataset including safety cases, and record an administrator
                  review. Registration creates a candidate. Fisemarco does not turn
                  model output into trusted code.
                </p>
                <h3>Repeated model patterns</h3>
                {patterns.length ? (
                  patterns.map((p) => (
                    <div className="icp-notice" key={p.pattern}>
                      <strong>{p.pattern}</strong> · {p.samples} successful
                      evaluated reports · mean score{" "}
                      {(p.score * 100).toFixed(1)}%{" "}
                      <button
                        disabled={!editable}
                        onClick={() => {
                          setCapText(
                            JSON.stringify(
                              {
                                ...initialCapability,
                                id: p.pattern,
                                source:
                                  "Repeated runtime pattern: " + p.pattern,
                              },
                              null,
                              2,
                            ),
                          );
                          setNotice(
                            "Candidate form prepared. Implement and evaluate the handler before review.",
                          );
                        }}
                      >
                        Prepare candidate
                      </button>
                    </div>
                  ))
                ) : (
                  <p>
                    No recurring model pattern has three successful reports
                    scoring at least 95% yet.
                  </p>
                )}
                {editable && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      work(async () => {
                        await call(org, "capabilities", JSON.parse(capText));
                        await refresh();
                        setNotice(
                          "Candidate version registered. Complete evaluation before promotion.",
                        );
                      });
                    }}
                  >
                    <label>
                      Capability definition (JSON)
                      <textarea
                        value={capText}
                        onChange={(e) => setCapText(e.target.value)}
                        rows={15}
                        spellCheck={false}
                      />
                    </label>
                    <button disabled={busy} className="icp-primary">
                      Register candidate version
                    </button>
                  </form>
                )}
                {caps.map((c) => (
                  <details key={c.id}>
                    <summary>
                      {c.id} · v{c.version} · {c.status}
                    </summary>
                    <p>{c.description}</p>
                    <pre>{JSON.stringify(c, null, 2)}</pre>
                    <button
                      disabled={busy}
                      onClick={() =>
                        work(async () => {
                          const h = await call<{
                            versions: (Capability & {
                              created: string;
                              evidence: unknown;
                            })[];
                          }>(
                            org,
                            "capability-history?id=" + encodeURIComponent(c.id),
                          );
                          setCapHistory((v) => ({ ...v, [c.id]: h.versions }));
                        })
                      }
                    >
                      Load version history
                    </button>
                    {capHistory[c.id]?.map((v) => (
                      <details key={v.version}>
                        <summary>
                          Version {v.version} · {v.status}
                        </summary>
                        <pre>{JSON.stringify(v, null, 2)}</pre>
                        {editable && v.version !== c.version && (
                          <button
                            onClick={() => {
                              const {
                                status,
                                version,
                                created,
                                evidence,
                                ...definition
                              } = v;
                              void status;
                              void version;
                              void created;
                              void evidence;
                              setCapText(
                                JSON.stringify(
                                  { ...definition, expectedVersion: c.version },
                                  null,
                                  2,
                                ),
                              );
                              setNotice(
                                "Previous definition prepared as a new candidate. Re-evaluate before promotion.",
                              );
                            }}
                          >
                            Prepare previous definition as new version
                          </button>
                        )}
                      </details>
                    ))}

                    {editable && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const { status, version, evidence, ...definition } =
                              c as Capability & { evidence?: unknown };
                            void status;
                            void evidence;
                            setCapText(
                              JSON.stringify(
                                { ...definition, expectedVersion: version },
                                null,
                                2,
                              ),
                            );
                            setNotice(
                              "Edit the definition above to register a new candidate version.",
                            );
                          }}
                        >
                          Prepare next version
                        </button>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            work(async () => {
                              await call(org, "review", {
                                id: c.id,
                                version: c.version,
                                status: "withdrawn",
                                notes: f.get("withdrawReason"),
                              });
                              await refresh();
                              setNotice("Capability version withdrawn.");
                            });
                          }}
                        >
                          <label>
                            Withdrawal reason
                            <textarea
                              name="withdrawReason"
                              minLength={10}
                              maxLength={1000}
                              required
                            />
                          </label>
                          <button disabled={busy || c.status === "withdrawn"}>
                            Withdraw this version
                          </button>
                        </form>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            work(async () => {
                              await call(org, "review", {
                                id: c.id,
                                version: c.version,
                                status: f.get("status"),
                                datasetHash: f.get("datasetHash"),
                                samples: Number(f.get("samples")),
                                score: Number(f.get("score")),
                                safetyPassed: f.get("safety") === "on",
                                notes: f.get("notes"),
                              });
                              await refresh();
                              setNotice("Capability review recorded.");
                            });
                          }}
                        >
                          <label>
                            Review decision
                            <select name="status">
                              <option value="validated">
                                Promote evaluated version
                              </option>
                            </select>
                          </label>
                          <label>
                            Evaluation dataset SHA-256
                            <input
                              name="datasetHash"
                              pattern="[a-f0-9]{64}"
                              required
                            />
                          </label>
                          <div className="icp-form-grid">
                            <label>
                              Evaluation samples
                              <input
                                name="samples"
                                type="number"
                                min="3"
                                max="1000000"
                                required
                              />
                            </label>
                            <label>
                              Measured score (0–1)
                              <input
                                name="score"
                                type="number"
                                min="0"
                                max="1"
                                step=".001"
                                required
                              />
                            </label>
                          </div>
                          <label>
                            <input name="safety" type="checkbox" required />I
                            reviewed the safety tests and evidence
                          </label>
                          <label>
                            Review notes
                            <textarea
                              name="notes"
                              minLength={10}
                              maxLength={1000}
                              required
                            />
                          </label>
                          <button disabled={busy}>
                            Record administrator review
                          </button>
                        </form>
                      </>
                    )}
                  </details>
                ))}
              </>
            )}
            {tab === "Traces" && (
              <>
                <h2>Step execution traces</h2>
                <p>
                  Inspect route recommendations, actual routes and reported
                  outcomes. Raw inputs, outputs and hidden model reasoning are
                  excluded.
                </p>
                {!traces.length && (
                  <p>
                    No executions yet.{" "}
                    <a href="/sdk/intelligence-guide.md">
                      Start with the runtime guide.
                    </a>
                  </p>
                )}
                <div className="icp-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Mode</th>
                        <th>Actual route</th>
                        <th>Recommended</th>
                        <th>State</th>
                        <th>Latency</th>
                        <th>Trace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traces.map((t) => (
                        <tr key={t.id}>
                          <td>{t.step_id}</td>
                          <td>{t.mode}</td>
                          <td>{t.route}</td>
                          <td>{t.decision.recommended_route}</td>
                          <td>{t.state}</td>
                          <td>
                            {t.report
                              ? Math.round(t.report.latencyMs) + " ms"
                              : "—"}
                          </td>
                          <td>
                            <button
                              disabled={busy}
                              onClick={() =>
                                work(async () =>
                                  setTraceDetail(
                                    await call(org, "executions/" + t.id),
                                  ),
                                )
                              }
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {next && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      work(async () => {
                        const d = await call<{
                          items: Trace[];
                          next: string | null;
                        }>(org, "executions?after=" + encodeURIComponent(next));
                        setTraces((v) => [...v, ...d.items]);
                        setNext(d.next);
                      })
                    }
                  >
                    Load older traces
                  </button>
                )}
                {traceDetail !== null && (
                  <>
                    <h3>Execution detail</h3>
                    <pre>{JSON.stringify(traceDetail, null, 2)}</pre>
                    <button onClick={() => setTraceDetail(null)}>
                      Close detail
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </PublicShell>
  );
}
