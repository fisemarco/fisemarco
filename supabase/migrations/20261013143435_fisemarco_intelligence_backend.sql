BEGIN;
SET LOCAL search_path=ftai_private,pg_catalog;
CREATE TABLE "intelligence_capabilities" (
	"key" text PRIMARY KEY NOT NULL,
	"organisation" text NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"document" text NOT NULL,
	"status" text NOT NULL,
	"evidence" text NOT NULL,
	"reviewer" text NOT NULL,
	"created" text NOT NULL,
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade
);


CREATE UNIQUE INDEX "idx_intelligence_capability_version" ON "intelligence_capabilities" ("organisation","id","version");

CREATE TABLE "intelligence_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation" text NOT NULL,
	"agent" text NOT NULL,
	"parent" text,
	"step_id" text NOT NULL,
	"pattern" text NOT NULL,
	"input_hash" text NOT NULL,
	"policy_version" integer NOT NULL,
	"mode" text NOT NULL,
	"decision" text NOT NULL,
	"route" text NOT NULL,
	"state" text NOT NULL,
	"report" text,
	"created" text NOT NULL,
	"expires" text NOT NULL,
	"completed" text,
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("agent") REFERENCES "agents"("code") ON UPDATE no action ON DELETE cascade
);


CREATE INDEX "idx_intelligence_execution_org_created" ON "intelligence_executions" ("organisation","created","id");

CREATE INDEX "idx_intelligence_execution_agent" ON "intelligence_executions" ("agent");

CREATE TABLE "intelligence_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation" text NOT NULL,
	"version" integer NOT NULL,
	"document" text NOT NULL,
	"reviewer" text NOT NULL,
	"created" text NOT NULL,
	FOREIGN KEY ("organisation") REFERENCES "organisations"("id") ON UPDATE no action ON DELETE cascade
);


CREATE UNIQUE INDEX "idx_intelligence_policy_version" ON "intelligence_policies" ("organisation","version");
CREATE INDEX idx_intelligence_capabilities_org ON intelligence_capabilities(organisation);
CREATE INDEX idx_intelligence_policies_org ON intelligence_policies(organisation);
CREATE TABLE gateway_replays (nonce text PRIMARY KEY, expires bigint NOT NULL);
CREATE INDEX idx_gateway_replays_expiry ON gateway_replays(expires);
ALTER TABLE intelligence_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE intelligence_capabilities FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE intelligence_capabilities TO ftai_runtime;
CREATE POLICY ftai_server_only ON intelligence_capabilities FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE intelligence_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE intelligence_executions FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE intelligence_executions TO ftai_runtime;
CREATE POLICY ftai_server_only ON intelligence_executions FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE intelligence_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE intelligence_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE intelligence_policies TO ftai_runtime;
CREATE POLICY ftai_server_only ON intelligence_policies FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
ALTER TABLE gateway_replays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE gateway_replays FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE gateway_replays TO ftai_runtime;
CREATE POLICY ftai_server_only ON gateway_replays FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);
COMMIT;
