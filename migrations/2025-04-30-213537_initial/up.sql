CREATE TABLE IF NOT EXISTS count (id INTEGER NOT NULL,total INTEGER, errors INTEGER, good INTEGER, PRIMARY KEY(id));
CREATE TABLE IF NOT EXISTS freqs (it INTEGER NOT NULL, freq VARCHAR(32), freq_type VARCHAR(32), count INTEGER, PRIMARY KEY(it));
CREATE TABLE IF NOT EXISTS level (id INTEGER NOT NULL, level INTEGER, count INTEGER, PRIMARY KEY(id));
CREATE TABLE IF NOT EXISTS messages (id INTEGER NOT NULL, message_type VARCHAR(32) NOT NULL, msg_time INTEGER NOT NULL,station_id VARCHAR(32) NOT NULL, toaddr VARCHAR(32) NOT NULL, fromaddr VARCHAR(32) NOT NULL, depa VARCHAR(32) NOT NULL, dsta VARCHAR(32) NOT NULL, eta VARCHAR(32) NOT NULL, gtout VARCHAR(32) NOT NULL, gtin VARCHAR(32) NOT NULL, wloff VARCHAR(32) NOT NULL, wlin VARCHAR(32) NOT NULL, lat VARCHAR(32) NOT NULL, lon VARCHAR(32) NOT NULL, alt VARCHAR(32) NOT NULL, msg_text TEXT NOT NULL, tail VARCHAR(32) NOT NULL, flight VARCHAR(32) NOT NULL, icao VARCHAR(32) NOT NULL, freq VARCHAR(32) NOT NULL, ack VARCHAR(32) NOT NULL, mode VARCHAR(32) NOT NULL, label VARCHAR(32) NOT NULL, block_id VARCHAR(32) NOT NULL, msgno VARCHAR(32) NOT NULL, is_response VARCHAR(32) NOT NULL, is_onground VARCHAR(32) NOT NULL, error VARCHAR(32) NOT NULL, libacars TEXT NOT NULL,level VARCHAR(32) NOT NULL, PRIMARY KEY(id));
CREATE TABLE IF NOT EXISTS messages_saved (id INTEGER NOT NULL, message_type VARCHAR(32) NOT NULL, msg_time INTEGER NOT NULL, station_id VARCHAR(32) NOT NULL, toaddr VARCHAR(32) NOT NULL, fromaddr VARCHAR(32) NOT NULL, depa VARCHAR(32) NOT NULL, dsta VARCHAR(32) NOT NULL, eta VARCHAR(32) NOT NULL, gtout VARCHAR(32) NOT NULL, gtin VARCHAR(32) NOT NULL, wloff VARCHAR(32) NOT NULL, wlin VARCHAR(32) NOT NULL, lat VARCHAR(32) NOT NULL, lon VARCHAR(32) NOT NULL, alt VARCHAR(32) NOT NULL, msg_text TEXT NOT NULL,tail VARCHAR(32) NOT NULL, flight VARCHAR(32) NOT NULL, icao VARCHAR(32) NOT NULL, freq VARCHAR(32) NOT NULL, ack VARCHAR(32) NOT NULL, mode VARCHAR(32) NOT NULL, label VARCHAR(32) NOT NULL, block_id VARCHAR(32) NOT NULL, msgno VARCHAR(32) NOT NULL, is_response VARCHAR(32) NOT NULL, is_onground VARCHAR(32) NOT NULL, error VARCHAR(32) NOT NULL, libacars TEXT NOT NULL, level VARCHAR(32) NOT NULL, term VARCHAR(32) NOT NULL, type_of_match VARCHAR(32) NOT NULL, PRIMARY KEY(id));
CREATE TABLE IF NOT EXISTS alert_stats ( id INTEGER NOT NULL, term VARCHAR(32), count INTEGER, PRIMARY KEY (id) );
CREATE TABLE IF NOT EXISTS ignore_alert_terms ( id INTEGER NOT NULL, term VARCHAR(32), PRIMARY KEY (id) );
CREATE TABLE IF NOT EXISTS nonlogged_count ( id INTEGER NOT NULL, errors INTEGER, good INTEGER, PRIMARY KEY (id) );

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5
(
    depa,dsta,msg_text,tail,flight,icao,freq,label,
    content=messages,
    content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages
BEGIN
    INSERT INTO messages_fts (rowid, depa,dsta,msg_text,tail,flight,icao,freq,label) VALUES (new.id, new.depa,new.dsta,new.msg_text,new.tail,new.flight,new.icao,new.freq,new.label);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages
BEGIN
    INSERT INTO messages_fts (messages_fts, rowid, depa,dsta,msg_text,tail,flight,icao,freq,label) VALUES ('delete', old.id, old.depa,old.dsta,old.msg_text,old.tail,old.flight,old.icao,old.freq,old.label);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages
BEGIN
    INSERT INTO messages_fts (messages_fts, rowid, depa,dsta,msg_text,tail,flight,icao,freq,label) VALUES ('delete', old.id, old.depa,old.dsta,old.msg_text,old.tail,old.flight,old.icao,old.freq,old.label);
    INSERT INTO messages_fts (rowid, depa,dsta,msg_text,tail,flight,icao,freq,label) VALUES (new.id, new.depa,new.dsta,new.msg_text,new.tail,new.flight,new.icao,new.freq,new.label);
END;

INSERT INTO messages_fts(messages_fts) VALUES ("rebuild");

CREATE INDEX IF NOT EXISTS ix_messages_msg_text ON messages ("msg_text" DESC);
CREATE INDEX IF NOT EXISTS ix_messages_icao ON messages ("icao" DESC);
CREATE INDEX IF NOT EXISTS ix_messages_flight ON messages ("flight" DESC);
CREATE INDEX IF NOT EXISTS ix_messages_tail ON messages ("tail" DESC);
CREATE INDEX IF NOT EXISTS ix_messages_depa ON messages ("depa" DESC);
CREATE INDEX IF NOT EXISTS ix_messages_dsta ON messages ("dsta" DESC);
CREATE INDEX IF NOT EXISTS ix_messages_msgno ON messages ("msgno" DESC);
CREATE INDEX IF NOT EXISTS ix_messages_freq ON messages ("freq" DESC);
CREATE INDEX IF NOT EXISTS ix_messages_label ON messages ("label" DESC);
CREATE INDEX IF NOT EXISTS ix_messages_msgtime ON "messages" ("msg_time" DESC);
