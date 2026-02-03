#!/usr/bin/env python3

# Copyright (C) 2022-2026 Frederick Clausen II
# This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
#
# acarshub is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# acarshub is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

"""
Database initialization and migration script using Alembic.

This script replaces the legacy upgrade_db.py approach with proper Alembic migrations.

Workflow:
1. Check if database exists
2. If new database: Run all migrations from scratch
3. If existing database:
   - Check for alembic_version table
   - If no version: Stamp at initial revision (e7991f1644b1)
   - Run any pending migrations
4. Prune old messages (housekeeping)
5. Optimize FTS (if enabled)

Current migrations:
- e7991f1644b1: Initial schema
- 0fc8b7cae596: Split signal level table into per-decoder tables
- a589d271a0a4: Split freqs table into per-decoder tables
- 94d97e655180: Create messages_fts table and triggers
- 3168c906fb9e: Convert ICAO from decimal to hex string (enables partial search)

Exit codes:
0 - Success
1 - Critical error (database creation/migration failed)
"""

import os
import sys
import sqlite3
import datetime
import subprocess

# Add webapp directory to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), "../webapp/"))

import acarshub_logging  # noqa: E402
from acarshub_logging import LOG_LEVEL  # noqa: E402
import acarshub_configuration  # noqa: E402

# Determine database path
if (
    os.getenv("LOCAL_TEST", default=False)
    and str(os.getenv("LOCAL_TEST", default=False)).upper() == "TRUE"
):
    path_to_db = os.getenv("DB_PATH", "/run/acars/messages.db")
else:
    path_to_db = "/run/acars/messages.db"

# Set SQLALCHEMY_URL for Alembic
os.environ["SQLALCHEMY_URL"] = f"sqlite:///{path_to_db}"
os.environ["ACARSHUB_DB"] = f"sqlite:///{path_to_db}"

# Path to Alembic configuration
ALEMBIC_DIR = os.path.join(os.path.dirname(__file__), "../webapp")
INITIAL_REVISION = "e7991f1644b1"  # Initial schema revision

exit_code = 0


def run_alembic_command(args, check=True):
    """Run an Alembic command and return the result.

    Args:
        args: List of command arguments (e.g., ["current"], ["upgrade", "head"])
        check: If True, raise exception on non-zero exit code

    Returns:
        subprocess.CompletedProcess result
    """
    cmd = ["alembic"] + args
    acarshub_logging.log(
        f"Running: {' '.join(cmd)}", "db_upgrade", level=LOG_LEVEL["DEBUG"]
    )

    result = subprocess.run(
        cmd,
        cwd=ALEMBIC_DIR,
        capture_output=True,
        text=True,
        check=False,
    )

    # Log output
    if result.stdout:
        for line in result.stdout.strip().split("\n"):
            acarshub_logging.log(line, "db_upgrade", level=LOG_LEVEL["DEBUG"])

    if result.stderr:
        for line in result.stderr.strip().split("\n"):
            acarshub_logging.log(
                f"STDERR: {line}", "db_upgrade", level=LOG_LEVEL["WARNING"]
            )

    if check and result.returncode != 0:
        raise subprocess.CalledProcessError(
            result.returncode, cmd, result.stdout, result.stderr
        )

    return result


def database_exists():
    """Check if database file exists."""
    return os.path.isfile(path_to_db)


def has_alembic_version_table(conn):
    """Check if database has alembic_version table."""
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version';"
        )
        return cur.fetchone() is not None
    except Exception as e:
        acarshub_logging.log(
            f"Error checking alembic_version table: {e}",
            "db_upgrade",
            level=LOG_LEVEL["WARNING"],
        )
        return False


def get_current_revision(conn):
    """Get current Alembic revision from database.

    Returns:
        str: Current revision ID, or None if no revision
    """
    try:
        cur = conn.cursor()
        cur.execute("SELECT version_num FROM alembic_version;")
        result = cur.fetchone()
        return result[0] if result else None
    except Exception:
        return None


