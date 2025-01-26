#!/usr/bin/env python3

# This script is designed to ensure the database for the user
# Is on the current schema

import sqlite3
from sqlite3 import Connection
from typing import List
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "../webapp/"))

import acarshub_logging  # noqa: E402
from acarshub_logging import LOG_LEVEL  # noqa: E402

# Current schema:
# LEGACY DBS WILL NOT HAVE COLUMNS SET AS NOT NULLABLE BUT WE TAKE CARE OF THAT BELOW
# AND ALSO WITH UPDATED writes in acarshub_db.py

# __tablename__ = 'messages'
# id = Column(Integer, primary_key=True)
# # ACARS or VDLM
# message_type = Column('message_type', String(32), nullable=False)
# # message time
# time = Column('msg_time', Integer, nullable=False)
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

# __tablename__ = "messages_saved"
# id = Column(Integer, primary_key=True)
# # ACARS or VDLM
# message_type = Column("message_type", String(32), nullable=False)
# # message time
# time = Column("msg_time", Integer, nullable=False)
# station_id = Column("station_id", String(32), nullable=False)
# toaddr = Column("toaddr", String(32), nullable=False)
# fromaddr = Column("fromaddr", String(32), nullable=False)
# depa = Column("depa", String(32), index=True, nullable=False)
# dsta = Column("dsta", String(32), index=True, nullable=False)
# eta = Column("eta", String(32), nullable=False)
# gtout = Column("gtout", String(32), nullable=False)
# gtin = Column("gtin", String(32), nullable=False)
# wloff = Column("wloff", String(32), nullable=False)
# wlin = Column("wlin", String(32), nullable=False)
# lat = Column("lat", String(32), nullable=False)
# lon = Column("lon", String(32), nullable=False)
# alt = Column("alt", String(32), nullable=False)
# text = Column("msg_text", Text, index=True, nullable=False)
# tail = Column("tail", String(32), index=True, nullable=False)
# flight = Column("flight", String(32), index=True, nullable=False)
# icao = Column("icao", String(32), index=True, nullable=False)
# freq = Column("freq", String(32), index=True, nullable=False)
# ack = Column("ack", String(32), nullable=False)
# mode = Column("mode", String(32), nullable=False)
# label = Column("label", String(32), index=True, nullable=False)
# block_id = Column("block_id", String(32), nullable=False)
# msgno = Column("msgno", String(32), index=True, nullable=False)
# is_response = Column("is_response", String(32), nullable=False)
# is_onground = Column("is_onground", String(32), nullable=False)
# error = Column("error", String(32), nullable=False)
# libacars = Column("libacars", Text, nullable=False)
# level = Column("level", String(32), nullable=False)
# term = Column("term", String(32), nullable=False)
# type_of_match = Column("type_of_match", String(32), nullable=False)

if (
    os.getenv("LOCAL_TEST", default=False)
    and str(os.getenv("LOCAL_TEST", default=False)).upper() == "TRUE"
):
    path_to_db = os.getenv("DB_PATH")
else:
    path_to_db = "/run/acars/messages.db"

acarshub_logging.log("Checking to see if database needs upgrades", "db_upgrade")

