CREATE TABLE sphere_notices (id TEXT PRIMARY KEY NOT NULL, agent TEXT NOT NULL REFERENCES agents(code), post TEXT NOT NULL, report TEXT NOT NULL, reason TEXT NOT NULL, created TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_sphere_notices_agent ON sphere_notices(agent,created);
