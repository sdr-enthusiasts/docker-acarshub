"""add_message_uids

Revision ID: 204a67756b9a
Revises: 3168c906fb9e
Create Date: 2026-02-05 16:21:55.110703

"""

from typing import Sequence, Union

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

    # Backfill UUIDs for existing messages using SQLite's randomblob() function
    # This generates UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    # where y is one of [8, 9, a, b] (variant bits)
    op.execute(
        """
        UPDATE messages
        SET uid = (
            SELECT lower(hex(randomblob(4))) || '-' ||
                   lower(hex(randomblob(2))) || '-4' ||
                   substr(lower(hex(randomblob(2))),2) || '-' ||
                   substr('89ab',abs(random()) % 4 + 1, 1) ||
                   substr(lower(hex(randomblob(2))),2) || '-' ||
                   lower(hex(randomblob(6)))
        )
        WHERE uid IS NULL
    """
    )

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