upgraded = False
exit_code = 0
count_table = 'CREATE TABLE "count" ("id" INTEGER NOT NULL,"total" INTEGER, "errors" INTEGER, "good" INTEGER, PRIMARY KEY("id"));'
freq_table = 'CREATE TABLE "freqs" ("it" INTEGER NOT NULL, "freq" VARCHAR(32), "freq_type" VARCHAR(32), "count" INTEGER, PRIMARY KEY("it"));'
level_table = 'CREATE TABLE "level" ("id" INTEGER NOT NULL, "level" INTEGER, "count" INTEGER, PRIMARY KEY("id"));'
messages_table = 'CREATE TABLE "messages" ("id" INTEGER NOT NULL, "message_type" VARCHAR(32) NOT NULL, "msg_time" INTEGER NOT NULL, \
                "station_id" VARCHAR(32) NOT NULL, "toaddr" VARCHAR(32) NOT NULL, "fromaddr" VARCHAR(32) NOT NULL, "depa" VARCHAR(32) NOT NULL, \
                "dsta" VARCHAR(32) NOT NULL, "eta" VARCHAR(32) NOT NULL, "gtout" VARCHAR(32) NOT NULL, "gtin" VARCHAR(32) NOT NULL, \
                "wloff" VARCHAR(32) NOT NULL, "wlin" VARCHAR(32) NOT NULL, "lat" VARCHAR(32) NOT NULL, "lon" VARCHAR(32) NOT NULL, \
                "alt" VARCHAR(32) NOT NULL, "msg_text" TEXT NOT NULL, "tail" VARCHAR(32) NOT NULL, "flight" VARCHAR(32) NOT NULL, \
                "icao" VARCHAR(32) NOT NULL, "freq" VARCHAR(32) NOT NULL, "ack" VARCHAR(32) NOT NULL, "mode" VARCHAR(32) NOT NULL, \
                "label" VARCHAR(32) NOT NULL, "block_id" VARCHAR(32) NOT NULL, "msgno" VARCHAR(32) NOT NULL, "is_response" VARCHAR(32) NOT NULL, \
                "is_onground" VARCHAR(32) NOT NULL, "error" VARCHAR(32) NOT NULL, "libacars" TEXT NOT NULL,"level" VARCHAR(32) NOT NULL, \
                PRIMARY KEY("id"));'
messages_saved_table = 'CREATE TABLE "messages_saved" ("id" INTEGER NOT NULL, "message_type" VARCHAR(32) NOT NULL, "msg_time" INTEGER NOT NULL, \
                "station_id" VARCHAR(32) NOT NULL, "toaddr" VARCHAR(32) NOT NULL, "fromaddr" VARCHAR(32) NOT NULL, "depa" VARCHAR(32) NOT NULL, \
                "dsta" VARCHAR(32) NOT NULL, "eta" VARCHAR(32) NOT NULL, "gtout" VARCHAR(32) NOT NULL, "gtin" VARCHAR(32) NOT NULL, "wloff" VARCHAR(32) NOT NULL, \
             "wlin" VARCHAR(32) NOT NULL, "lat" VARCHAR(32) NOT NULL, "lon" VARCHAR(32) NOT NULL, "alt" VARCHAR(32) NOT NULL, "msg_text" TEXT NOT NULL,\
                "tail" VARCHAR(32) NOT NULL, "flight" VARCHAR(32) NOT NULL, "icao" VARCHAR(32) NOT NULL, "freq" VARCHAR(32) NOT NULL, "ack" VARCHAR(32) NOT NULL, \
             "mode" VARCHAR(32) NOT NULL, "label" VARCHAR(32) NOT NULL, "block_id" VARCHAR(32) NOT NULL, "msgno" VARCHAR(32) NOT NULL, "is_response" VARCHAR(32) NOT NULL, \
                "is_onground" VARCHAR(32) NOT NULL, "error" VARCHAR(32) NOT NULL, "libacars" TEXT NOT NULL, "level" VARCHAR(32) NOT NULL, "term" VARCHAR(32) NOT NULL, \
                "type_of_match" VARCHAR(32) NOT NULL, PRIMARY KEY("id"));'


