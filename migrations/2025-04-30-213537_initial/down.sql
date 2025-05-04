-- This file should undo anything in `up.sql`

DROP TABLE IF EXISTS count;
DROP TABLE IF EXISTS freqs;
DROP TABLE IF EXISTS level;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS messages_saved;
DROP TABLE IF EXISTS alert_stats;
DROP TABLE IF EXISTS ignore_alert_terms;
DROP TABLE IF EXISTS nonlogged_count;;
DROP TRIGGER IF EXISTS messages_fts_delete;
DROP TRIGGER IF EXISTS messages_fts_insert;
DROP TRIGGER IF EXISTS messages_fts_update;
DROP TABLE IF EXISTS messages_fts_config;
DROP TABLE IF EXISTS messages_fts_data;
DROP TABLE IF EXISTS messages_fts_docsize;
DROP TABLE IF EXISTS messages_fts_idx;
PRAGMA writable_schema = ON;
DELETE FROM sqlite_master WHERE type = 'table' AND name = 'messages_fts';
PRAGMA writable_schema = OFF;

DROP INDEX IF EXISTS ix_messages_msg_text;
DROP INDEX IF EXISTS ix_messages_icao;
DROP INDEX IF EXISTS ix_messages_flight;
DROP INDEX IF EXISTS ix_messages_tail;
DROP INDEX IF EXISTS ix_messages_depa;
DROP INDEX IF EXISTS ix_messages_dsta;
DROP INDEX IF EXISTS ix_messages_msgno;
DROP INDEX IF EXISTS ix_messages_freq;
DROP INDEX IF EXISTS ix_messages_label;
DROP INDEX IF EXISTS ix_messages_msgtime;
