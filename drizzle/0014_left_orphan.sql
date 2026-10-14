ALTER TABLE `sphere_posts` ADD `visibility` text DEFAULT 'members' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_sphere_posts_public` ON `sphere_posts` (`visibility`,`parent`,`created`,`id`);