"""add_message_uids

Revision ID: 204a67756b9a
Revises: 3168c906fb9e
Create Date: 2026-02-05 16:21:55.110703

"""

from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "204a67756b9a"
down_revision: Union[str, Sequence[str], None] = "3168c906fb9e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add uid column to messages table with UUID generation.

    Note: We only add UID to messages table, not messages_saved, because:
    1. messages_saved will be dropped in the next migration (replaced by alert_matches)
    2. Existing messages_saved rows cannot be reliably linked to messages rows
    3. Old alert data will not be migrated (clean slate for new alert system)
    """

    # Add uid column to messages table (nullable initially for backfill)
    op.add_column("messages", sa.Column("uid", sa.String(36), nullable=True))

    # Backfill UUIDs for existing messages using Python to ensure uniqueness
    # SQLite's randomblob() in UPDATE evaluates once per statement, not per row,
    # which would create duplicate UIDs. We must use Python loop instead.
    connection = op.get_bind()

    # Get all message IDs that need UIDs
    result = connection.execute(sa.text("SELECT id FROM messages WHERE uid IS NULL"))
    message_ids = [row[0] for row in result]

    # Generate and assign unique UUID to each message
    for msg_id in message_ids:
        new_uid = str(uuid.uuid4())
        connection.execute(
            sa.text("UPDATE messages SET uid = :uid WHERE id = :id"),
            {"uid": new_uid, "id": msg_id},
        )

    # Commit the backfill
    connection.commit()

    # Make uid NOT NULL after backfill
    # SQLite requires table recreation for ALTER COLUMN
    with op.batch_alter_table("messages") as batch_op:
        batch_op.alter_column("uid", nullable=False)

    # Create unique index for fast lookups
    op.create_index("ix_messages_uid", "messages", ["uid"], unique=True)


def downgrade() -> None:
    """Remove uid column from messages table."""

    # Drop index first
    op.drop_index("ix_messages_uid", table_name="messages")

    # Drop uid column
    op.drop_column("messages", "uid")
