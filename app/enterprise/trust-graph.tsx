"use client";
import { useEffect, useState, useRef } from "react";
import type { GraphNode, GraphEdge } from "@/lib/trust-graph";
import { mergeGraph, neighbourhood } from "@/lib/graph-traversal";
type Page = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  next: string | null;
  receipt: string;
  observedAt: string;
};
const kinds = [
  "agents",
  "members",
  "grants",
  "approvals",
  "permits",
  "records",
  "events",
  "attestations",
  "controls",
  "certificates",
  "workloads",
  "connections",
];
export default function TrustGraph({ org }: { org: string }) {
  const pendingRequest = useRef<AbortController | null>(null);
  const [depth, setDepth] = useState(1),
    [complete, setComplete] = useState(false);
  const [kind, setKind] = useState("agents"),
    [pages, setPages] = useState<Page[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState("");
  async function load(after = "") {
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    setBusy(true);
    setError("");
    setComplete(false);
    try {
      const accumulated: Page[] = [];
      for (const collection of kind === "all" ? kinds : [kind]) {
        let cursor = after;
        do {
          const r = await fetch(
            `/api/v1/organisations/${org}/graph?kind=${collection}&after=${encodeURIComponent(cursor)}`,
            { signal: controller.signal },
          );
          const d = (await r.json()) as Page & { error?: string };
          if (!r.ok) throw Error(d.error || "Unable to load graph");
          accumulated.push(d);
          setPages((previous) =>
            kind === "all" ? [...accumulated] : after ? [...previous, d] : [d],
          );
          cursor = d.next || "";
        } while (kind === "all" && cursor);
      }
      setComplete(kind === "all");
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (pendingRequest.current === controller) setBusy(false);
    }
  }
  useEffect(() => {
    setPages([]);
    setSelected("");
    void load();
    return () => pendingRequest.current?.abort();
  }, [org, kind]);
  const merged = mergeGraph(pages);
  const explored =
    selected && depth > 1
      ? neighbourhood(merged.nodes, merged.edges, selected, depth)
      : merged;
  const nodes = explored.nodes,
    edges = explored.edges;
  const chosen = nodes.find((n) => n.id === selected);
  function download() {
    const u = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              schema: "ftai-trust-graph-export/1",
              organisation: org,
              kind,
              complete,
              pages,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = "ftai-trust-graph.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  return (
    <section className="trust-graph-panel">
      <h3>Trust graph</h3>
      <p>
        Follow who assigned an agent, what authority it holds, which approvals
        it used, and the evidence behind each connection. A relationship is not
        a permission to execute.
      </p>
      <div className="graph-controls">
        <label>
          Relationship collection
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">Complete organisation graph</option>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Filter loaded nodes
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, code or node type"
          />
        </label>
        <button disabled={busy} onClick={() => void load()}>
          Refresh status
        </button>
        <button disabled={!pages.length} onClick={download}>
          Export signed pages
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading graph…</p>}
      <label>
        Traversal depth
        <select
          value={depth}
          onChange={(e) => setDepth(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      {busy && (
        <button
          onClick={() => {
            pendingRequest.current?.abort();
            setBusy(false);
            setComplete(false);
          }}
        >
          Stop loading
        </button>
      )}
      <p>
        {nodes.length} loaded nodes · {edges.length} connections ·{" "}
        {complete
          ? "All permitted collections loaded"
          : kind === "all"
            ? "Partial graph loaded"
            : pages.at(-1)?.next
              ? "More pages available"
              : "End of this collection"}
        . Referenced nodes may resolve in another collection. Private passport
        details require ownership.
      </p>
      <div className="graph-layout">
        <div className="graph-nodes" aria-label="Graph nodes">
          {nodes
            .filter((n) =>
              (n.label + " " + n.kind + " " + n.id)
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((n) => (
              <button
                className="graph-node"
                aria-pressed={selected === n.id}
                key={n.id}
                onClick={() => setSelected(n.id)}
              >
                <small>{n.kind}</small>
                <strong>{n.label}</strong>
                <span>{n.status}</span>
              </button>
            ))}
        </div>
        <div className="graph-details">
          {chosen ? (
            <>
              <h4>{chosen.label}</h4>
              <p>
                {chosen.provenance} · {chosen.status}
              </p>
              <dl>
                {Object.entries(chosen.details).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      {typeof v === "object"
                        ? JSON.stringify(v)
                        : String(v ?? "—")}
                    </dd>
                  </div>
                ))}
              </dl>
              <h4>Connections</h4>
              {edges
                .filter((e) => e.from === chosen.id || e.to === chosen.id)
                .map((e) => (
                  <article key={e.id}>
                    <p>
                      <button onClick={() => setSelected(e.from)}>
                        {nodes.find((n) => n.id === e.from)?.label || e.from}
                      </button>{" "}
                      → <strong>{e.relation}</strong> →{" "}
                      <button onClick={() => setSelected(e.to)}>
                        {nodes.find((n) => n.id === e.to)?.label || e.to}
                      </button>
                    </p>
                    <small>
                      {e.status} · {e.provenance}
                    </small>
                    {e.evidence && (
                      <details>
                        <summary>Signed evidence</summary>
                        <pre>{e.evidence}</pre>
                      </details>
                    )}
                  </article>
                ))}
            </>
          ) : (
            <p>
              Select a node to explore its incoming and outgoing relationships.
            </p>
          )}
        </div>
      </div>
      {kind !== "all" && pages.at(-1)?.next && (
        <button disabled={busy} onClick={() => void load(pages.at(-1)!.next!)}>
          Load next page
        </button>
      )}
      <p>
        <a href="/trust-graph-protocol.md">
          Schema, provenance and verification contract
        </a>
      </p>
    </section>
  );
}
