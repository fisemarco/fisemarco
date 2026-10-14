import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/sqlite-core";
export const agents = sqliteTable(
  "agents",
  {
    code: text("code").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    organization: text("organization").notNull(),
    profile: text("profile").notNull(),
    status: text("status").notNull().default("active"),
    visibility: text("visibility").notNull().default("private"),
    revision: integer("revision").notNull().default(0),
    created: text("created").notNull(),
    updated: text("updated").notNull(),
  },
  (t) => [
    index("idx_agents_owner").on(t.owner),
    index("idx_agents_visibility").on(t.visibility),
  ],
);
export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    agent: text("agent")
      .notNull()
      .references(() => agents.code),
    sequence: integer("sequence").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    payload: text("payload").notNull(),
    actor: text("actor").notNull(),
    created: text("created").notNull(),
    previousHash: text("previous_hash").notNull(),
    hash: text("hash").notNull(),
    jws: text("jws").notNull(),
  },
  (t) => [
    uniqueIndex("idx_records_agent_sequence").on(t.agent, t.sequence),
    index("idx_records_agent_kind").on(t.agent, t.kind),
  ],
);
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    label: text("label").notNull(),
    hash: text("hash").notNull(),
    prefix: text("prefix").notNull(),
    scope: text("scope").notNull(),
    created: text("created").notNull(),
    expires: text("expires").notNull(),
  },
  (t) => [
    uniqueIndex("idx_api_keys_hash").on(t.hash),
    index("idx_api_keys_owner").on(t.owner),
  ],
);

export const enrollmentPolicies = sqliteTable(
  "enrollment_policies",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    label: text("label").notNull(),
    organization: text("organization").notNull(),
    allowed: text("allowed").notNull(),
    denied: text("denied").notNull(),
    status: text("status").notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    maxAgents: integer("max_agents").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyExpires: text("key_expires").notNull(),
    created: text("created").notNull(),
    updated: text("updated").notNull(),
  },
  (t) => [
    index("idx_enrollment_owner").on(t.owner),
    uniqueIndex("idx_enrollment_key").on(t.keyHash),
  ],
);
export const runtimeAgents = sqliteTable(
  "runtime_agents",
  {
    agent: text("agent")
      .primaryKey()
      .references(() => agents.code),
    policyId: text("policy_id")
      .notNull()
      .references(() => enrollmentPolicies.id),
    externalId: text("external_id").notNull(),
    publicKey: text("public_key").notNull(),
    thumbprint: text("thumbprint").notNull(),
    revoked: integer("revoked").notNull().default(0),
    lastSeen: text("last_seen"),
    runtimeStatus: text("runtime_status").notNull().default("unknown"),
    heartbeat: text("heartbeat"),
    created: text("created").notNull(),
  },
  (t) => [
    uniqueIndex("idx_runtime_policy_external").on(t.policyId, t.externalId),
    uniqueIndex("idx_runtime_thumbprint").on(t.thumbprint),
  ],
);
export const runtimeReplays = sqliteTable(
  "runtime_replays",
  { id: text("id").primaryKey(), expires: integer("expires").notNull() },
  (t) => [index("idx_runtime_replay_expiry").on(t.expires)],
);
export const workPermits = sqliteTable(
  "work_permits",
  {
    id: text("id").primaryKey(),
    agent: text("agent")
      .notNull()
      .references(() => agents.code),
    policyId: text("policy_id")
      .notNull()
      .references(() => enrollmentPolicies.id),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    inputHash: text("input_hash").notNull(),
    authority: text("authority"),
    title: text("title").notNull(),
    state: text("state").notNull().default("issued"),
    policyRevision: integer("policy_revision").notNull(),
    agentRevision: integer("agent_revision").notNull(),
    agentVersion: text("agent_version").notNull(),
    expires: text("expires").notNull(),
    created: text("created").notNull(),
    started: text("started"),
    completed: text("completed"),
    receipt: text("receipt").notNull(),
    outcomeId: text("outcome_id"),
  },
  (t) => [
    index("idx_permits_agent_created").on(t.agent, t.created),
    index("idx_permits_policy_created").on(t.policyId, t.created),
  ],
);

