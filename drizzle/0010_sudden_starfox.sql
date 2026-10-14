CREATE TABLE `assurance_controls` (
	`organisation` text NOT NULL,
	`control` text NOT NULL,
	`status` text NOT NULL,
	`notes` text NOT NULL,
	`evidence_url` text NOT NULL,
	`evidence_hash` text NOT NULL,
	`reviewer` text NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`organisation`, `control`),
	FOREIGN KEY (`organisation`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade
);
