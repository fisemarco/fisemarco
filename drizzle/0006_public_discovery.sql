-- Public source distribution: third-party catalogue seed data omitted.
CREATE TABLE discovered_agents(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,source TEXT NOT NULL,source_address TEXT NOT NULL UNIQUE,source_url TEXT NOT NULL,reported_status TEXT NOT NULL,discovered TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE INDEX idx_discovery_name ON discovered_agents(name,id);
