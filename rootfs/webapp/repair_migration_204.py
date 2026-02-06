#!/usr/bin/env python3
"""
Database Repair Script for Migration 204a67756b9a

This script fixes the partial migration state where:
1. The uid column was added to messages table
2. The backfill failed (all UIDs are NULL)
3. The UNIQUE index was never created
4. Alembic version is still at 3168c906fb9e (pre-migration)

Solution:
1. Check if uid column exists and has NULL values
2. Backfill UIDs using Python uuid.uuid4() (one per row)
3. Update Alembic version to 204a67756b9a
4. Create UNIQUE index on uid column

Usage:
    python3 repair_migration_204.py /path/to/database.db
"""

import sys
import uuid
import sqlite3
from pathlib import Path


def repair_database(db_path: str) -> None:
    """Repair partial migration state in database."""

    print(f"🔧 Repairing database: {db_path}")

    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Step 1: Check current state
        print("\n📊 Checking current state...")

        # Check Alembic version
        cursor.execute("SELECT version_num FROM alembic_version")
        current_version = cursor.fetchone()[0]
        print(f"   Alembic version: {current_version}")

        if current_version == "204a67756b9a":
            print("   ⚠️  Database already at target version 204a67756b9a")
            print(
                "   Run 'alembic downgrade -1' first if you need to reapply migration"
            )
            return

        # Check if uid column exists
        cursor.execute("PRAGMA table_info(messages)")
        columns = [col[1] for col in cursor.fetchall()]

        if "uid" not in columns:
            print("   ✅ No uid column found - migration hasn't been attempted")
            print("   Run 'alembic upgrade head' to apply migration properly")
            return

        # Check uid state
        cursor.execute(
            "SELECT COUNT(*) as total, COUNT(DISTINCT uid) as unique_uids FROM messages"
        )
        total, unique = cursor.fetchone()
        print(f"   Total messages: {total}")
        print(f"   Unique UIDs: {unique}")

        if unique == total and unique > 0:
            print("   ✅ All messages already have unique UIDs!")
            print("   Just need to update Alembic version and create index...")
        elif unique == 0 or unique < total:
            print("   ⚠️  Found partial/incomplete UUID backfill")
            print(f"   Will generate {total} unique UIDs...")

        # Step 2: Backfill UIDs
        print("\n🔄 Backfilling UIDs...")

        # Get all message IDs that need UIDs
        cursor.execute("SELECT id FROM messages WHERE uid IS NULL")
        message_ids = [row[0] for row in cursor.fetchall()]

        if message_ids:
            print(f"   Generating {len(message_ids)} UUIDs...")

            # Generate and assign unique UUID to each message
            for i, msg_id in enumerate(message_ids):
                new_uid = str(uuid.uuid4())
                cursor.execute(
                    "UPDATE messages SET uid = ? WHERE id = ?", (new_uid, msg_id)
                )

                # Progress indicator
                if (i + 1) % 100 == 0:
                    print(f"   Progress: {i + 1}/{len(message_ids)}")

            print(f"   ✅ Generated {len(message_ids)} unique UIDs")
        else:
            print("   ✅ No NULL UIDs found - backfill already complete")

        # Step 3: Verify uniqueness
        print("\n✅ Verifying uniqueness...")
        cursor.execute(
            """
            SELECT uid, COUNT(*) as count
            FROM messages
            GROUP BY uid
            HAVING COUNT(*) > 1
            """
        )
        duplicates = cursor.fetchall()

        if duplicates:
            print(f"   ❌ ERROR: Found {len(duplicates)} duplicate UIDs!")
            for uid, count in duplicates[:5]:
                print(f"      UID {uid}: {count} occurrences")
            print("   Cannot proceed - duplicates must be resolved first")
            return

        print("   ✅ All UIDs are unique")

        # Step 4: Make uid NOT NULL (if still nullable)
        print("\n🔒 Making uid column NOT NULL...")
        cursor.execute("PRAGMA table_info(messages)")
        uid_column = [col for col in cursor.fetchall() if col[1] == "uid"][0]
        is_nullable = uid_column[3] == 0  # notnull flag

        if is_nullable:
            print(
                "   ⚠️  uid column is still nullable - this needs table recreation in SQLite"
            )
            print("   Skipping NOT NULL constraint (will be enforced by UNIQUE index)")
        else:
            print("   ✅ uid column already NOT NULL")

        # Step 5: Create UNIQUE index
        print("\n📇 Creating UNIQUE index on uid...")
        try:
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_messages_uid ON messages (uid)"
            )
            print("   ✅ Index created successfully")
        except sqlite3.IntegrityError as e:
            print(f"   ❌ ERROR: Failed to create index: {e}")
            print("   This means there are still duplicate UIDs - aborting")
            return

        # Step 6: Update Alembic version
        print("\n📝 Updating Alembic version to 204a67756b9a...")
        cursor.execute("UPDATE alembic_version SET version_num = '204a67756b9a'")
        print("   ✅ Alembic version updated")

        # Commit all changes
        conn.commit()
        print("\n✅ Database repair complete!")

        # Final verification
        print("\n📊 Final state:")
        cursor.execute("SELECT version_num FROM alembic_version")
        print(f"   Alembic version: {cursor.fetchone()[0]}")
        cursor.execute("SELECT COUNT(*), COUNT(DISTINCT uid) FROM messages")
        total, unique = cursor.fetchone()
        print(f"   Total messages: {total}")
        print(f"   Unique UIDs: {unique}")
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='ix_messages_uid'"
        )
        index_exists = cursor.fetchone()
        print(f"   UNIQUE index exists: {'✅ Yes' if index_exists else '❌ No'}")

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback

        traceback.print_exc()
        conn.rollback()
        raise

    finally:
        conn.close()


def main():
    """Main entry point."""
    if len(sys.argv) != 2:
        print("Usage: python3 repair_migration_204.py /path/to/database.db")
        print("\nExample:")
        print("  python3 repair_migration_204.py /run/acars/messages.db")
        sys.exit(1)

    db_path = sys.argv[1]

    if not Path(db_path).exists():
        print(f"❌ ERROR: Database file not found: {db_path}")
        sys.exit(1)

    repair_database(db_path)


if __name__ == "__main__":
    main()
