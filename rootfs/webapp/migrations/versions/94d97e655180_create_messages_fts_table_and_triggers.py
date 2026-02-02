"""create_messages_fts_table_and_triggers

Revision ID: 94d97e655180
Revises: a589d271a0a4
Create Date: 2026-02-02 12:01:49.662490

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '94d97e655180'
down_revision: Union[str, Sequence[str], None] = 'a589d271a0a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create FTS5 virtual table and triggers for full-text search on messages.

    This creates:
    1. messages_fts virtual table with indexed columns
    2. Three triggers to keep FTS in sync with messages table (INSERT, UPDATE, DELETE)
    3. Populates the FTS table from existing messages

    Indexed columns (searchable):
    - msg_time, depa, dsta, msg_text, tail, flight, icao, freq, label

    Unindexed columns (stored but not searchable):
    - message_type, station_id, toaddr, fromaddr, eta, gtout, gtin, wloff, wlin,
      lat, lon, alt, ack, mode, block_id, msgno, is_response, is_onground, error,
      libacars, level

    Note: This migration may take a long time on large databases due to FTS rebuild.
    This migration is idempotent - it will skip creation if FTS table already exists.
    """
    # Check if FTS table already exists (for databases migrated from legacy upgrade_db.py)
    connection = op.get_bind()
    result = connection.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'")
    ).fetchone()

    if result:
        print("FTS table already exists, skipping FTS migration")
        return

    # Create the FTS5 virtual table
    # Using content=messages and content_rowid=id to link to messages table
    op.execute("""
        CREATE VIRTUAL TABLE messages_fts USING fts5
        (
            message_type UNINDEXED,
            msg_time,
            station_id UNINDEXED,
            toaddr UNINDEXED,
            fromaddr UNINDEXED,
            depa,
            dsta,
            eta UNINDEXED,
            gtout UNINDEXED,
            gtin UNINDEXED,
            wloff UNINDEXED,
            wlin UNINDEXED,
            lat UNINDEXED,
            lon UNINDEXED,
            alt UNINDEXED,
            msg_text,
            tail,
            flight,
            icao,
            freq,
            ack UNINDEXED,
            mode UNINDEXED,
            label,
            block_id UNINDEXED,
            msgno UNINDEXED,
            is_response UNINDEXED,
            is_onground UNINDEXED,
            error UNINDEXED,
            libacars UNINDEXED,
            level UNINDEXED,
            content=messages,
            content_rowid=id
        )
    """)

    # Create trigger for INSERT operations
    op.execute("""
        CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages
        BEGIN
            INSERT INTO messages_fts (
                rowid, message_type, msg_time, station_id, toaddr, fromaddr,
                depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
                msg_text, tail, flight, icao, freq, ack, mode, label,
                block_id, msgno, is_response, is_onground, error, libacars, level
            ) VALUES (
                new.id, new.message_type, new.msg_time, new.station_id, new.toaddr, new.fromaddr,
                new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin, new.lat, new.lon, new.alt,
                new.msg_text, new.tail, new.flight, new.icao, new.freq, new.ack, new.mode, new.label,
                new.block_id, new.msgno, new.is_response, new.is_onground, new.error, new.libacars, new.level
            );
        END;
    """)

    # Create trigger for DELETE operations
    op.execute("""
        CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages
        BEGIN
            INSERT INTO messages_fts (
                messages_fts, rowid, message_type, msg_time, station_id, toaddr, fromaddr,
                depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
                msg_text, tail, flight, icao, freq, ack, mode, label,
                block_id, msgno, is_response, is_onground, error, libacars, level
            ) VALUES (
                'delete', old.id, old.message_type, old.msg_time, old.station_id, old.toaddr, old.fromaddr,
                old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, old.wlin, old.lat, old.lon, old.alt,
                old.msg_text, old.tail, old.flight, old.icao, old.freq, old.ack, old.mode, old.label,
                old.block_id, old.msgno, old.is_response, old.is_onground, old.error, old.libacars, old.level
            );
        END;
    """)

    # Create trigger for UPDATE operations
    op.execute("""
        CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages
        BEGIN
            INSERT INTO messages_fts (
                messages_fts, rowid, message_type, msg_time, station_id, toaddr, fromaddr,
                depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
                msg_text, tail, flight, icao, freq, ack, mode, label,
                block_id, msgno, is_response, is_onground, error, libacars, level
            ) VALUES (
                'delete', old.id, old.message_type, old.msg_time, old.station_id, old.toaddr, old.fromaddr,
                old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, old.wlin, old.lat, old.lon, old.alt,
                old.msg_text, old.tail, old.flight, old.icao, old.freq, old.ack, old.mode, old.label,
                old.block_id, old.msgno, old.is_response, old.is_onground, old.error, old.libacars, old.level
            );
            INSERT INTO messages_fts (
                rowid, message_type, msg_time, station_id, toaddr, fromaddr,
                depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
                msg_text, tail, flight, icao, freq, ack, mode, label,
                block_id, msgno, is_response, is_onground, error, libacars, level
            ) VALUES (
                new.id, new.message_type, new.msg_time, new.station_id, new.toaddr, new.fromaddr,
                new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin, new.lat, new.lon, new.alt,
                new.msg_text, new.tail, new.flight, new.icao, new.freq, new.ack, new.mode, new.label,
                new.block_id, new.msgno, new.is_response, new.is_onground, new.error, new.libacars, new.level
            );
        END;
    """)

    # Populate FTS table from existing messages
    # This uses the FTS5 rebuild command to efficiently populate the table
    print("Rebuilding FTS index from existing messages... (this may take a while)")
    op.execute("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')")
    print("FTS index rebuild complete")


def downgrade() -> None:
    """Drop FTS table and triggers.

    This removes:
    1. All three triggers (INSERT, UPDATE, DELETE)
    2. The FTS virtual table and its internal tables

    Note: FTS5 virtual tables have internal shadow tables that are automatically
    cleaned up when the virtual table is dropped.
    """
    # Drop triggers first (must happen before dropping the table)
    op.execute("DROP TRIGGER IF EXISTS messages_fts_insert")
    op.execute("DROP TRIGGER IF EXISTS messages_fts_delete")
    op.execute("DROP TRIGGER IF EXISTS messages_fts_update")

    # Drop the FTS virtual table
    # This automatically drops the shadow tables:
    # - messages_fts_config
    # - messages_fts_data
    # - messages_fts_docsize
    # - messages_fts_idx
    op.execute("DROP TABLE IF EXISTS messages_fts")
