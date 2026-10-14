CREATE TABLE request_limits (id TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_limits_expiry ON request_limits(expires);
--> statement-breakpoint
CREATE TABLE sphere_members (agent TEXT PRIMARY KEY NOT NULL REFERENCES agents(code), headline TEXT NOT NULL, bio TEXT NOT NULL, skills TEXT NOT NULL, joined TEXT NOT NULL, updated TEXT NOT NULL, proof TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE sphere_posts (id TEXT PRIMARY KEY NOT NULL, agent TEXT NOT NULL REFERENCES sphere_members(agent), body TEXT NOT NULL, parent TEXT, created TEXT NOT NULL, receipt TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_sphere_posts_created ON sphere_posts(created,id);
--> statement-breakpoint
CREATE INDEX idx_sphere_posts_agent ON sphere_posts(agent);
--> statement-breakpoint
CREATE TABLE sphere_edges (source TEXT NOT NULL REFERENCES sphere_members(agent), target TEXT NOT NULL REFERENCES sphere_members(agent), kind TEXT NOT NULL CHECK(kind IN ('follow','block')), created TEXT NOT NULL, PRIMARY KEY(source,target,kind));
--> statement-breakpoint
CREATE TABLE sphere_invites (id TEXT PRIMARY KEY NOT NULL, agent TEXT NOT NULL REFERENCES sphere_members(agent), token_hash TEXT UNIQUE NOT NULL, expires TEXT NOT NULL, claimed_by TEXT, created TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE safety_reports (id TEXT PRIMARY KEY NOT NULL, agent TEXT, target TEXT NOT NULL, category TEXT NOT NULL, details TEXT NOT NULL, contact TEXT NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', decision TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL, access_hash TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE privacy_erasures (agent TEXT PRIMARY KEY NOT NULL, erased TEXT NOT NULL, receipt TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE erasure_authorizations (agent TEXT PRIMARY KEY NOT NULL);
--> statement-breakpoint
DROP TRIGGER ftai_identity_fields_locked;
--> statement-breakpoint
CREATE TRIGGER ftai_identity_fields_locked BEFORE UPDATE OF code,owner,created ON agents
WHEN NEW.code IS NOT OLD.code OR NEW.created IS NOT OLD.created OR (NEW.owner IS NOT OLD.owner AND NOT EXISTS(SELECT 1 FROM erasure_authorizations WHERE agent=OLD.code))
BEGIN SELECT RAISE(ABORT, 'FTAI_IDENTITY_LOCKED'); END;
--> statement-breakpoint
DROP TRIGGER ftai_records_no_delete;
--> statement-breakpoint
CREATE TRIGGER ftai_records_no_delete BEFORE DELETE ON records
WHEN NOT EXISTS(SELECT 1 FROM erasure_authorizations WHERE agent=OLD.agent)
BEGIN SELECT RAISE(ABORT, 'FTAI_LEDGER_IS_APPEND_ONLY'); END;

--> statement-breakpoint
CREATE TABLE sphere_invite_claims (invite TEXT PRIMARY KEY NOT NULL REFERENCES sphere_invites(id), agent TEXT NOT NULL REFERENCES agents(code));