export const requestLimits = sqliteTable(
  "request_limits",
  {
    id: text("id").primaryKey(),
    count: integer("count").notNull(),
    expires: integer("expires").notNull(),
  },
  (t) => [index("idx_limits_expiry").on(t.expires)],
);
export const sphereMembers = sqliteTable("sphere_members", {
  agent: text("agent")
    .primaryKey()
    .references(() => agents.code),
  headline: text("headline").notNull(),
  bio: text("bio").notNull(),
  skills: text("skills").notNull(),
  joined: text("joined").notNull(),
  updated: text("updated").notNull(),
  proof: text("proof").notNull(),
});
export const spherePosts = sqliteTable(
  "sphere_posts",
  {
    id: text("id").primaryKey(),
    agent: text("agent")
      .notNull()
      .references(() => sphereMembers.agent),
    body: text("body").notNull(),
    visibility: text("visibility").notNull().default("members"),
    parent: text("parent"),
    created: text("created").notNull(),
    receipt: text("receipt").notNull(),
  },
  (t) => [
    index("idx_sphere_posts_created").on(t.created, t.id),
    index("idx_sphere_posts_agent").on(t.agent),
    index("idx_sphere_posts_public").on(t.visibility, t.parent, t.created, t.id),
  ],
);
export const sphereEdges = sqliteTable(
  "sphere_edges",
  {
    source: text("source")
      .notNull()
      .references(() => sphereMembers.agent),
    target: text("target")
      .notNull()
      .references(() => sphereMembers.agent),
    kind: text("kind").notNull(),
    created: text("created").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.target, t.kind] }),
    check("sphere_edges_kind", sql`${t.kind} IN ('follow','block')`),
  ],
);
export const sphereInvites = sqliteTable("sphere_invites", {
  id: text("id").primaryKey(),
  agent: text("agent")
    .notNull()
    .references(() => sphereMembers.agent),
  tokenHash: text("token_hash").notNull().unique(),
  expires: text("expires").notNull(),
  claimedBy: text("claimed_by"),
  created: text("created").notNull(),
});
export const sphereInviteClaims = sqliteTable("sphere_invite_claims", {
  invite: text("invite")
    .primaryKey()
    .references(() => sphereInvites.id),
  agent: text("agent")
    .notNull()
    .references(() => agents.code),
});
export const safetyReports = sqliteTable("safety_reports", {
  id: text("id").primaryKey(),
  agent: text("agent"),
  target: text("target").notNull(),
  category: text("category").notNull(),
  details: text("details").notNull(),
  contact: text("contact").notNull(),
  created: text("created").notNull(),
  status: text("status").notNull().default("open"),
  decision: text("decision").notNull().default(""),
  updated: text("updated").notNull(),
  accessHash: text("access_hash").notNull(),
});
export const privacyErasures = sqliteTable("privacy_erasures", {
  agent: text("agent").primaryKey(),
  erased: text("erased").notNull(),
  receipt: text("receipt").notNull(),
});
export const erasureAuthorizations = sqliteTable("erasure_authorizations", {
  agent: text("agent").primaryKey(),
});

export const sphereNotices = sqliteTable(
  "sphere_notices",
  {
    id: text("id").primaryKey(),
    agent: text("agent")
      .notNull()
      .references(() => agents.code),
    post: text("post").notNull(),
    report: text("report").notNull(),
    reason: text("reason").notNull(),
    created: text("created").notNull(),
  },
  (t) => [index("idx_sphere_notices_agent").on(t.agent, t.created)],
);

export const oauthTokens = sqliteTable(
  "oauth_tokens",
  {
    id: text("id").primaryKey(),
    agent: text("agent")
      .notNull()
      .references(() => agents.code),
    tokenHash: text("token_hash").notNull().unique(),
    audience: text("audience").notNull(),
    scopes: text("scopes").notNull(),
    thumbprint: text("thumbprint").notNull(),
    expires: integer("expires").notNull(),
  },
  (t) => [index("idx_oauth_expiry").on(t.expires)],
);
export const a2aTasks = sqliteTable(
  "a2a_tasks",
  {
    id: text("id").primaryKey(),
    agent: text("agent")
      .notNull()
      .references(() => agents.code),
    messageId: text("message_id").notNull(),
    requestHash: text("request_hash").notNull(),
    result: text("result").notNull(),
    scopes: text("scopes").notNull(),
    expires: integer("expires").notNull(),
  },
  (t) => [
    uniqueIndex("idx_a2a_message").on(t.agent, t.messageId),
    index("idx_a2a_expiry").on(t.expires),
  ],
);
export const runtimeAttestations = sqliteTable("runtime_attestations", {
  agent: text("agent")
    .primaryKey()
    .references(() => agents.code),
  spiffeId: text("spiffe_id").notNull(),
  validUntil: integer("valid_until").notNull(),
  bundleHash: text("bundle_hash").notNull(),
  attested: text("attested").notNull(),
  proofHash: text("proof_hash").notNull(),
});
export const discoveredAgents = sqliteTable(
  "discovered_agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    source: text("source").notNull(),
    sourceAddress: text("source_address").notNull().unique(),
    sourceUrl: text("source_url").notNull(),
    reportedStatus: text("reported_status").notNull(),
    discovered: text("discovered").notNull(),
    hidden: integer("hidden").notNull().default(0),
  },
  (t) => [index("idx_discovery_name").on(t.name, t.id)],
);

