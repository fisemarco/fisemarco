-- FTAI dedicated server-only schema. Apply with a project administrator.
BEGIN;
CREATE SCHEMA ftai_private;
REVOKE ALL ON SCHEMA ftai_private FROM PUBLIC, anon, authenticated;
SET LOCAL search_path=ftai_private,pg_catalog;
CREATE TABLE "agents" (
	"code" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"organization" text NOT NULL,
	"profile" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL
);
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"label" text NOT NULL,
	"hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scope" text NOT NULL,
	"created" text NOT NULL,
	"expires" text NOT NULL
);
CREATE TABLE "records" (
	"id" text PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" text NOT NULL,
	"actor" text NOT NULL,
	"created" text NOT NULL,
	"previous_hash" text NOT NULL,
	"hash" text NOT NULL,
	"jws" text NOT NULL,
	FOREIGN KEY ("agent") REFERENCES "agents"("code") ON UPDATE no action ON DELETE no action
);
CREATE TABLE "enrollment_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"label" text NOT NULL,
	"organization" text NOT NULL,
	"allowed" text NOT NULL,
	"denied" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"max_agents" integer NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_expires" text NOT NULL,
	"created" text NOT NULL,
	"updated" text NOT NULL
);
CREATE TABLE "runtime_agents" (
	"agent" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"external_id" text NOT NULL,
	"public_key" text NOT NULL,
	"thumbprint" text NOT NULL,
	"revoked" integer DEFAULT 0 NOT NULL,
	"last_seen" text,
	"runtime_status" text DEFAULT 'unknown' NOT NULL,
	"heartbeat" text,
	"created" text NOT NULL,
	FOREIGN KEY ("agent") REFERENCES "agents"("code") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("policy_id") REFERENCES "enrollment_policies"("id") ON UPDATE no action ON DELETE no action
);
CREATE TABLE "runtime_replays" (
	"id" text PRIMARY KEY NOT NULL,
	"expires" integer NOT NULL
);
CREATE TABLE "work_permits" (
	"id" text PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"policy_id" text NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"input_hash" text NOT NULL,
	"title" text NOT NULL,
	"state" text DEFAULT 'issued' NOT NULL,
	"policy_revision" integer NOT NULL,
	"agent_revision" integer NOT NULL,
	"agent_version" text NOT NULL,
	"expires" text NOT NULL,
	"created" text NOT NULL,
	"started" text,
	"completed" text,
	"receipt" text NOT NULL,
	"outcome_id" text,
	FOREIGN KEY ("agent") REFERENCES "agents"("code") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("policy_id") REFERENCES "enrollment_policies"("id") ON UPDATE no action ON DELETE no action
);
CREATE TABLE request_limits (id TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE sphere_members (agent TEXT PRIMARY KEY NOT NULL REFERENCES agents(code), headline TEXT NOT NULL, bio TEXT NOT NULL, skills TEXT NOT NULL, joined TEXT NOT NULL, updated TEXT NOT NULL, proof TEXT NOT NULL);
CREATE TABLE sphere_posts (id TEXT PRIMARY KEY NOT NULL, agent TEXT NOT NULL REFERENCES sphere_members(agent), body TEXT NOT NULL, parent TEXT, created TEXT NOT NULL, receipt TEXT NOT NULL);
CREATE TABLE sphere_edges (source TEXT NOT NULL REFERENCES sphere_members(agent), target TEXT NOT NULL REFERENCES sphere_members(agent), kind TEXT NOT NULL CHECK(kind IN ('follow','block')), created TEXT NOT NULL, PRIMARY KEY(source,target,kind));
CREATE TABLE sphere_invites (id TEXT PRIMARY KEY NOT NULL, agent TEXT NOT NULL REFERENCES sphere_members(agent), token_hash TEXT UNIQUE NOT NULL, expires TEXT NOT NULL, claimed_by TEXT, created TEXT NOT NULL);
CREATE TABLE safety_reports (id TEXT PRIMARY KEY NOT NULL, agent TEXT, target TEXT NOT NULL, category TEXT NOT NULL, details TEXT NOT NULL, contact TEXT NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', decision TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL, access_hash TEXT NOT NULL);
CREATE TABLE privacy_erasures (agent TEXT PRIMARY KEY NOT NULL, erased TEXT NOT NULL, receipt TEXT NOT NULL);
CREATE TABLE erasure_authorizations (agent TEXT PRIMARY KEY NOT NULL);
CREATE TABLE sphere_invite_claims (invite TEXT PRIMARY KEY NOT NULL REFERENCES sphere_invites(id), agent TEXT NOT NULL REFERENCES agents(code));
CREATE TABLE sphere_notices (id TEXT PRIMARY KEY NOT NULL, agent TEXT NOT NULL REFERENCES agents(code), post TEXT NOT NULL, report TEXT NOT NULL, reason TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE oauth_tokens(id TEXT PRIMARY KEY NOT NULL, agent TEXT NOT NULL REFERENCES agents(code), token_hash TEXT UNIQUE NOT NULL, audience TEXT NOT NULL, scopes TEXT NOT NULL, thumbprint TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE a2a_tasks(id TEXT PRIMARY KEY NOT NULL, agent TEXT NOT NULL REFERENCES agents(code), message_id TEXT NOT NULL, request_hash TEXT NOT NULL, result TEXT NOT NULL, scopes TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE runtime_attestations(agent TEXT PRIMARY KEY NOT NULL REFERENCES agents(code), spiffe_id TEXT NOT NULL, valid_until INTEGER NOT NULL, bundle_hash TEXT NOT NULL, attested TEXT NOT NULL, proof_hash TEXT NOT NULL);
CREATE TABLE discovered_agents(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,source TEXT NOT NULL,source_address TEXT NOT NULL UNIQUE,source_url TEXT NOT NULL,reported_status TEXT NOT NULL,discovered TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0);
CREATE INDEX "idx_agents_owner" ON "agents" ("owner");
CREATE INDEX "idx_agents_visibility" ON "agents" ("visibility");
CREATE UNIQUE INDEX "idx_api_keys_hash" ON "api_keys" ("hash");
CREATE INDEX "idx_api_keys_owner" ON "api_keys" ("owner");
CREATE UNIQUE INDEX "idx_records_agent_sequence" ON "records" ("agent","sequence");
CREATE INDEX "idx_records_agent_kind" ON "records" ("agent","kind");
CREATE INDEX "idx_enrollment_owner" ON "enrollment_policies" ("owner");
CREATE UNIQUE INDEX "idx_enrollment_key" ON "enrollment_policies" ("key_hash");
CREATE UNIQUE INDEX "idx_runtime_policy_external" ON "runtime_agents" ("policy_id","external_id");
CREATE UNIQUE INDEX "idx_runtime_thumbprint" ON "runtime_agents" ("thumbprint");
CREATE INDEX "idx_runtime_replay_expiry" ON "runtime_replays" ("expires");
CREATE INDEX "idx_permits_agent_created" ON "work_permits" ("agent","created");
CREATE INDEX "idx_permits_policy_created" ON "work_permits" ("policy_id","created");
CREATE INDEX idx_limits_expiry ON request_limits(expires);
CREATE INDEX idx_sphere_posts_created ON sphere_posts(created,id);
CREATE INDEX idx_sphere_posts_agent ON sphere_posts(agent);
CREATE INDEX idx_sphere_notices_agent ON sphere_notices(agent,created);
CREATE INDEX idx_oauth_expiry ON oauth_tokens(expires);
CREATE UNIQUE INDEX idx_a2a_message ON a2a_tasks(agent,message_id);
CREATE INDEX idx_a2a_expiry ON a2a_tasks(expires);
CREATE INDEX idx_discovery_name ON discovered_agents(name,id);
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "agents" FROM PUBLIC, anon, authenticated;
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "api_keys" FROM PUBLIC, anon, authenticated;
ALTER TABLE "records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "records" FROM PUBLIC, anon, authenticated;
ALTER TABLE "enrollment_policies" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "enrollment_policies" FROM PUBLIC, anon, authenticated;
ALTER TABLE "runtime_agents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "runtime_agents" FROM PUBLIC, anon, authenticated;
ALTER TABLE "runtime_replays" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "runtime_replays" FROM PUBLIC, anon, authenticated;
ALTER TABLE "work_permits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "work_permits" FROM PUBLIC, anon, authenticated;
ALTER TABLE "request_limits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "request_limits" FROM PUBLIC, anon, authenticated;
ALTER TABLE "sphere_members" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "sphere_members" FROM PUBLIC, anon, authenticated;
ALTER TABLE "sphere_posts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "sphere_posts" FROM PUBLIC, anon, authenticated;
ALTER TABLE "sphere_edges" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "sphere_edges" FROM PUBLIC, anon, authenticated;
ALTER TABLE "sphere_invites" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "sphere_invites" FROM PUBLIC, anon, authenticated;
ALTER TABLE "safety_reports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "safety_reports" FROM PUBLIC, anon, authenticated;
ALTER TABLE "privacy_erasures" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "privacy_erasures" FROM PUBLIC, anon, authenticated;
ALTER TABLE "erasure_authorizations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erasure_authorizations" FROM PUBLIC, anon, authenticated;
ALTER TABLE "sphere_invite_claims" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "sphere_invite_claims" FROM PUBLIC, anon, authenticated;
ALTER TABLE "sphere_notices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "sphere_notices" FROM PUBLIC, anon, authenticated;
ALTER TABLE "oauth_tokens" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "oauth_tokens" FROM PUBLIC, anon, authenticated;
ALTER TABLE "a2a_tasks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "a2a_tasks" FROM PUBLIC, anon, authenticated;
ALTER TABLE "runtime_attestations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "runtime_attestations" FROM PUBLIC, anon, authenticated;
ALTER TABLE "discovered_agents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "discovered_agents" FROM PUBLIC, anon, authenticated;

CREATE FUNCTION ftai_private.protect_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=ftai_private,pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FTAI_IDENTITY_CANNOT_BE_DELETED'; END IF;
 IF NEW.code IS DISTINCT FROM OLD.code OR NEW.created IS DISTINCT FROM OLD.created OR (NEW.owner IS DISTINCT FROM OLD.owner AND NOT EXISTS(SELECT 1 FROM erasure_authorizations WHERE agent=OLD.code)) THEN RAISE EXCEPTION 'FTAI_IDENTITY_LOCKED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ftai_identity_fields_locked BEFORE UPDATE OR DELETE ON agents FOR EACH ROW EXECUTE FUNCTION ftai_private.protect_identity();
CREATE FUNCTION ftai_private.protect_record() RETURNS trigger LANGUAGE plpgsql SET search_path=ftai_private,pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' OR NOT EXISTS(SELECT 1 FROM erasure_authorizations WHERE agent=OLD.agent) THEN RAISE EXCEPTION 'FTAI_LEDGER_IS_APPEND_ONLY'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER ftai_records_locked BEFORE UPDATE OR DELETE ON records FOR EACH ROW EXECUTE FUNCTION ftai_private.protect_record();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ftai_private FROM PUBLIC, anon, authenticated;
-- Set this dedicated login's password outside migration history.
CREATE ROLE ftai_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT USAGE ON SCHEMA ftai_private TO ftai_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ftai_private TO ftai_runtime;
CREATE POLICY ftai_server_only ON "agents" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "api_keys" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "records" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "enrollment_policies" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "runtime_agents" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "runtime_replays" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "work_permits" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "request_limits" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "sphere_members" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "sphere_posts" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "sphere_edges" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "sphere_invites" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "safety_reports" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "privacy_erasures" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "erasure_authorizations" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "sphere_invite_claims" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "sphere_notices" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "oauth_tokens" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "a2a_tasks" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "runtime_attestations" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
CREATE POLICY ftai_server_only ON "discovered_agents" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
COMMIT;
