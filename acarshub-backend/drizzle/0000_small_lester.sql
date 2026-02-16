CREATE TABLE `alert_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_uid` text(36) NOT NULL,
	`term` text(32) NOT NULL,
	`match_type` text(32) NOT NULL,
	`matched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_alert_matches_message_uid` ON `alert_matches` (`message_uid`);--> statement-breakpoint
CREATE TABLE `alert_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`term` text(32),
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `freqs_acars` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`freq` text(32),
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `freqs_hfdl` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`freq` text(32),
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `freqs_imsl` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`freq` text(32),
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `freqs_irdm` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`freq` text(32),
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `freqs_vdlm2` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`freq` text(32),
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `ignore_alert_terms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`term` text(32)
);
--> statement-breakpoint
CREATE TABLE `level_acars` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` real,
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `level_hfdl` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` real,
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `level_imsl` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` real,
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `level_irdm` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` real,
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `level_vdlm2` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` real,
	`count` integer
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text(36) NOT NULL,
	`message_type` text(32) NOT NULL,
	`msg_time` integer NOT NULL,
	`station_id` text(32) NOT NULL,
	`toaddr` text(32) NOT NULL,
	`fromaddr` text(32) NOT NULL,
	`depa` text(32) NOT NULL,
	`dsta` text(32) NOT NULL,
	`eta` text(32) NOT NULL,
	`gtout` text(32) NOT NULL,
	`gtin` text(32) NOT NULL,
	`wloff` text(32) NOT NULL,
	`wlin` text(32) NOT NULL,
	`lat` text(32) NOT NULL,
	`lon` text(32) NOT NULL,
	`alt` text(32) NOT NULL,
	`msg_text` text NOT NULL,
	`tail` text(32) NOT NULL,
	`flight` text(32) NOT NULL,
	`icao` text(32) NOT NULL,
	`freq` text(32) NOT NULL,
	`ack` text(32) NOT NULL,
	`mode` text(32) NOT NULL,
	`label` text(32) NOT NULL,
	`block_id` text(32) NOT NULL,
	`msgno` text(32) NOT NULL,
	`is_response` text(32) NOT NULL,
	`is_onground` text(32) NOT NULL,
	`error` text(32) NOT NULL,
	`libacars` text NOT NULL,
	`level` text(32) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_uid_unique` ON `messages` (`uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `ix_messages_uid` ON `messages` (`uid`);--> statement-breakpoint
CREATE INDEX `ix_messages_depa` ON `messages` (`depa`);--> statement-breakpoint
CREATE INDEX `ix_messages_dsta` ON `messages` (`dsta`);--> statement-breakpoint
CREATE INDEX `ix_messages_flight` ON `messages` (`flight`);--> statement-breakpoint
CREATE INDEX `ix_messages_freq` ON `messages` (`freq`);--> statement-breakpoint
CREATE INDEX `ix_messages_icao` ON `messages` (`icao`);--> statement-breakpoint
CREATE INDEX `ix_messages_label` ON `messages` (`label`);--> statement-breakpoint
CREATE INDEX `ix_messages_msg_text` ON `messages` (`msg_text`);--> statement-breakpoint
CREATE INDEX `ix_messages_msgno` ON `messages` (`msgno`);--> statement-breakpoint
CREATE INDEX `ix_messages_tail` ON `messages` (`tail`);--> statement-breakpoint
CREATE TABLE `count` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`total` integer,
	`errors` integer,
	`good` integer
);
--> statement-breakpoint
CREATE TABLE `nonlogged_count` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`errors` integer,
	`good` integer
);
