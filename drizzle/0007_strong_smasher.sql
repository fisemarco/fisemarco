CREATE TABLE `authority_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation` text NOT NULL,
	`parent` text,
	`subject` text NOT NULL,
	`constraints` text NOT NULL,
	`expires` text NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`receipt` text NOT NULL,
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent`) REFERENCES `authority_grants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject`) REFERENCES `agents`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_grants_org` ON `authority_grants` (`organisation`);--> statement-breakpoint
CREATE INDEX `idx_grants_parent` ON `authority_grants` (`parent`);--> statement-breakpoint
CREATE INDEX `idx_grants_subject` ON `authority_grants` (`subject`);--> statement-breakpoint
CREATE TABLE `organisation_agents` (
	`agent` text PRIMARY KEY NOT NULL,
	`organisation` text NOT NULL,
	`classification` text NOT NULL,
	`team` text NOT NULL,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_org_agents_org` ON `organisation_agents` (`organisation`);--> statement-breakpoint
CREATE TABLE `organisation_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation` text NOT NULL,
	`hash` text NOT NULL,
	`role` text NOT NULL,
	`expires` text NOT NULL,
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organisation_invites_hash_unique` ON `organisation_invites` (`hash`);--> statement-breakpoint
CREATE INDEX `idx_org_invites_org` ON `organisation_invites` (`organisation`);--> statement-breakpoint
CREATE TABLE `organisation_members` (
	`organisation` text NOT NULL,
	`user` text NOT NULL,
	`role` text NOT NULL,
	`joined` text NOT NULL,
	PRIMARY KEY(`organisation`, `user`),
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_org_members_user` ON `organisation_members` (`user`);--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_organisations_owner` ON `organisations` (`owner`);