def has_legacy_tables(conn):
    """Check if database has legacy tables (messages, count, etc.).

    This helps detect databases that were created before Alembic but have content.
    """
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='messages';"
        )
        return cur.fetchone() is not None
    except Exception:
        return False


def initialize_new_database():
    """Initialize a new database with all migrations."""
    acarshub_logging.log(
        "Database does not exist - creating new database with Alembic migrations",
        "db_upgrade",
        level=LOG_LEVEL["INFO"],
    )

    try:
        # Run all migrations from scratch
        run_alembic_command(["upgrade", "head"])

        acarshub_logging.log(
            "Database created successfully", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        return True
    except subprocess.CalledProcessError as e:
        acarshub_logging.log(
            f"Failed to create database: {e}", "db_upgrade", level=LOG_LEVEL["ERROR"]
        )
        return False


def stamp_existing_database(conn):
    """Stamp an existing database at the initial revision.

    This is for databases that were created before Alembic was introduced.
    """
    acarshub_logging.log(
        f"Existing database has no Alembic version - stamping at initial revision ({INITIAL_REVISION})",
        "db_upgrade",
        level=LOG_LEVEL["INFO"],
    )

    try:
        run_alembic_command(["stamp", INITIAL_REVISION])

        acarshub_logging.log(
            "Database stamped successfully", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        return True
    except subprocess.CalledProcessError as e:
        acarshub_logging.log(
            f"Failed to stamp database: {e}", "db_upgrade", level=LOG_LEVEL["ERROR"]
        )
        return False


def upgrade_database():
    """Run pending Alembic migrations."""
    acarshub_logging.log(
        "Checking for pending migrations", "db_upgrade", level=LOG_LEVEL["INFO"]
    )

    try:
        # Check current revision
        result = run_alembic_command(["current"], check=False)
        current = result.stdout.strip()

        if "(head)" in current:
            acarshub_logging.log("Database is already at latest revision", "db_upgrade")
            return True

        # Run migrations
        acarshub_logging.log(
            "Running database migrations", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        run_alembic_command(["upgrade", "head"])

        acarshub_logging.log(
            "Database migrations completed", "db_upgrade", level=LOG_LEVEL["INFO"]
        )
        return True
    except subprocess.CalledProcessError as e:
        acarshub_logging.log(
            f"Failed to upgrade database: {e}", "db_upgrade", level=LOG_LEVEL["ERROR"]
        )
        return False


def prune_database(conn):
    """Remove old messages from database (housekeeping)."""
    try:
        acarshub_logging.log("Pruning old messages", "db_upgrade")

        cur = conn.cursor()

        # Check if messages table exists
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='messages';"
        )
        if cur.fetchone() is None:
            acarshub_logging.log(
                "Messages table not found - skipping pruning", "db_upgrade"
            )
            return True

        # Prune main messages table
        cutoff = (
            datetime.datetime.now()
            - datetime.timedelta(days=acarshub_configuration.DB_SAVE_DAYS)
        ).timestamp()

        result = cur.execute(
            f"SELECT COUNT(*) FROM messages WHERE msg_time < {cutoff};"
        )
        count = result.fetchone()[0]

        if count > 0:
            if count > 100000:
                acarshub_logging.log(
                    f"Deleting {count} old messages ... this might take a while",
                    "db_upgrade",
                    level=LOG_LEVEL["WARNING"],
                )
            else:
                acarshub_logging.log(f"Deleting {count} old messages", "db_upgrade")

            cur.execute(f"DELETE FROM messages WHERE msg_time < {cutoff};")

        # Prune saved messages (alerts) table if it exists
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_saved';"
        )
        if cur.fetchone() is not None:
            alert_cutoff = (
                datetime.datetime.now()
                - datetime.timedelta(days=acarshub_configuration.DB_ALERT_SAVE_DAYS)
            ).timestamp()

            cur.execute(f"DELETE FROM messages_saved WHERE msg_time < {alert_cutoff};")

        conn.commit()

        acarshub_logging.log("Database pruned", "db_upgrade")
        return True
    except Exception as e:
        acarshub_logging.log(
            f"Error pruning database: {e}",
            "db_upgrade",
            level=LOG_LEVEL["WARNING"],
        )
        return False


def optimize_fts(conn):
    """Optimize FTS tables (if enabled)."""
    try:
        if os.getenv("DB_FTS_OPTIMIZE", default="").lower() == "off":
            return True

        cur = conn.cursor()

        # Check if FTS table exists
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts';"
        )
        if cur.fetchone() is None:
            acarshub_logging.log(
                "FTS table not found - skipping optimization", "db_upgrade"
            )
            return True

        acarshub_logging.log("Optimizing FTS tables", "db_upgrade")
        cur.execute("INSERT INTO messages_fts(messages_fts) VALUES('optimize');")
        conn.commit()

        acarshub_logging.log("FTS optimization complete", "db_upgrade")
        return True
    except Exception as e:
        acarshub_logging.log(
            f"Error optimizing FTS: {e}", "db_upgrade", level=LOG_LEVEL["WARNING"]
        )
        return False