export const organisations = sqliteTable(
  "organisations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    owner: text("owner").notNull(),
    created: text("created").notNull(),
  },
  (t) => [index("idx_organisations_owner").on(t.owner)],
);
export const organisationMembers = sqliteTable(
  "organisation_members",
  {
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    user: text("user").notNull(),
    role: text("role").notNull(),
    joined: text("joined").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organisation, t.user] }),
    index("idx_org_members_user").on(t.user),
  ],
);
export const organisationInvites = sqliteTable(
  "organisation_invites",
  {
    id: text("id").primaryKey(),
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    hash: text("hash").notNull().unique(),
    role: text("role").notNull(),
    expires: text("expires").notNull(),
  },
  (t) => [index("idx_org_invites_org").on(t.organisation)],
);
export const organisationAgents = sqliteTable(
  "organisation_agents",
  {
    agent: text("agent")
      .primaryKey()
      .references(() => agents.code),
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    classification: text("classification").notNull(),
    team: text("team").notNull(),
  },
  (t) => [index("idx_org_agents_org").on(t.organisation)],
);
export const authorityGrants = sqliteTable(
  "authority_grants",
  {
    id: text("id").primaryKey(),
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    parent: text("parent").references(
      (): AnySQLiteColumn => authorityGrants.id,
      { onDelete: "cascade" },
    ),
    subject: text("subject")
      .notNull()
      .references(() => agents.code),
    constraints: text("constraints").notNull(),
    expires: text("expires").notNull(),
    revoked: integer("revoked").notNull().default(0),
    created: text("created").notNull(),
    receipt: text("receipt").notNull(),
  },
  (t) => [
    index("idx_grants_org").on(t.organisation),
    index("idx_grants_parent").on(t.parent),
    index("idx_grants_subject").on(t.subject),
  ],
);

export const authorityApprovals = sqliteTable(
  "authority_approvals",
  {
    id: text("id").primaryKey(),
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    grant: text("grant_id")
      .notNull()
      .references(() => authorityGrants.id, { onDelete: "cascade" }),
    agent: text("agent")
      .notNull()
      .references(() => agents.code),
    request: text("request").notNull(),
    inputHash: text("input_hash").notNull(),
    state: text("state").notNull().default("pending"),
    created: text("created").notNull(),
    expires: text("expires").notNull(),
    decided: text("decided"),
    approver: text("approver"),
    reason: text("reason"),
    receipt: text("receipt"),
    consumed: text("consumed"),
  },
  (t) => [
    index("idx_approvals_org").on(t.organisation, t.created),
    index("idx_approvals_agent").on(t.agent),
  ],
);
export const authorityEvents = sqliteTable(
  "authority_events",
  {
    id: text("id").primaryKey(),
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    agent: text("agent")
      .notNull()
      .references(() => agents.code),
    kind: text("kind").notNull(),
    decision: text("decision").notNull(),
    data: text("data").notNull(),
    created: text("created").notNull(),
    receipt: text("receipt").notNull(),
  },
  (t) => [
    index("idx_authority_events_org").on(t.organisation, t.created),
    index("idx_authority_events_agent").on(t.agent, t.created),
  ],
);
export const operatorAttestations = sqliteTable("operator_attestations", {
  organisation: text("organisation")
    .primaryKey()
    .references(() => organisations.id, { onDelete: "cascade" }),
  credential: text("credential").notNull(),
  created: text("created").notNull(),
});

