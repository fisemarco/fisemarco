CREATE TABLE `agent_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation` text NOT NULL,
	`agent` text NOT NULL,
	`scheme` text NOT NULL,
	`issued` text NOT NULL,
	`expires` text NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`credential` text NOT NULL,
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_certificates_org` ON `agent_certificates` (`organisation`);--> statement-breakpoint
CREATE INDEX `idx_certificates_agent` ON `agent_certificates` (`agent`);