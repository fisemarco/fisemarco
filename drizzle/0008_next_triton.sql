CREATE TABLE `authority_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation` text NOT NULL,
	`grant_id` text NOT NULL,
	`agent` text NOT NULL,
	`request` text NOT NULL,
	`input_hash` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	`decided` text,
	`approver` text,
	`reason` text,
	`receipt` text,
	`consumed` text,
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grant_id`) REFERENCES `authority_grants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_approvals_org` ON `authority_approvals` (`organisation`,`created`);--> statement-breakpoint
CREATE INDEX `idx_approvals_agent` ON `authority_approvals` (`agent`);--> statement-breakpoint
CREATE TABLE `authority_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation` text NOT NULL,
	`agent` text NOT NULL,
	`kind` text NOT NULL,
	`decision` text NOT NULL,
	`data` text NOT NULL,
	`created` text NOT NULL,
	`receipt` text NOT NULL,
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_authority_events_org` ON `authority_events` (`organisation`,`created`);--> statement-breakpoint
CREATE INDEX `idx_authority_events_agent` ON `authority_events` (`agent`,`created`);--> statement-breakpoint
CREATE TABLE `operator_attestations` (
	`organisation` text PRIMARY KEY NOT NULL,
	`credential` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade
);
