#!/usr/bin/env python3

# This script is designed to ensure the database for the user
# Is on the current schema

import sqlite3
import os
import sys
import shutil

# Current schema:
# LEGACY DBS WILL NOT HAVE COLUMNS SET AS NOT NULLABLE BUT WE TAKE CARE OF THAT BELOW
# AND ALSO WITH UPDATED writes in acarshub_db.py

    # __tablename__ = 'messages'
    # id = Column(Integer, primary_key=True)
    # # ACARS or VDLM
    # message_type = Column('message_type', String(32), nullable=False)
    # # message time
    # time = Column('time', String(32), nullable=False)
    # station_id = Column('station_id', String(32), nullable=False)
    # toaddr = Column('toaddr', String(32), nullable=False)
    # fromaddr = Column('fromaddr', String(32), nullable=False)
    # depa = Column('depa', String(32), index=True, nullable=False)
    # dsta = Column('dsta', String(32), index=True, nullable=False)
    # eta = Column('eta', String(32), nullable=False)
    # gtout = Column('gtout', String(32), nullable=False)
    # gtin = Column('gtin', String(32), nullable=False)
    # wloff = Column('wloff', String(32), nullable=False)
    # wlin = Column('wlin', String(32), nullable=False)
    # lat = Column('lat', String(32), nullable=False)
    # lon = Column('lon', String(32), nullable=False)
    # alt = Column('alt', String(32), nullable=False)
    # text = Column('msg_text', Text, index=True, nullable=False)
    # tail = Column('tail', String(32), index=True, nullable=False)
    # flight = Column('flight', String(32), index=True, nullable=False)
    # icao = Column('icao', String(32), index=True, nullable=False)
    # freq = Column('freq', String(32), index=True, nullable=False)
    # ack = Column('ack', String(32), nullable=False)
    # mode = Column('mode', String(32), nullable=False)
    # label = Column('label', String(32), index=True, nullable=False)
    # block_id = Column('block_id', String(32), nullable=False)
    # msgno = Column('msgno', String(32), index=True, nullable=False)
    # is_response = Column('is_response', String(32), nullable=False)
    # is_onground = Column('is_onground', String(32), nullable=False)
    # error = Column('error', String(32), nullable=False)
    # libacars = Column('libacars', Text, nullable=False)
    # level = Column('level', String(32), nullable=False)

if os.getenv("SPAM", default=False):
	path_to_db = "/Users/fred/messages.db"
else:
	path_to_db = "/run/acars/messages.db"
print("[database] Checking to see if database needs upgrades")
upgraded = False


def check_columns(cur):
	global upgraded
	columns = [i[1] for i in cur.execute('PRAGMA table_info(messages)')]

	if 'level' not in columns:
		upgraded = True
		print("[database] Adding level column")
		cur.execute('ALTER TABLE messages ADD COLUMN level TEXT')
		conn.commit()
	if 'text' in columns:
		upgraded = True
		print("[database] Renaming text column")
		cur.execute('ALTER TABLE "main"."messages" RENAME COLUMN "text" TO "msg_text"')
		conn.commit()