def vacuum_database(conn):
    """Run VACUUM if auto_vacuum is enabled."""
    try:
        cur = conn.cursor()

        result = cur.execute("PRAGMA auto_vacuum;").fetchone()
        auto_vacuum = result[0] if result else 0

        if auto_vacuum != 0 or (
            os.getenv("AUTO_VACUUM", default=False)
            and str(os.getenv("AUTO_VACUUM")).upper() == "TRUE"
        ):
            acarshub_logging.log(
                "Reclaiming disk space (consider turning off AUTO_VACUUM - it's usually not needed)",
                "db_upgrade",
                level=LOG_LEVEL["WARNING"],
            )

            # Disable auto_vacuum and run VACUUM
            cur.execute("PRAGMA auto_vacuum = 0;")
            cur.execute("VACUUM;")
            conn.commit()

            acarshub_logging.log("Disk space reclaimed", "db_upgrade")

        return True
    except Exception as e:
        acarshub_logging.log(
            f"Error running VACUUM: {e}", "db_upgrade", level=LOG_LEVEL["WARNING"]
        )
        return False


def main():
    """Main database initialization and migration workflow."""
    global exit_code

    acarshub_logging.log("Starting database initialization and migration", "db_upgrade")

    conn = None
    try:
        # Check if database exists
        db_exists = database_exists()

        if not db_exists:
            # NEW DATABASE: Run all migrations from scratch
            if not initialize_new_database():
                exit_code = 1
                return
        else:
            # EXISTING DATABASE: Check version and upgrade if needed
            conn = sqlite3.connect(path_to_db)

            has_version = has_alembic_version_table(conn)
            has_legacy = has_legacy_tables(conn)

            if not has_version and has_legacy:
                # Legacy database - stamp at initial revision
                if not stamp_existing_database(conn):
                    exit_code = 1
                    return
            elif not has_version and not has_legacy:
                # Empty database created outside of this script
                acarshub_logging.log(
                    "Empty database found - initializing with migrations",
                    "db_upgrade",
                    level=LOG_LEVEL["INFO"],
                )
                if not initialize_new_database():
                    exit_code = 1
                    return

            # Run any pending migrations
            if not upgrade_database():
                exit_code = 1
                return

        # Re-open connection if needed
        if conn is None or not db_exists:
            conn = sqlite3.connect(path_to_db)

        # HOUSEKEEPING: Prune, optimize, vacuum
        prune_database(conn)
        optimize_fts(conn)
        vacuum_database(conn)

        acarshub_logging.log(
            "Database initialization and migration complete",
            "db_upgrade",
            level=LOG_LEVEL["INFO"],
        )

    except Exception as e:
        acarshub_logging.acars_traceback(e, "db_upgrade")
        exit_code = 1

    finally:
        if conn:
            conn.close()

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
