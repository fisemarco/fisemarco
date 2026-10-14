CREATE TABLE `enrollment_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`label` text NOT NULL,
	`organization` text NOT NULL,
	`allowed` text NOT NULL,
	`denied` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`max_agents` integer NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`key_expires` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_enrollment_owner` ON `enrollment_policies` (`owner`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_enrollment_key` ON `enrollment_policies` (`key_hash`);--> statement-breakpoint
CREATE TABLE `runtime_agents` (
	`agent` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`external_id` text NOT NULL,
	`public_key` text NOT NULL,
	`thumbprint` text NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`last_seen` text,
	`runtime_status` text DEFAULT 'unknown' NOT NULL,
	`heartbeat` text,
	`created` text NOT NULL,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`policy_id`) REFERENCES `enrollment_policies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_runtime_policy_external` ON `runtime_agents` (`policy_id`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_runtime_thumbprint` ON `runtime_agents` (`thumbprint`);--> statement-breakpoint
CREATE TABLE `runtime_replays` (
	`id` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_runtime_replay_expiry` ON `runtime_replays` (`expires`);--> statement-breakpoint
CREATE TABLE `work_permits` (
	`id` text PRIMARY KEY NOT NULL,
	`agent` text NOT NULL,
	`policy_id` text NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`input_hash` text NOT NULL,
	`title` text NOT NULL,
	`state` text DEFAULT 'issued' NOT NULL,
	`policy_revision` integer NOT NULL,
	`agent_revision` integer NOT NULL,
	`agent_version` text NOT NULL,
	`expires` text NOT NULL,
	`created` text NOT NULL,
	`started` text,
	`completed` text,
	`receipt` text NOT NULL,
	`outcome_id` text,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`policy_id`) REFERENCES `enrollment_policies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_permits_agent_created` ON `work_permits` (`agent`,`created`);--> statement-breakpoint
CREATE INDEX `idx_permits_policy_created` ON `work_permits` (`policy_id`,`created`);