export const testnetSpaces = sqliteTable(
  "testnet_spaces",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    constraints: text("constraints").notNull(),
    created: text("created").notNull(),
    expires: text("expires").notNull(),
  },
  (t) => [index("idx_testnet_owner").on(t.owner)],
);
export const testnetAgents = sqliteTable(
  "testnet_agents",
  {
    code: text("code").primaryKey(),
    space: text("space")
      .notNull()
      .references(() => testnetSpaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    publicKey: text("public_key").notNull(),
    revoked: integer("revoked").notNull().default(0),
    created: text("created").notNull(),
  },
  (t) => [index("idx_testnet_agents_space").on(t.space)],
);
export const testnetPermits = sqliteTable(
  "testnet_permits",
  {
    id: text("id").primaryKey(),
    agent: text("agent")
      .notNull()
      .references(() => testnetAgents.code, { onDelete: "cascade" }),
    request: text("request").notNull(),
    inputHash: text("input_hash").notNull(),
    state: text("state").notNull(),
    expires: text("expires").notNull(),
    receipt: text("receipt").notNull(),
  },
  (t) => [index("idx_testnet_permits_agent").on(t.agent)],
);
export const testnetNonces = sqliteTable(
  "testnet_nonces",
  {
    id: text("id").primaryKey(),
    expires: integer("expires").notNull(),
  },
  (t) => [index("idx_testnet_nonces_expiry").on(t.expires)],
);
export const assuranceControls = sqliteTable(
  "assurance_controls",
  {
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    control: text("control").notNull(),
    status: text("status").notNull(),
    notes: text("notes").notNull(),
    evidenceUrl: text("evidence_url").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    reviewer: text("reviewer").notNull(),
    updated: text("updated").notNull(),
  },
  (t) => [primaryKey({ columns: [t.organisation, t.control] })],
);

export const agentCertificates = sqliteTable(
  "agent_certificates",
  {
    id: text("id").primaryKey(),
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    agent: text("agent")
      .notNull()
      .references(() => agents.code, { onDelete: "cascade" }),
    scheme: text("scheme").notNull(),
    issued: text("issued").notNull(),
    expires: text("expires").notNull(),
    revoked: integer("revoked").notNull().default(0),
    reason: text("reason"),
    credential: text("credential").notNull(),
  },
  (t) => [
    index("idx_certificates_org").on(t.organisation),
    index("idx_certificates_agent").on(t.agent),
  ],
);

export const intelligencePolicies = sqliteTable(
  "intelligence_policies",
  {
    id: text("id").primaryKey(),
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    document: text("document").notNull(),
    reviewer: text("reviewer").notNull(),
    created: text("created").notNull(),
  },
  (t) => [
    uniqueIndex("idx_intelligence_policy_version").on(
      t.organisation,
      t.version,
    ),
  ],
);
export const intelligenceCapabilities = sqliteTable(
  "intelligence_capabilities",
  {
    key: text("key").primaryKey(),
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    version: integer("version").notNull(),
    document: text("document").notNull(),
    status: text("status").notNull(),
    evidence: text("evidence").notNull(),
    reviewer: text("reviewer").notNull(),
    created: text("created").notNull(),
  },
  (t) => [
    uniqueIndex("idx_intelligence_capability_version").on(
      t.organisation,
      t.id,
      t.version,
    ),
  ],
);
export const intelligenceExecutions = sqliteTable(
  "intelligence_executions",
  {
    id: text("id").primaryKey(),
    organisation: text("organisation")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    agent: text("agent")
      .notNull()
      .references(() => agents.code, { onDelete: "cascade" }),
    parent: text("parent"),
    stepId: text("step_id").notNull(),
    pattern: text("pattern").notNull(),
    inputHash: text("input_hash").notNull(),
    policyVersion: integer("policy_version").notNull(),
    mode: text("mode").notNull(),
    decision: text("decision").notNull(),
    route: text("route").notNull(),
    state: text("state").notNull(),
    report: text("report"),
    created: text("created").notNull(),
    expires: text("expires").notNull(),
    completed: text("completed"),
  },
  (t) => [
    index("idx_intelligence_execution_org_created").on(
      t.organisation,
      t.created,
      t.id,
    ),
    index("idx_intelligence_execution_agent").on(t.agent),
  ],
);
