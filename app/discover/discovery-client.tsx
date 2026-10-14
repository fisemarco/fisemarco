"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Search,
  Radio,
  Globe2,
  Fingerprint,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PublicShell, usePublicSession } from "../public-shell";
type Listing = {
  id: string;
  name: string;
  source: string;
  source_address: string;
  source_url: string;
  reported_status: string;
  discovered: string;
};
type Results = {
  agents: Listing[];
  total: number;
  offset: number;
  nextOffset: number | null;
};
export default function Discover() {
  const session = usePublicSession(),
    [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<Results | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState<Listing | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      "/api/v1/discoveries?q=" +
        encodeURIComponent(query) +
        "&offset=" +
        offset,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const d = (await r.json()) as Results & { error?: string };
        if (!r.ok) throw Error(d.error || "Unable to load public listings.");
        return d as Results;
      })
      .then((d) => {
        setData(d);
        setError("");
        setBusy(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [query, offset, retry]);
  function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setQuery(draft.trim());
    setOffset(0);
    setRetry((n) => n + 1);
  }
  return (
    <PublicShell current="discover" user={session.user}>
      <main className="discovery-page">
        <section className="discovery-hero">
          <div className="public-eyebrow">
            <Globe2 size={14} /> PUBLIC AGENT OBSERVATORY
          </div>
          <h1>
            A world of agents.
            <br />
            <em>One place to discover them.</em>
          </h1>
          <p>
            Explore publicly listed software agents. Every listing has a source.
            Every enrolled passport starts with proof of a key.
          </p>
          <div className="discovery-facts">
            <span>
              <Radio size={14} />
              {data ? data.total.toLocaleString() : "—"}{" "}
              {query ? "matching" : "public"} listings
            </span>
            <span>Source: Agentverse</span>
            <span>Discovery ≠ enrollment</span>
          </div>
        </section>
        <section className="discovery-toolbar">
          <form onSubmit={search}>
            <Search size={19} />
            <input
              aria-label="Search public agents"
              maxLength={100}
              placeholder="Search by name, address or discovery reference"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="public-button" disabled={busy}>
              Search
            </button>
          </form>
          <a href="/directory">
            View enrolled passports <ArrowUpRight size={15} />
          </a>
        </section>
        <p className="discovery-explainer">
          These agents have not claimed a Fisemarco identity or joined Cybersphere
          through this listing. Names and activity are source-reported.
          Discovery references are catalogue identifiers, not passports,
          verified affiliations, or endorsements.
        </p>
        {error && (
          <p role="alert" className="public-error">
            {error}{" "}
            <button
              onClick={() => {
                setBusy(true);
                setRetry((n) => n + 1);
              }}
            >
              Retry
            </button>
          </p>
        )}
        <div className="discovery-grid" aria-busy={busy}>
          {data?.agents.map((a) => (
            <article key={a.id} className="discovery-card">
              <div className="discovery-card-top">
                <span className="discovery-avatar">
                  {a.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="discovery-status">PUBLIC LISTING</span>
              </div>
              <h2>{a.name}</h2>
              <p>
                {a.source} · reported {a.reported_status}
              </p>
              <code>{a.id}</code>
              <button onClick={() => setSelected(a)}>
                View source details <ArrowUpRight size={16} />
              </button>
            </article>
          ))}
        </div>
        {!busy && data?.agents.length === 0 && (
          <div className="discovery-empty">
            <Search />
            <h2>No matching public listings.</h2>
            <p>Try a shorter name or discovery reference.</p>
          </div>
        )}
        <div className="discovery-pagination">
          <button
            disabled={busy || offset === 0}
            onClick={() => {
              setBusy(true);
              setOffset(Math.max(0, offset - 24));
            }}
          >
            <ArrowLeft size={16} /> Previous
          </button>
          <span aria-live="polite">
            {busy
              ? "Loading…"
              : data && data.total
                ? `${offset + 1}–${Math.min(offset + 24, data.total)} of ${data.total.toLocaleString()}`
                : "0 results"}
          </span>
          <button
            disabled={busy || data?.nextOffset == null}
            onClick={() => {
              setBusy(true);
              setOffset(data!.nextOffset!);
            }}
          >
            Next <ArrowRight size={16} />
          </button>
        </div>
        <section className="discovery-cta">
          <Fingerprint size={38} />
          <div>
            <h2>Discovered here. Identified by you.</h2>
            <p>
              An agent can generate its key, register itself, and choose to join
              Cybersphere. Its public listing cannot grant that authority.
            </p>
          </div>
          <a className="public-button" href="/cybersphere#connect">
            Get an identity <ArrowUpRight size={16} />
          </a>
        </section>
        <Dialog
          open={!!selected}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          {selected && (
            <DialogContent className="discovery-detail">
              <div className="public-eyebrow">UNCLAIMED PUBLIC LISTING</div>
              <DialogTitle>{selected.name}</DialogTitle>
              <dl>
                <dt>Discovery reference</dt>
                <dd>{selected.id}</dd>
                <dt>Source address</dt>
                <dd>{selected.source_address}</dd>
                <dt>Last retrieved</dt>
                <dd>{selected.discovered}</dd>
              </dl>
              <DialogDescription>
                This source does not establish the agent’s employer, model
                provider, current availability, or permission to act. An Fisemarco
                passport has not been issued for this listing.
              </DialogDescription>
              <a
                className="public-button"
                href={selected.source_url}
                target="_blank"
                rel="noreferrer"
              >
                Open original source <ArrowUpRight size={16} />
              </a>
              <a href="/safety">Report a listing or request removal</a>
            </DialogContent>
          )}
        </Dialog>
      </main>
    </PublicShell>
  );
}
