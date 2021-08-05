#!/usr/bin/env python3

import sqlite3
import os
import sys
import time

DB_SAVE_DAYS = float(os.getenv("DB_SAVE_DAYS", default=7))
DB_ALERT_SAVE_DAYS = float(os.getenv("DB_ALERT_SAVE_DAYS", default=120))
DB_PRUNE_LIMIT = int(os.getenv("DB_PRUNE_LIMIT", default=500))

DEBUG_LOGGING = bool(os.getenv("DEBUG_LOGGING", default=False))

if os.getenv("SPAM", default=False):
    path_to_db = os.getenv("DB_PATH")
else:
    path_to_db = "/run/acars/messages.db"

def pruneTable(cursor, conn, table, days, print_name):
    import datetime

    total = 0

    cutoff = (datetime.datetime.now() - datetime.timedelta(days=days)).timestamp()

    while True:
        before = time.time()
        result = cursor.execute(
            f"DELETE FROM {table} WHERE msg_time < {cutoff} LIMIT {DB_PRUNE_LIMIT};"
        )
        conn.commit()

        changes = cursor.execute(
            f"SELECT changes();"
        )
        count = 0
        for row in changes:
            count = row[0]

        total += count

        elapsed = time.time() - before
        if count > 0:
            print(f"Pruned {print_name} of {count} records older than {days:.0f} days in {elapsed:.3f} seconds")
            sys.stdout.flush()

        if count < DB_PRUNE_LIMIT:
            break

        time.sleep(0.2)

try:
    while not os.path.isfile(path_to_db):
        time.sleep(30)

    conn = sqlite3.connect(database=path_to_db, timeout=120.0)
    cursor = conn.cursor()

    while True:
        if DEBUG_LOGGING:
            print(f"Started database pruning")
            sys.stdout.flush()

        pruneTable(cursor, conn, table="messages", days=DB_SAVE_DAYS, print_name="main database")
        pruneTable(cursor, conn, table="messages_saved", days=DB_ALERT_SAVE_DAYS, print_name="alerts database")

        if DEBUG_LOGGING:
            print(f"Finished database pruning")
            sys.stdout.flush()

        time.sleep(900)

    conn.close()

except Exception as e:
    print(f"ERROR PRUNING DB. {e}")
    sys.stdout.flush()
    conn.close()
    raise e
    sys.exit(1)

sys.exit(0)
