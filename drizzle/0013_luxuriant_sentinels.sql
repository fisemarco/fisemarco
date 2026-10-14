CREATE TABLE `intelligence_capabilities` (
	`key` text PRIMARY KEY NOT NULL,
	`organisation` text NOT NULL,
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`document` text NOT NULL,
	`status` text NOT NULL,
	`evidence` text NOT NULL,
	`reviewer` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_intelligence_capability_version` ON `intelligence_capabilities` (`organisation`,`id`,`version`);--> statement-breakpoint
CREATE TABLE `intelligence_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation` text NOT NULL,
	`agent` text NOT NULL,
	`parent` text,
	`step_id` text NOT NULL,
	`pattern` text NOT NULL,
	`input_hash` text NOT NULL,
	`policy_version` integer NOT NULL,
	`mode` text NOT NULL,
	`decision` text NOT NULL,
	`route` text NOT NULL,
	`state` text NOT NULL,
	`report` text,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	`completed` text,
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_intelligence_execution_org_created` ON `intelligence_executions` (`organisation`,`created`,`id`);--> statement-breakpoint
CREATE INDEX `idx_intelligence_execution_agent` ON `intelligence_executions` (`agent`);--> statement-breakpoint
CREATE TABLE `intelligence_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation` text NOT NULL,
	`version` integer NOT NULL,
	`document` text NOT NULL,
	`reviewer` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_intelligence_policy_version` ON `intelligence_policies` (`organisation`,`version`);