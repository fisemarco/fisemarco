CREATE TABLE `agents` (
	`code` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`organization` text NOT NULL,
	`profile` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agents_owner` ON `agents` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_agents_visibility` ON `agents` (`visibility`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`label` text NOT NULL,
	`hash` text NOT NULL,
	`prefix` text NOT NULL,
	`scope` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_api_keys_hash` ON `api_keys` (`hash`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_owner` ON `api_keys` (`owner`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`agent` text NOT NULL,
	`sequence` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`actor` text NOT NULL,
	`created` text NOT NULL,
	`previous_hash` text NOT NULL,
	`hash` text NOT NULL,
	`jws` text NOT NULL,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_records_agent_sequence` ON `records` (`agent`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_records_agent_kind` ON `records` (`agent`,`kind`);