def enable_fts(db: Connection, table: str, columns: List[str]):
    column_list_without = ",".join(
        f"{c}" for c in columns if c.find(" UNINDEXED") == -1
    )
    acarshub_logging.log(
        "Creating new FTS table", "db_upgrade", level=LOG_LEVEL["INFO"]
    )

    db.executescript(
        """
        CREATE VIRTUAL TABLE {table}_fts USING fts5
        (
            {column_list},
            content={table},
            content_rowid={rowid}
        )""".format(
            table=table, column_list=column_list_without, rowid="id"
        )
    )
    acarshub_logging.log("Creating new triggers", "db_upgrade", level=LOG_LEVEL["INFO"])

    db.executescript(
        """
        CREATE TRIGGER {table}_fts_insert AFTER INSERT ON messages
        BEGIN
            INSERT INTO {table}_fts (rowid, {column_list}) VALUES (new.id, {new_columns});
        END;
        CREATE TRIGGER {table}_fts_delete AFTER DELETE ON messages
        BEGIN
            INSERT INTO {table}_fts ({table}_fts, rowid, {column_list}) VALUES ('delete', old.id, {old_columns});
        END;
        CREATE TRIGGER {table}_fts_update AFTER UPDATE ON messages
        BEGIN
            INSERT INTO {table}_fts ({table}_fts, rowid, {column_list}) VALUES ('delete', old.id, {old_columns});
            INSERT INTO {table}_fts (rowid, {column_list}) VALUES (new.id, {new_columns});
        END;
    """.format(
            table=table,
            column_list=column_list_without,
            new_columns=",".join(
                f"new.{c}" for c in columns if c.find(" UNINDEXED") == -1
            ),
            old_columns=",".join(
                f"old.{c}" for c in columns if c.find(" UNINDEXED") == -1
            ),
        )
    )
    acarshub_logging.log(
        "Populating new FTS table with data", "db_upgrade", level=LOG_LEVEL["INFO"]
    )
    db.executescript('INSERT INTO messages_fts(messages_fts) VALUES ("rebuild")')


