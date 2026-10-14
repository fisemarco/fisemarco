CREATE TABLE `testnet_agents` (
	`code` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`space`) REFERENCES `testnet_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_testnet_agents_space` ON `testnet_agents` (`space`);--> statement-breakpoint
CREATE TABLE `testnet_nonces` (
	`id` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_testnet_nonces_expiry` ON `testnet_nonces` (`expires`);--> statement-breakpoint
CREATE TABLE `testnet_permits` (
	`id` text PRIMARY KEY NOT NULL,
	`agent` text NOT NULL,
	`request` text NOT NULL,
	`input_hash` text NOT NULL,
	`state` text NOT NULL,
	`expires` text NOT NULL,
	`receipt` text NOT NULL,
	FOREIGN KEY (`agent`) REFERENCES `testnet_agents`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_testnet_permits_agent` ON `testnet_permits` (`agent`);--> statement-breakpoint
CREATE TABLE `testnet_spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`constraints` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `testnet_spaces_key_hash_unique` ON `testnet_spaces` (`key_hash`);--> statement-breakpoint
CREATE INDEX `idx_testnet_owner` ON `testnet_spaces` (`owner`);