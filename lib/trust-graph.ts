import { z } from "zod";
import { db } from "./server";
import { digest } from "./crypto";
import { member, receipt, chainFor, liveChainIssue } from "./enterprise-core";

export const graphKinds = [
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
] as const;
export type GraphNode = {
  id: string;
  kind: string;
  label: string;
  status: string;
  provenance: string;
  details: Record<string, unknown>;
};
export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  provenance: string;
  status: string;
  evidence?: string;
};
// All queries constrain the organisation before pagination. No global account IDs, private keys or tokens are returned.
const sources: Record<(typeof graphKinds)[number], string> = {
  agents: `SELECT a.code id,a.name,a.status,a.profile,a.owner,o.classification,o.team,r.thumbprint,r.revoked,r.last_seen,p.id policy,p.status policy_status FROM organisation_agents o JOIN agents a ON a.code=o.agent LEFT JOIN runtime_agents r ON r.agent=a.code LEFT JOIN enrollment_policies p ON p.id=r.policy_id WHERE o.organisation=?`,
  members: `SELECT organisation||':'||user id,user principal,role,joined FROM organisation_members WHERE organisation=?`,
  grants: `SELECT id,parent,subject,constraints,expires,revoked,created,receipt FROM authority_grants WHERE organisation=?`,
  approvals: `SELECT id,agent,grant_id,input_hash,state,expires,approver,receipt FROM authority_approvals WHERE organisation=?`,
  permits: `SELECT w.id,w.agent,w.action,w.resource,w.input_hash,w.authority,w.state,w.expires,w.receipt,w.outcome_id FROM work_permits w JOIN organisation_agents o ON o.agent=w.agent JOIN agents a ON a.code=w.agent WHERE o.organisation=? AND a.owner=?`,
  records: `SELECT r.id,r.agent,r.kind,r.title,r.hash,r.previous_hash,r.sequence,r.jws FROM records r JOIN organisation_agents o ON o.agent=r.agent JOIN agents a ON a.code=r.agent WHERE o.organisation=? AND a.owner=?`,
  events: `SELECT id,agent,kind,decision,created,receipt FROM authority_events WHERE organisation=?`,
  attestations: `SELECT organisation id,credential,created FROM operator_attestations WHERE organisation=?`,
  controls: `SELECT control id,status,evidence_url,evidence_hash,updated FROM assurance_controls WHERE organisation=?`,
  workloads: `SELECT r.agent id,r.agent,r.spiffe_id,r.valid_until,r.bundle_hash,r.attested,r.proof_hash FROM runtime_attestations r JOIN organisation_agents o ON o.agent=r.agent JOIN agents a ON a.code=r.agent WHERE o.organisation=? AND a.owner=?`,
  connections: `SELECT e.source || ':' || e.target id,e.source agent,e.target,e.kind,e.created FROM sphere_edges e JOIN organisation_agents o ON o.agent=e.source JOIN sphere_members m ON m.agent=e.target JOIN agents a ON a.code=e.source WHERE o.organisation=? AND a.owner=? AND e.kind='follow'`,
  certificates: `SELECT id,agent,scheme,issued,expires,revoked,reason,credential FROM agent_certificates WHERE organisation=?`,
};
export async function trustGraph(org: string, user: string, input: unknown) {
  const membership = await member(org, user);
  const q = z
    .object({
      kind: z.enum(graphKinds).default("agents"),
      after: z.string().max(200).default(""),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    })
    .strict()
    .parse(input);
  const rows = (
    await db()
      .prepare(
        `SELECT * FROM (${sources[q.kind]}) WHERE id>? ORDER BY id LIMIT ?`,
      )
      .bind(
        org,
        ...(["records", "permits", "workloads", "connections"].includes(q.kind)
          ? [user]
          : []),
        q.after,
        q.limit + 1,
      )
      .all<Record<string, unknown>>()
  ).results;
  const more = rows.length > q.limit;
  const nodes = new Map<string, GraphNode>(),
    edges: GraphEdge[] = [];
  const root = "organisation:" + org;
  function node(
    id: string,
    kind: string,
    label: string,
    status = "referenced",
    provenance = "registry",
    details: Record<string, unknown> = {},
  ) {
    if (!nodes.has(id) || status !== "referenced")
      nodes.set(id, { id, kind, label, status, provenance, details });
    return id;
  }
  function edge(
    from: string,
    to: string,
    relation: string,
    status: string,
    provenance: string,
    evidence?: string,
  ) {
    edges.push({
      id: `${relation}:${from}:${to}`,
      from,
      to,
      relation,
      status,
      provenance,
      ...(evidence ? { evidence } : {}),
    });
  }
  node(root, "organisation", membership.organisation_name, "declared", "operator-declared");
  const person = async (id: string) =>
    node(
      "principal:" + (await digest(org + ":" + id)),
      "principal",
      "Organisation member",
      "referenced",
      "authenticated-account",
    );
  for (const r of rows.slice(0, q.limit)) {
    const id = String(r.id),
      proof = String(r.receipt || r.jws || r.credential || "");
    const agent = r.agent || (q.kind === "agents" ? id : r.subject);
    const a = agent ? node("agent:" + agent, "agent", String(agent)) : "";
    if (q.kind === "agents") {
      node(a, "agent", String(r.name), String(r.status), "operator-declared", {
        code: id,
        classification: r.classification,
        team: r.team,
        ...(r.owner === user ? { lastSeen: r.last_seen } : {}),
      });
      edge(root, a, "assigns", String(r.status), "operator-declared");
      if (r.owner === user && r.thumbprint) {
        const k = node(
          "key:" + r.thumbprint,
          "key",
          String(r.thumbprint),
          r.revoked ? "revoked" : "active",
          "proof-of-possession",
        );
        edge(
          a,
          k,
          "controls-key",
          r.revoked ? "revoked" : "active",
          "runtime-signature",
        );
      }
      if (r.owner === user && r.policy)
        edge(
          node(
            "policy:" + r.policy,
            "policy",
            String(r.policy),
            String(r.policy_status),
            "operator-declared",
          ),
          a,
          "governs",
          String(r.policy_status),
          "operator-declared",
        );
      const profile = r.owner === user ? JSON.parse(String(r.profile)) : {};
      if (profile.model)
        edge(
          a,
          node(
            "model:" +
              (await digest(profile.model + ":" + (profile.version || ""))),
            "model",
            profile.model,
            "declared",
            "operator-declared",
            { agentVersion: profile.version || "" },
          ),
          "uses-model",
          "declared",
          "operator-declared",
        );
      for (const action of profile.allowed || [])
        edge(
          a,
          node(
            "capability:" + (await digest(action)),
            "capability",
            action,
            "declared",
            "operator-declared",
          ),
          "declares-capability",
          "declared",
          "operator-declared",
        );
    } else if (q.kind === "members") {
      const p = await person(String(r.principal));
      node(p, "principal", String(r.role), "active", "authenticated-account", {
        joined: r.joined,
      });
      edge(p, root, "member:" + r.role, "active", "registry-access-control");
    } else if (q.kind === "grants") {
      let error: string | null;
      try {
        error = await liveChainIssue(await chainFor(id, org));
      } catch {
        error = "Incomplete authority chain";
      }
      const state = error ? "invalid" : "active";
      const g = node("grant:" + id, "grant", id, state, "registry-signed", {
        constraints: JSON.parse(String(r.constraints)),
        expires: r.expires,
        reason: error,
      });
      const parent = r.parent
        ? node("grant:" + r.parent, "grant", String(r.parent))
        : root;
      edge(
        parent,
        g,
        r.parent ? "delegates" : "issues-root",
        state,
        r.parent ? "registry-recorded" : "declared-root-authority",
        proof,
      );
      edge(g, a, "authorizes", state, "registry-signed", proof);
      const constraints = JSON.parse(String(r.constraints));
      for (const resource of constraints.resources)
        edge(
          g,
          node(
            "resource:" + (await digest(org + ":" + resource)),
            "resource",
            resource,
            "declared",
            "operator-declared",
          ),
          "scopes-resource",
          state,
          "declared-constraint",
        );
      for (const action of constraints.actions)
        edge(
          g,
          node(
            "capability:" + (await digest(action)),
            "capability",
            action,
            "declared",
            "operator-declared",
          ),
          "scopes-action",
          state,
          "declared-constraint",
        );
    } else if (q.kind === "approvals") {
      const state =
        Date.parse(String(r.expires)) <= Date.now() && r.state === "approved"
          ? "expired"
          : String(r.state);
      const ap = node(
        "approval:" + id,
        "approval",
        id,
        state,
        "human-decision",
        { inputHash: r.input_hash, expires: r.expires },
      );
      edge(
        node("grant:" + r.grant_id, "grant", String(r.grant_id)),
        ap,
        "requires-approval",
        state,
        "registry-recorded",
        proof,
      );
      edge(ap, a, "approves-for", state, "human-decision", proof);
      if (r.approver)
        edge(
          await person(String(r.approver)),
          ap,
          "decides",
          state,
          "authenticated-account",
          proof,
        );
    } else if (q.kind === "permits") {
      const p = node(
        "permit:" + id,
        "permit",
        String(r.action),
        String(r.state),
        "registry-signed",
        { resource: r.resource, inputHash: r.input_hash, expires: r.expires },
      );
      edge(a, p, "executes", String(r.state), "runtime-reported", proof);
      if (r.authority) {
        const binding = JSON.parse(String(r.authority));
        edge(
          node("grant:" + binding.grant, "grant", binding.grant),
          p,
          "permits",
          String(r.state),
          "registry-signed",
          proof,
        );
        if (binding.approval)
          edge(
            node("approval:" + binding.approval, "approval", binding.approval),
            p,
            "consumed-for",
            String(r.state),
            "registry-signed",
            proof,
          );
      }
      if (r.outcome_id)
        edge(
          p,
          node("record:" + r.outcome_id, "record", String(r.outcome_id)),
          "reports-outcome",
          String(r.state),
          "runtime-reported",
        );
    } else if (q.kind === "records") {
      const rec = node(
        "record:" + id,
        "record",
        String(r.title),
        "recorded",
        "registry-signed-reported-claim",
        {
          hash: r.hash,
          previousHash: r.previous_hash,
          sequence: r.sequence,
          kind: r.kind,
        },
      );
      edge(
        a,
        rec,
        "records",
        "recorded",
        "registry-signed-reported-claim",
        proof,
      );
      const hash = node(
        "hash:" + r.hash,
        "record-hash",
        String(r.hash),
        "recorded",
        "registry-signed",
      );
      edge(rec, hash, "commits-to", "recorded", "registry-signed");
      if (r.previous_hash !== "GENESIS")
        edge(
          hash,
          node(
            "hash:" + r.previous_hash,
            "record-hash",
            String(r.previous_hash),
          ),
          "previous-record",
          "recorded",
          "hash-linked",
        );
      else
        edge(
          node(
            "identity:" + id,
            "genesis",
            String(agent),
            "anchored",
            "registry-signed",
          ),
          rec,
          "birth-record",
          "recorded",
          "registry-signed",
          proof,
        );
    } else if (q.kind === "events") {
      const e = node(
        "event:" + id,
        "event",
        String(r.kind),
        String(r.decision),
        "registry-observed",
        { created: r.created },
      );
      edge(a, e, "decision", String(r.decision), "registry-signed", proof);
    } else if (q.kind === "attestations") {
      const n = node(
        "attestation:" + id,
        "attestation",
        "Operator attestation",
        "requires-live-verification",
        "external-issuer",
        { created: r.created },
      );
      edge(
        n,
        root,
        "attests-operator",
        "requires-live-verification",
        "external-issuer",
        proof,
      );
    } else if (q.kind === "controls") {
      const n = node(
        "control:" + org + ":" + id,
        "control",
        id,
        String(r.status),
        "self-assessed",
        { updated: r.updated },
      );
      edge(root, n, "assesses", String(r.status), "self-assessed");
      if (r.evidence_hash)
        edge(
          n,
          node(
            "evidence:" + r.evidence_hash,
            "evidence",
            String(r.evidence_hash),
            "unverified-content",
            "operator-supplied",
            { url: r.evidence_url },
          ),
          "references",
          "unverified-content",
          "operator-supplied",
        );
    } else if (q.kind === "workloads") {
      const state =
        Number(r.valid_until) * 1000 > Date.now()
          ? "recorded-unexpired"
          : "expired";
      const w = node(
        "workload:" + r.spiffe_id,
        "workload",
        String(r.spiffe_id),
        state,
        "configured-trust-domain",
        {
          validUntil: r.valid_until,
          bundleHash: r.bundle_hash,
          proofHash: r.proof_hash,
        },
      );
      edge(w, a, "attests-workload", state, "recorded-spiffe-verification");
    } else if (q.kind === "connections") {
      const target = node("agent:" + r.target, "agent", String(r.target));
      edge(a, target, "follows", "recorded", "runtime-signed-action");
    } else {
      const state = r.revoked
        ? "revoked"
        : Date.parse(String(r.expires)) <= Date.now()
          ? "expired"
          : "issued";
      const n = node(
        "certificate:" + id,
        "certificate",
        String(r.scheme),
        state,
        "ftai-technical-assessment",
        { issued: r.issued, expires: r.expires, reason: r.reason },
      );
      edge(n, a, "certifies", state, "ftai-technical-assessment", proof);
    }
  }
  const graph = {
    schema: "ftai-trust-graph/1",
    organisation: org,
    observedAt: new Date().toISOString(),
    kind: q.kind,
    nodes: [...nodes.values()],
    edges,
    next: more ? String(rows[q.limit - 1].id) : null,
    visibility:
      "Organisation relationships are shared with members; private passport records, permits, runtime details and outgoing network links require passport ownership.",
    consistency:
      "Live paginated view; recheck authority before execution. Referenced nodes may appear on other pages.",
    kinds: graphKinds,
  };
  return {
    ...graph,
    receipt: await receipt({
      type: "FTAITrustGraphPage",
      hash: await digest(JSON.stringify(graph)),
      ...graph,
    }),
  };
}
