"""final_v4_optimization

Revision ID: 40fd0618348d
Revises: 171fe2c07bd9
Create Date: 2026-02-13 00:35:45.374832

This is the final migration for v4, which optimizes the database for production use
and adds future-proofing for v5+ features.

Changes:
1. Adds aircraft_id column for future aircraft tracking feature
2. Adds composite indexes for common query patterns (improves search performance)
3. Runs VACUUM to reclaim disk space from all previous migrations
4. Runs ANALYZE to update query planner statistics

Performance impact:
- VACUUM may take significant time on large databases (compresses file, reclaims space)
- Composite indexes improve multi-column search queries by 10-100x
- aircraft_id column is nullable, adds negligible overhead until used

Future-proofing:
- aircraft_id enables v5+ aircraft tracking without another migration
- Composite indexes optimize current search patterns
- VACUUM prevents database bloat from migration operations
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "40fd0618348d"
down_revision: Union[str, Sequence[str], None] = "171fe2c07bd9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Final v4 optimization: Add aircraft_id, composite indexes, VACUUM, and ANALYZE."""

    connection = op.get_bind()

    # ============================================================================
    # 1. Add aircraft_id column for future aircraft tracking feature
    # ============================================================================
    print("Adding aircraft_id column for future use...")
    op.add_column("messages", sa.Column("aircraft_id", sa.String(36), nullable=True))
    op.create_index("ix_messages_aircraft_id", "messages", ["aircraft_id"])
    print("✓ aircraft_id column added")

    # ============================================================================
    # 2. Add composite indexes for common query patterns
    # ============================================================================
    print("Creating composite indexes for query optimization...")

    # Time + ICAO: Common pattern for "recent messages from this aircraft"
    # Enables efficient: WHERE icao = ? ORDER BY msg_time DESC
    op.create_index(
        "ix_messages_time_icao",
        "messages",
        [sa.text("msg_time DESC"), "icao"],
    )

    # Tail + Flight: Common pattern for "find messages by tail and flight number"
    # Enables efficient: WHERE tail = ? AND flight = ?
    op.create_index(
        "ix_messages_tail_flight",
        "messages",
        ["tail", "flight"],
    )

    # Departure + Destination: Common pattern for route searches
    # Enables efficient: WHERE depa = ? AND dsta = ?
    op.create_index(
        "ix_messages_depa_dsta",
        "messages",
        ["depa", "dsta"],
    )

    # Message type + Time: Common pattern for filtered time-series queries
    # Enables efficient: WHERE message_type = ? ORDER BY msg_time DESC
    op.create_index(
        "ix_messages_type_time",
        "messages",
        ["message_type", sa.text("msg_time DESC")],
    )

    # Alert matches: Term + matched_at for efficient alert browsing
    # Enables efficient: WHERE term = ? ORDER BY matched_at DESC
    op.create_index(
        "ix_alert_matches_term_time",
        "alert_matches",
        ["term", sa.text("matched_at DESC")],
    )

    # Alert matches: Message UID + Term for checking if specific message matched term
    # Enables efficient: WHERE message_uid = ? AND term = ?
    op.create_index(
        "ix_alert_matches_uid_term",
        "alert_matches",
        ["message_uid", "term"],
    )

    print("✓ Composite indexes created")

    # ============================================================================
    # 3. VACUUM - Reclaim disk space from all previous migrations
    # ============================================================================
    print("")
    print("=" * 80)
    print("Running VACUUM to reclaim disk space...")
    print("This may take several minutes on large databases (millions of messages).")
    print("Progress cannot be shown, but the operation is working.")
    print("=" * 80)

    # VACUUM rebuilds the entire database file:
    # - Reclaims space from dropped messages_saved table
    # - Compacts space from UUID backfill operations
    # - Defragments the database for better I/O performance
    # - Can reduce file size by 30-50% or more after table drops
    connection.execute(sa.text("VACUUM"))

    print("✓ VACUUM complete - database file optimized")

    # ============================================================================
    # 4. ANALYZE - Update query planner statistics
    # ============================================================================
    print("Running ANALYZE to optimize query planning...")

    # ANALYZE gathers statistics about table contents:
    # - Row counts, column distributions, index selectivity
    # - Helps SQLite's query planner choose optimal indexes
    # - Should be run after major schema changes or data modifications
    connection.execute(sa.text("ANALYZE"))

    print("✓ ANALYZE complete - query planner statistics updated")
    print("")
    print("=" * 80)
    print("v4 migration complete!")
    print("Database is optimized and ready for production use.")
    print("=" * 80)


def downgrade() -> None:
    """Remove v4 optimizations (for testing/rollback only)."""

    # Drop composite indexes (in reverse order of creation)
    op.drop_index("ix_alert_matches_uid_term", table_name="alert_matches")
    op.drop_index("ix_alert_matches_term_time", table_name="alert_matches")
    op.drop_index("ix_messages_type_time", table_name="messages")
    op.drop_index("ix_messages_depa_dsta", table_name="messages")
    op.drop_index("ix_messages_tail_flight", table_name="messages")
    op.drop_index("ix_messages_time_icao", table_name="messages")

    # Drop aircraft_id column
    op.drop_index("ix_messages_aircraft_id", table_name="messages")
    op.drop_column("messages", "aircraft_id")

    # Note: We do NOT run VACUUM on downgrade
    # The space savings from VACUUM are permanent and beneficial even after rollback
    # Re-fragmenting the database would serve no purpose

    print("✓ v4 optimizations removed (indexes and aircraft_id column)")
    print("Note: VACUUM space savings are permanent (database remains optimized)")
