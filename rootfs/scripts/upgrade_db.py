#!/usr/bin/env python3

# This script is designed to ensure the database for the user
# Is on the current schema

import sqlite3
import os
import sys

# Current schema:

# __tablename__ = 'messages'
# id = Column(Integer, primary_key=True)
# # ACARS or VDLM
# message_type = Column('message_type', String(32))
# # message time
# time = Column('time', String(32))
# station_id = Column('station_id', String(32))
# toaddr = Column('toaddr', String(32))
# fromaddr = Column('fromaddr', String(32))
# depa = Column('depa', String(32), index=True)
# dsta = Column('dsta', String(32), index=True)
# eta = Column('eta', String(32))
# gtout = Column('gtout', String(32))
# gtin = Column('gtin', String(32))
# wloff = Column('wloff', String(32))
# wlin = Column('wlin', String(32))
# lat = Column('lat', String(32))
# lon = Column('lon', String(32))
# alt = Column('alt', String(32))
# text = Column('text', Text, index=True)
# tail = Column('tail', String(32), index=True)
# flight = Column('flight', String(32), index=True)
# icao = Column('icao', String(32), index=True)
# freq = Column('freq', String(32), index=True)
# ack = Column('ack', String(32))
# mode = Column('mode', String(32))
# label = Column('label', String(32), index=True)
# block_id = Column('block_id', String(32))
# msgno = Column('msgno', String(32), index=True)
# is_response = Column('is_response', String(32))
# is_onground = Column('is_onground', String(32))
# error = Column('error', String(32))
# libacars = Column('libacars', Text)
# level = Column('level', String(32))

path_to_db = "/run/acars/messages.db"
print("[database] Checking to see if database needs upgrades")
upgraded = False
if os.path.isfile(path_to_db):
	try:
		conn = sqlite3.connect(path_to_db)

		cur = conn.cursor()
		columns = [i[1] for i in cur.execute('PRAGMA table_info(messages)')]

		if 'level' not in columns:
			print("[database] Adding level column")
			cur.execute('ALTER TABLE messages ADD COLUMN level TEXT')

		indexes = [i[1] for i in cur.execute('PRAGMA index_list(messages)')]

		if 'ix_messages_text' not in indexes:
			print("[database] Adding text index")
			upgraded = True
			cur.execute('CREATE INDEX "ix_messages_text" ON "messages" ("text"	DESC)')

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