def check_tables(conn, cur):
    global upgraded
    columns = [
        "message_type UNINDEXED",
        "msg_time," "station_id UNINDEXED",
        "toaddr UNINDEXED",
        "fromaddr UNINDEXED",
        "depa",
        "dsta",
        "eta UNINDEXED",
        "gtout UNINDEXED",
        "gtin UNINDEXED",
        "wloff UNINDEXED",
        "wlin UNINDEXED",
        "lat UNINDEXED",
        "lon UNINDEXED",
        "alt UNINDEXED",
        "msg_text",
        "tail",
        "flight",
        "icao",
        "freq",
        "ack UNINDEXED",
        "mode UNINDEXED",
        "label",
        "block_id UNINDEXED",
        "msgno UNINDEXED",
        "is_response UNINDEXED",
        "is_onground UNINDEXED",
        "error UNINDEXED",
        "libacars UNINDEXED",
        "level UNINDEXED",
    ]
    tables = [
        i[0]
        for i in cur.execute(
            'SELECT name FROM sqlite_master WHERE type ="table" AND name NOT LIKE "sqlite_%"'
        )
    ]
    triggers = [
        i[1] for i in cur.execute("select * from sqlite_master where type = 'trigger';")
    ]

    if "text_fts" in tables:
        upgraded = True
        acarshub_logging.log(
            "Removing old FTS table", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        cur.execute('DROP TABLE "main"."text_fts";')

    if "message_ad" in triggers:
        upgraded = True
        acarshub_logging.log(
            "Removing AD trigger", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        cur.execute('DROP TRIGGER "main"."message_ad";')
    if "message_ai" in triggers:
        upgraded = True
        acarshub_logging.log(
            "Removing AI trigger", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        cur.execute('DROP TRIGGER "main"."message_ai";')
    if "message_au" in triggers:
        upgraded = True
        acarshub_logging.log(
            "Removing AU trigger", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        cur.execute('DROP TRIGGER "main"."message_au";')

    if "messages_fts" not in tables:
        upgraded = True
        acarshub_logging.log(
            "Adding in text search tables....may take a while",
            "db_upgrade",
            level=LOG_LEVEL["INFO"],
        )

        acarshub_logging.log(
            "creating virtual table", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        enable_fts(conn, "messages", columns)

    add_triggers(cur, conn, "messages", columns)


def de_null(cur):
    # we need to ensure the columns don't have any NULL values
    # Legacy db problems...
    acarshub_logging.log(
        "Ensuring no columns contain NULL values", "db_upgrade", level=LOG_LEVEL["INFO"]
    )
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
    acarshub_logging.log("done with de-nulling", "db_upgrade", level=LOG_LEVEL["INFO"])


def add_indexes(cur):
    global upgraded

    indexes = [i[1] for i in cur.execute("PRAGMA index_list(messages)")]

    if "ix_messages_msg_text" not in indexes:
        acarshub_logging.log("Adding text index", "db_upgrade", level=LOG_LEVEL["INFO"])
        upgraded = True
        cur.execute(
            'CREATE INDEX "ix_messages_msg_text" ON "messages" ("msg_text" DESC)'
        )

    if "ix_messages_icao" not in indexes:
        acarshub_logging.log("Adding icao index", "db_upgrade", level=LOG_LEVEL["INFO"])
        upgraded = True
        cur.execute('CREATE INDEX "ix_messages_icao" ON "messages" ("icao" DESC)')

    if "ix_messages_flight" not in indexes:
        acarshub_logging.log(
            "Adding flight index", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        upgraded = True
        cur.execute('CREATE INDEX "ix_messages_flight" ON "messages" ("flight" DESC)')

    if "ix_messages_tail" not in indexes:
        acarshub_logging.log("Adding tail index", "db_upgrade", level=LOG_LEVEL["INFO"])
        upgraded = True
        cur.execute('CREATE INDEX "ix_messages_tail" ON "messages" ("tail" DESC)')

    if "ix_messages_depa" not in indexes:
        acarshub_logging.log("Adding depa index", "db_upgrade", level=LOG_LEVEL["INFO"])
        upgraded = True
        cur.execute('CREATE INDEX "ix_messages_depa" ON "messages" ("depa" DESC)')

    if "ix_messages_dsta" not in indexes:
        acarshub_logging.log("Adding dsta index", "db_upgrade", level=LOG_LEVEL["INFO"])
        upgraded = True
        cur.execute('CREATE INDEX "ix_messages_dsta" ON "messages" ("dsta" DESC)')

    if "ix_messages_msgno" not in indexes:
        acarshub_logging.log(
            "Adding msgno index", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        upgraded = True
        cur.execute('CREATE INDEX "ix_messages_msgno" ON "messages" ("msgno" DESC)')

    if "ix_messages_freq" not in indexes:
        acarshub_logging.log("Adding freq index", "db_upgrade", level=LOG_LEVEL["INFO"])
        upgraded = True
        cur.execute('CREATE INDEX "ix_messages_freq" ON "messages" ("freq" DESC)')

    if "ix_messages_label" not in indexes:
        acarshub_logging.log(
            "Adding label index", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        upgraded = True
        cur.execute('CREATE INDEX "ix_messages_label" ON "messages" ("label" DESC)')
    if "ix_messages_label" not in indexes:
        acarshub_logging.log(
            "Adding msg time index", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        upgraded = True
        cur.execute(
            'CREATE INDEX "ix_messages_msgtime" ON "messages" ("msg_time" DESC)'
        )


def add_triggers(cur, db: Connection, table: str, columns: List[str]):
    global upgraded
    column_list_without = ",".join(
        f"{c}" for c in columns if c.find(" UNINDEXED") == -1
    )

    triggers = [
        i[1] for i in cur.execute("select * from sqlite_master where type = 'trigger';")
    ]
    execute_script = ""

    if f"{table}_fts_insert" not in triggers:
        execute_script += """
        CREATE TRIGGER {table}_fts_insert AFTER INSERT ON messages
        BEGIN
            INSERT INTO {table}_fts (rowid, {column_list}) VALUES (new.id, {new_columns});
        END;
        """.format(
            table=table,
            column_list=column_list_without,
            new_columns=",".join(
                f"new.{c}" for c in columns if c.find(" UNINDEXED") == -1
            ),
        )

    if f"{table}_fts_delete" not in triggers:
        execute_script += """
        CREATE TRIGGER {table}_fts_delete AFTER DELETE ON messages
        BEGIN
            INSERT INTO {table}_fts ({table}_fts, rowid, {column_list}) VALUES ('delete', old.id, {old_columns});
        END;
        """.format(
            table=table,
            column_list=column_list_without,
            old_columns=",".join(
                f"old.{c}" for c in columns if c.find(" UNINDEXED") == -1
            ),
        )

    if f"{table}_fts_update" not in triggers:
        execute_script += """
        CREATE TRIGGER {table}_fts_update AFTER UPDATE ON messages
        BEGIN
            INSERT INTO {table}_fts ({table}_fts, rowid, {column_list}) VALUES ('delete', old.id, {old_columns});
            INSERT INTO {table}_fts (rowid, {column_list}) VALUES (new.id, {new_columns});
        END;
        """.format(
            table=table,
            column_list=column_list_without,
            new_columns=",".join(
                f"new.{c}" for c in columns if c.find(" UNINDEXED") == -1
            ),
            old_columns=",".join(
                f"old.{c}" for c in columns if c.find(" UNINDEXED") == -1
            ),
        )
    if execute_script != "":
        upgraded = True
        acarshub_logging.log(
            "Inserting FTS triggers", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        db.executescript(execute_script)
        conn.executescript('INSERT INTO messages_fts(messages_fts) VALUES ("rebuild")')


def create_db(cur):
    global count_table
    global freq_table
    global level_table
    global messages_table
    global messages_saved_table
    cur.execute(count_table)
    cur.execute(freq_table)
    cur.execute(level_table)
    cur.execute(messages_table)
    cur.execute(messages_saved_table)


def normalize_freqs(cur):
    global upgraded
    global be_quiet
    # select freqs from messages and ensure there are three decimal places
    tables = ["messages", "messages_saved", "freqs"]
    for table in tables:
        acarshub_logging.log(
            f"Normalizing frequencies in {table}", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        cur.execute(
            f"""
            SELECT freq, count(*) as cnt
            FROM {table}
            GROUP BY freq
            """
        )
        freqs = cur.fetchall()
        for freq in freqs:
            freq_in_table = freq[0]
            if len(freq_in_table) != 7:
                upgraded = True
                adjusted_freq = freq_in_table.ljust(7, "0")
                cur.execute(
                    f"""
                    UPDATE {table}
                    SET freq = ?
                    WHERE freq = ?
                    """,
                    (adjusted_freq, freq_in_table),
                )

        acarshub_logging.log(
            f"Normalizing frequencies in {table} complete",
            "db_upgrade",
            level=LOG_LEVEL["INFO"],
        )


def optimize_db(cur):
    global upgraded
    acarshub_logging.log("Optimizing database", "db_upgrade", level=LOG_LEVEL["INFO"])
    cur.execute("insert into messages_fts(messages_fts) value('optimize')")


if __name__ == "__main__":
    try:
        if not os.path.isfile(path_to_db):
            conn = sqlite3.connect(path_to_db)
            cur = conn.cursor()
            create_db(cur)
        else:
            conn = sqlite3.connect(path_to_db)
            cur = conn.cursor()

        conn.commit()
        check_tables(conn, cur)
        conn.commit()
        de_null(cur)
        conn.commit()
        add_indexes(cur)
        conn.commit()
        normalize_freqs(cur)
        conn.commit()
        optimize_db(cur)
        conn.commit()

        result = [i for i in cur.execute("PRAGMA auto_vacuum")]
        if result[0][0] != 0 or (
            os.getenv("AUTO_VACUUM", default=False)
            and str(os.getenv("AUTO_VACUUM")).upper() == "TRUE"
        ):
            acarshub_logging.log(
                "Reclaiming disk space", "db_upgrade", level=LOG_LEVEL["INFO"]
            )
            cur.execute("PRAGMA auto_vacuum = '0';")
            cur.execute("VACUUM;")
        conn.commit()

        if upgraded:
            acarshub_logging.log(
                "Completed upgrading database structure",
                "db_upgrade",
                level=LOG_LEVEL["INFO"],
            )
        acarshub_logging.log(
            "Database structure did not require upgrades",
            "db_upgrade",
            level=LOG_LEVEL["INFO"],
        )
    except Exception as e:
        acarshub_logging.acars_traceback(e, "db_upgrade", level=LOG_LEVEL["ERROR"])
        exit_code = 1
    finally:
        if conn:
            conn.close()

    sys.exit(exit_code)