def check_tables(cur):
	global upgraded
	tables = [i[0] for i in cur.execute('SELECT name FROM sqlite_master WHERE type ="table" AND name NOT LIKE "sqlite_%"')]

	if 'text_fts' not in tables:
		upgraded = True
		print("[database] Adding in text search tables....may take a while")

		# Create the virtual table for search indexing.
		cur.execute('CREATE VIRTUAL TABLE text_fts USING fts5(message_type UNINDEXED, time, station_id UNINDEXED, toaddr UNINDEXED, fromaddr UNINDEXED, \
					depa, dsta, eta UNINDEXED, gtout UNINDEXED, gtin UNINDEXED, wloff UNINDEXED, wlin UNINDEXED, lat UNINDEXED, lon UNINDEXED, \
		    		alt UNINDEXED, msg_text, tail, flight, icao, freq, ack UNINDEXED, mode UNINDEXED, label, block_id UNINDEXED, msgno UNINDEXED, \
		    		is_response UNINDEXED, is_onground UNINDEXED, error UNINDEXED, libacars UNINDEXED, level UNINDEXED, content="messages", content_rowid="id")')

		# Create the triggers to keep the message table and text search table in sync
		cur.execute('CREATE TRIGGER message_ai AFTER INSERT ON messages BEGIN INSERT INTO text_fts (rowid, message_type, time, station_id, toaddr, fromaddr, depa, dsta, \
					eta, gtout, gtin, wloff, wlin, lat, lon, alt, msg_text, tail, flight, icao, freq, ack, mode, label, block_id, msgno, is_response, is_onground, error, \
					libacars, level) VALUES (new.id, new.message_type, new.time, new.station_id, new.toaddr, new.fromaddr, new.depa, new.dsta, new.eta, new.gtout, new.gtin, \
					new.wloff, new.wlin, new.lat, new.lon, new.alt, new.msg_text, new.tail, new.flight, new.icao, new.freq, new.ack, new.mode, new.label, new.block_id, \
					new.msgno, new.is_response, new.is_onground, new.error, new.libacars, new.level); END;')

		cur.execute('CREATE TRIGGER message_ad AFTER DELETE ON messages BEGIN INSERT INTO text_fts (text_fts, rowid, time, station_id, toaddr, fromaddr, depa, dsta, eta, \
					gtout, gtin, wloff, wlin, lat, lon, alt, msg_text, tail, flight, icao, freq, ack, mode, label, block_id, msgno, is_response, is_onground, error, libacars, \
					level) VALUES (\'delete\', old.id, old.time, old.station_id, old.toaddr, old.fromaddr, old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, \
					old.wlin, old.lat, old.lon, old.alt, old.text, old.tail, old.flight, old.icao, old.freq, old.ack, old.mode, old.label, old.block_id, old.msgno, \
					old.is_response, old.is_onground, old.error, old.libacars, old.level); END;')

		cur.execute('CREATE TRIGGER message_au AFTER UPDATE ON messages BEGIN INSERT INTO text_fts (text_fts, rowid, message_type, time, station_id, toaddr, fromaddr, \
					depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt, msg_text, tail, flight, icao, freq, ack, mode, label, block_id, msgno, is_response, \
					is_onground, error, libacars, level) VALUES (\'delete\', old.id, old.message_type, old.time, old.station_id, old.toaddr, old.fromaddr, old.depa, old.dsta, \
					old.eta, old.gtout, old.gtin, old.wloff, old.wlin, old.lat, old.lon, old.alt, old.msg_text, old.tail, old.flight, old.icao, old.freq, old.ack, \
					old.mode, old.label, old.block_id, old.msgno, old.is_response, old.is_onground, old.error, old.libacars, old.level); INSERT INTO text_fts (rowid, message_type, \
					time, station_id, toaddr, fromaddr, depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt, msg_text, tail, flight, icao, freq, ack, mode, label, \
					block_id, msgno, is_response, is_onground, error, libacars, level) VALUES (new.id, new.message_type, new.time, new.station_id, new.toaddr, new.fromaddr, \
					new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin, new.lat, new.lon, new.alt, new.msg_text, new.tail, new.flight, new.icao, \
					new.freq, new.ack, new.mode, new.label, new.block_id, new.msgno, new.is_response, new.is_onground, new.error, new.libacars, new.level); END;')
		conn.commit()


