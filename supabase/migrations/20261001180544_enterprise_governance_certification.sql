-- Add enterprise, governance, testnet and certificate storage without rewriting history.
BEGIN;
SET LOCAL search_path=ftai_private,pg_catalog;
CREATE TABLE "organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner" text NOT NULL,
	"created" text NOT NULL
);
CREATE TABLE "authority_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation" text NOT NULL,
	"agent" text NOT NULL,
	"kind" text NOT NULL,
	"decision" text NOT NULL,
	"data" text NOT NULL,
	"created" text NOT NULL,
	"receipt" text NOT NULL,
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("agent") REFERENCES "agents"("code") ON UPDATE no action ON DELETE no action
);
CREATE TABLE "operator_attestations" (
	"organisation" text PRIMARY KEY NOT NULL,
	"credential" text NOT NULL,
	"created" text NOT NULL,
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "testnet_nonces" (
	"id" text PRIMARY KEY NOT NULL,
	"expires" integer NOT NULL
);
CREATE TABLE "testnet_spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"constraints" text NOT NULL,
	"created" text NOT NULL,
	"expires" text NOT NULL
);
CREATE TABLE "assurance_controls" (
	"organisation" text NOT NULL,
	"control" text NOT NULL,
	"status" text NOT NULL,
	"notes" text NOT NULL,
	"evidence_url" text NOT NULL,
	"evidence_hash" text NOT NULL,
	"reviewer" text NOT NULL,
	"updated" text NOT NULL,
	PRIMARY KEY("organisation", "control"),
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "agent_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation" text NOT NULL,
	"agent" text NOT NULL,
	"scheme" text NOT NULL,
	"issued" text NOT NULL,
	"expires" text NOT NULL,
	"revoked" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"credential" text NOT NULL,
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("agent") REFERENCES "agents"("code") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "authority_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation" text NOT NULL,
	"parent" text,
	"subject" text NOT NULL,
	"constraints" text NOT NULL,
	"expires" text NOT NULL,
	"revoked" integer DEFAULT 0 NOT NULL,
	"created" text NOT NULL,
	"receipt" text NOT NULL,
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("parent") REFERENCES "authority_grants"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("subject") REFERENCES "agents"("code") ON UPDATE no action ON DELETE no action
);
CREATE TABLE "organisation_agents" (
	"agent" text PRIMARY KEY NOT NULL,
	"organisation" text NOT NULL,
	"classification" text NOT NULL,
	"team" text NOT NULL,
	FOREIGN KEY ("agent") REFERENCES "agents"("code") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "organisation_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation" text NOT NULL,
	"hash" text NOT NULL,
	"role" text NOT NULL,
	"expires" text NOT NULL,
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "organisation_members" (
	"organisation" text NOT NULL,
	"user" text NOT NULL,
	"role" text NOT NULL,
	"joined" text NOT NULL,
	PRIMARY KEY("organisation", "user"),
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "authority_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation" text NOT NULL,
	"grant_id" text NOT NULL,
	"agent" text NOT NULL,
	"request" text NOT NULL,
	"input_hash" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created" text NOT NULL,
	"expires" text NOT NULL,
	"decided" text,
	"approver" text,
	"reason" text,
	"receipt" text,
	"consumed" text,
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("grant_id") REFERENCES "authority_grants"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("agent") REFERENCES "agents"("code") ON UPDATE no action ON DELETE no action
);
CREATE TABLE "testnet_agents" (
	"code" text PRIMARY KEY NOT NULL,
	"space" text NOT NULL,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"revoked" integer DEFAULT 0 NOT NULL,
	"created" text NOT NULL,
	FOREIGN KEY ("space") REFERENCES "testnet_spaces"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "testnet_permits" (
	"id" text PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"request" text NOT NULL,
	"input_hash" text NOT NULL,
	"state" text NOT NULL,
	"expires" text NOT NULL,
	"receipt" text NOT NULL,
	FOREIGN KEY ("agent") REFERENCES "testnet_agents"("code") ON UPDATE no action ON DELETE cascade
);
CREATE INDEX "idx_grants_org" ON "authority_grants" ("organisation");
CREATE INDEX "idx_grants_parent" ON "authority_grants" ("parent");
CREATE INDEX "idx_grants_subject" ON "authority_grants" ("subject");
CREATE INDEX "idx_org_agents_org" ON "organisation_agents" ("organisation");
CREATE UNIQUE INDEX "organisation_invites_hash_unique" ON "organisation_invites" ("hash");
CREATE INDEX "idx_org_invites_org" ON "organisation_invites" ("organisation");
CREATE INDEX "idx_org_members_user" ON "organisation_members" ("user");
CREATE INDEX "idx_organisations_owner" ON "organisations" ("owner");
CREATE INDEX "idx_approvals_org" ON "authority_approvals" ("organisation","created");
CREATE INDEX "idx_approvals_agent" ON "authority_approvals" ("agent");
CREATE INDEX "idx_authority_events_org" ON "authority_events" ("organisation","created");
CREATE INDEX "idx_authority_events_agent" ON "authority_events" ("agent","created");
CREATE INDEX "idx_testnet_agents_space" ON "testnet_agents" ("space");
CREATE INDEX "idx_testnet_nonces_expiry" ON "testnet_nonces" ("expires");
CREATE INDEX "idx_testnet_permits_agent" ON "testnet_permits" ("agent");
CREATE UNIQUE INDEX "testnet_spaces_key_hash_unique" ON "testnet_spaces" ("key_hash");
CREATE INDEX "idx_testnet_owner" ON "testnet_spaces" ("owner");
CREATE INDEX "idx_certificates_org" ON "agent_certificates" ("organisation");
CREATE INDEX "idx_certificates_agent" ON "agent_certificates" ("agent");
CREATE INDEX idx_approvals_grant ON authority_approvals(grant_id);
ALTER TABLE work_permits ADD COLUMN authority text;
ALTER TABLE "agent_certificates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "agent_certificates" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "agent_certificates" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "agent_certificates" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "assurance_controls" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "assurance_controls" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "assurance_controls" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "assurance_controls" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "authority_approvals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "authority_approvals" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "authority_approvals" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "authority_approvals" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "authority_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "authority_events" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "authority_events" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "authority_events" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "authority_grants" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "authority_grants" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "authority_grants" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "authority_grants" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "operator_attestations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "operator_attestations" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "operator_attestations" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "operator_attestations" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "organisation_agents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "organisation_agents" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "organisation_agents" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "organisation_agents" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "organisation_invites" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "organisation_invites" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "organisation_invites" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "organisation_invites" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "organisation_members" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "organisation_members" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "organisation_members" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "organisation_members" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "organisations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "organisations" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "organisations" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "organisations" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "testnet_agents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "testnet_agents" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "testnet_agents" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "testnet_agents" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "testnet_nonces" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "testnet_nonces" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "testnet_nonces" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "testnet_nonces" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "testnet_permits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "testnet_permits" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "testnet_permits" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "testnet_permits" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE "testnet_spaces" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "testnet_spaces" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "testnet_spaces" TO ftai_runtime;
CREATE POLICY ftai_server_only ON "testnet_spaces" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
COMMIT;
