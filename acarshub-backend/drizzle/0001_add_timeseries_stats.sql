-- Migration: Add timeseries_stats table for RRD data
-- Replaces RRD (Round Robin Database) with SQLite for time-series statistics
-- Created: 2024-12-18

CREATE TABLE IF NOT EXISTS `timeseries_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`resolution` text NOT NULL,
	`acars_count` integer DEFAULT 0 NOT NULL,
	`vdlm_count` integer DEFAULT 0 NOT NULL,
	`hfdl_count` integer DEFAULT 0 NOT NULL,
	`imsl_count` integer DEFAULT 0 NOT NULL,
	`irdm_count` integer DEFAULT 0 NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);

-- Index for efficient time-range queries
CREATE INDEX `idx_timeseries_timestamp_resolution` ON `timeseries_stats` (`timestamp`, `resolution`);

-- Index for filtering by resolution
CREATE INDEX `idx_timeseries_resolution` ON `timeseries_stats` (`resolution`);

-- Add constraint check for resolution enum (SQLite doesn't have native ENUM)
-- Valid values: '1min', '5min', '1hour', '6hour'