def de_null(cur):
	# we need to ensure the columns don't have any NULL values
	# Legacy db problems...

	cur.execute('UPDATE messages SET toaddr = "" WHERE toaddr is NULL')
	cur.execute('UPDATE messages SET fromaddr = "" WHERE toaddr is NULL')
	cur.execute('UPDATE messages SET depa = "" WHERE depa IS NULL')
	cur.execute('UPDATE messages SET dsta = "" WHERE dsta IS NULL')
	cur.execute('UPDATE messages SET depa = "" WHERE depa IS NULL')
	cur.execute('UPDATE messages SET eta = "" WHERE eta IS NULL')
	cur.execute('UPDATE messages SET gtout = "" WHERE gtout IS NULL')
	cur.execute('UPDATE messages SET gtin = "" WHERE gtin IS NULL')
	cur.execute('UPDATE messages SET wloff = "" WHERE wloff IS NULL')
	cur.execute('UPDATE messages SET wlin = "" WHERE wlin IS NULL')
	cur.execute('UPDATE messages SET lat = "" WHERE lat IS NULL')
	cur.execute('UPDATE messages SET lon = "" WHERE lon IS NULL')
	cur.execute('UPDATE messages SET alt = "" WHERE alt IS NULL')
	cur.execute('UPDATE messages SET dsta = "" WHERE dsta IS NULL')
	cur.execute('UPDATE messages SET msg_text = "" WHERE msg_text IS NULL')
	cur.execute('UPDATE messages SET tail = "" WHERE tail IS NULL')
	cur.execute('UPDATE messages SET flight = "" WHERE flight IS NULL')
	cur.execute('UPDATE messages SET icao = "" WHERE icao IS NULL')
	cur.execute('UPDATE messages SET freq = "" WHERE freq IS NULL')
	cur.execute('UPDATE messages SET ack = "" WHERE ack IS NULL')
	cur.execute('UPDATE messages SET mode = "" WHERE mode IS NULL')
	cur.execute('UPDATE messages SET label = "" WHERE label IS NULL')
	cur.execute('UPDATE messages SET block_id = "" WHERE block_id IS NULL')
	cur.execute('UPDATE messages SET msgno = "" WHERE msgno IS NULL')
	cur.execute('UPDATE messages SET is_response = "" WHERE is_response IS NULL')
	cur.execute('UPDATE messages SET is_onground = "" WHERE is_onground IS NULL')
	cur.execute('UPDATE messages SET error = "" WHERE error IS NULL')
	cur.execute('UPDATE messages SET libacars = "" WHERE libacars IS NULL')
	cur.execute('UPDATE messages SET level = "" WHERE level IS NULL')
	conn.commit()


def add_indexes(cur):
	global upgraded

	indexes = [i[1] for i in cur.execute('PRAGMA index_list(messages)')]

	if 'ix_messages_msg_text' not in indexes:
		print("[database] Adding text index")
		upgraded = True
		cur.execute('CREATE INDEX "ix_messages_msg_text" ON "messages" ("msg_text"	DESC)')

	if 'ix_messages_icao' not in indexes:
		print("[database] Adding icao index")
		upgraded = True
		cur.execute('CREATE INDEX "ix_messages_icao" ON "messages" ("icao"	DESC)')

	if 'ix_messages_flight' not in indexes:
		print("[database] Adding flight index")
		upgraded = True
		cur.execute('CREATE INDEX "ix_messages_flight" ON "messages" ("flight"	DESC)')

	if 'ix_messages_tail' not in indexes:
		print("[database] Adding tail index")
		upgraded = True
		cur.execute('CREATE INDEX "ix_messages_tail" ON "messages" ("tail"	DESC)')

	if 'ix_messages_depa' not in indexes:
		print("[database] Adding depa index")
		upgraded = True
		cur.execute('CREATE INDEX "ix_messages_depa" ON "messages" ("depa"	DESC)')

	if 'ix_messages_dsta' not in indexes:
		print("[database] Adding dsta index")
		upgraded = True
		cur.execute('CREATE INDEX "ix_messages_dsta" ON "messages" ("dsta"	DESC)')

	if 'ix_messages_msgno' not in indexes:
		print("[database] Adding msgno index")
		upgraded = True
		cur.execute('CREATE INDEX "ix_messages_msgno" ON "messages" ("msgno" DESC)')

	if 'ix_messages_freq' not in indexes:
		print("[database] Adding freq index")
		upgraded = True
		cur.execute('CREATE INDEX "ix_messages_freq" ON "messages" ("freq"	DESC)')

	if 'ix_messages_label' not in indexes:
		print("[database] Adding label index")
		upgraded = True
		cur.execute('CREATE INDEX "ix_messages_label" ON "messages" ("label"	DESC)')


