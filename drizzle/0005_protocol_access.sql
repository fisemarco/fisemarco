CREATE TABLE oauth_tokens(id TEXT PRIMARY KEY NOT NULL, agent TEXT NOT NULL REFERENCES agents(code), token_hash TEXT UNIQUE NOT NULL, audience TEXT NOT NULL, scopes TEXT NOT NULL, thumbprint TEXT NOT NULL, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_oauth_expiry ON oauth_tokens(expires);
--> statement-breakpoint
CREATE TABLE a2a_tasks(id TEXT PRIMARY KEY NOT NULL, agent TEXT NOT NULL REFERENCES agents(code), message_id TEXT NOT NULL, request_hash TEXT NOT NULL, result TEXT NOT NULL, scopes TEXT NOT NULL, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_a2a_message ON a2a_tasks(agent,message_id);
--> statement-breakpoint
CREATE INDEX idx_a2a_expiry ON a2a_tasks(expires);
--> statement-breakpoint
CREATE TABLE runtime_attestations(agent TEXT PRIMARY KEY NOT NULL REFERENCES agents(code), spiffe_id TEXT NOT NULL, valid_until INTEGER NOT NULL, bundle_hash TEXT NOT NULL, attested TEXT NOT NULL, proof_hash TEXT NOT NULL);