def create_db(cur):
	cur.execute('CREATE TABLE "count" ("id"	INTEGER NOT NULL,"total"	INTEGER, "errors"	INTEGER, "good"	INTEGER, PRIMARY KEY("id"));')
	cur.execute('CREATE TABLE "freqs" ("it"	INTEGER NOT NULL, "freq"	VARCHAR(32), "freq_type"	VARCHAR(32), "count"	INTEGER, PRIMARY KEY("it"));')
	cur.execute('CREATE TABLE "level" ("id"	INTEGER NOT NULL, "level"	INTEGER, "count"	INTEGER, PRIMARY KEY("id"));')
	cur.execute('CREATE TABLE "messages" ("id"	INTEGER NOT NULL, "message_type"	VARCHAR(32) NOT NULL, "time"	VARCHAR(32) NOT NULL, \
				"station_id"	VARCHAR(32) NOT NULL, "toaddr"	VARCHAR(32) NOT NULL, "fromaddr"	VARCHAR(32) NOT NULL, "depa"	VARCHAR(32) NOT NULL, \
				"dsta"	VARCHAR(32) NOT NULL, "eta"	VARCHAR(32) NOT NULL, "gtout"	VARCHAR(32) NOT NULL, "gtin"	VARCHAR(32) NOT NULL, \
				"wloff"	VARCHAR(32) NOT NULL, "wlin"	VARCHAR(32) NOT NULL, "lat"	VARCHAR(32) NOT NULL, "lon"	VARCHAR(32) NOT NULL, \
				"alt"	VARCHAR(32) NOT NULL, "msg_text"	TEXT NOT NULL, "tail"	VARCHAR(32) NOT NULL, "flight"	VARCHAR(32) NOT NULL, \
				"icao"	VARCHAR(32) NOT NULL, "freq"	VARCHAR(32) NOT NULL, "ack"	VARCHAR(32) NOT NULL, "mode"	VARCHAR(32) NOT NULL, \
				"label"	VARCHAR(32) NOT NULL, "block_id"	VARCHAR(32) NOT NULL, "msgno"	VARCHAR(32) NOT NULL, "is_response"	VARCHAR(32) NOT NULL, \
				"is_onground"	VARCHAR(32) NOT NULL, "error"	VARCHAR(32) NOT NULL, "libacars"	TEXT NOT NULL,"level"	VARCHAR(32) NOT NULL, \
				PRIMARY KEY("id"));')

try:
	if os.path.isfile(path_to_db) and not os.path.isfile(path_to_db + ".back"):
		shutil.copyfile(path_to_db, path_to_db + ".back")
		conn = sqlite3.connect(path_to_db)
		cur = conn.cursor()
	elif not os.path.isfile(path_to_db):
		conn = sqlite3.connect(path_to_db)
		cur = conn.cursor()
		create_db(cur)

	check_columns(cur)
	check_tables(cur)
	de_null(cur)
	add_indexes(cur)

	conn.commit()
	conn.close()
except Exception as e:
	print(f"[database]: ERROR UPGRADING DB. PLEASE SHUT DOWN ACARSHUB AND ENSURE DATABASE INTEGRITY: {e}")
	sys.exit(1)

if upgraded:
	print("[database] Completed upgrading database structure")
else:
	print("[database] Database structure did not require upgrades")

sys.exit(0)
