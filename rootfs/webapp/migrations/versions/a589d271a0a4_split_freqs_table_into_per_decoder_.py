"""Split freqs table into per-decoder tables

Revision ID: a589d271a0a4
Revises: 0fc8b7cae596
Create Date: 2026-02-02 11:47:04.970833

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a589d271a0a4"
down_revision: Union[str, Sequence[str], None] = "0fc8b7cae596"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Split the single 'freqs' table into per-decoder frequency tables.

    Strategy:
    1. Create 5 new per-decoder tables (freqs_acars, freqs_vdlm2, freqs_hfdl, freqs_imsl, freqs_irdm)
    2. Migrate data from 'freqs' based on 'freq_type' column
    3. Drop the old 'freqs' table
    4. Create indexes on freq columns for fast lookups
    """

    # Create per-decoder frequency tables
    op.create_table(
        "freqs_acars",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("freq", sa.String(length=32), nullable=True),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "freqs_vdlm2",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("freq", sa.String(length=32), nullable=True),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "freqs_hfdl",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("freq", sa.String(length=32), nullable=True),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "freqs_imsl",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("freq", sa.String(length=32), nullable=True),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "freqs_irdm",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("freq", sa.String(length=32), nullable=True),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # Migrate data from old freqs table to per-decoder tables
    # Map freq_type values to table names
    freq_type_mapping = {
        "ACARS": "freqs_acars",
        "VDL-M2": "freqs_vdlm2",
        "VDLM2": "freqs_vdlm2",  # Handle both naming conventions
        "HFDL": "freqs_hfdl",
        "IMSL": "freqs_imsl",
        "IRDM": "freqs_irdm",
    }

    # Insert data into each per-decoder table
    for freq_type, table_name in freq_type_mapping.items():
        op.execute(
            f"""
            INSERT INTO {table_name} (freq, count)
            SELECT freq, count
            FROM freqs
            WHERE freq_type = '{freq_type}'
        """
        )

    # Create indexes on freq columns for fast lookups
    op.create_index("ix_freqs_acars_freq", "freqs_acars", ["freq"])
    op.create_index("ix_freqs_vdlm2_freq", "freqs_vdlm2", ["freq"])
    op.create_index("ix_freqs_hfdl_freq", "freqs_hfdl", ["freq"])
    op.create_index("ix_freqs_imsl_freq", "freqs_imsl", ["freq"])
    op.create_index("ix_freqs_irdm_freq", "freqs_irdm", ["freq"])

    # Drop the old freqs table
    op.drop_table("freqs")


def downgrade() -> None:
    """
    Restore the single 'freqs' table from per-decoder tables.

    Strategy:
    1. Recreate the old 'freqs' table with 'freq_type' column
    2. Copy data from all 5 per-decoder tables back to 'freqs'
    3. Drop the per-decoder tables
    """

    # Recreate the old freqs table
    op.create_table(
        "freqs",
        sa.Column("it", sa.Integer(), nullable=False),
        sa.Column("freq", sa.String(length=32), nullable=True),
        sa.Column("freq_type", sa.String(length=32), nullable=True),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("it"),
    )

    # Copy data from per-decoder tables back to freqs
    # Using the correct freq_type values for each decoder
    op.execute(
        """
        INSERT INTO freqs (freq, freq_type, count)
        SELECT freq, 'ACARS', count FROM freqs_acars
    """
    )

    op.execute(
        """
        INSERT INTO freqs (freq, freq_type, count)
        SELECT freq, 'VDL-M2', count FROM freqs_vdlm2
    """
    )

    op.execute(
        """
        INSERT INTO freqs (freq, freq_type, count)
        SELECT freq, 'HFDL', count FROM freqs_hfdl
    """
    )

    op.execute(
        """
        INSERT INTO freqs (freq, freq_type, count)
        SELECT freq, 'IMSL', count FROM freqs_imsl
    """
    )

    op.execute(
        """
        INSERT INTO freqs (freq, freq_type, count)
        SELECT freq, 'IRDM', count FROM freqs_irdm
    """
    )

    # Drop indexes (will be dropped with tables anyway)
    op.drop_index("ix_freqs_irdm_freq", table_name="freqs_irdm")
    op.drop_index("ix_freqs_imsl_freq", table_name="freqs_imsl")
    op.drop_index("ix_freqs_hfdl_freq", table_name="freqs_hfdl")
    op.drop_index("ix_freqs_vdlm2_freq", table_name="freqs_vdlm2")
    op.drop_index("ix_freqs_acars_freq", table_name="freqs_acars")

    # Drop per-decoder tables
    op.drop_table("freqs_irdm")
    op.drop_table("freqs_imsl")
    op.drop_table("freqs_hfdl")
    op.drop_table("freqs_vdlm2")
    op.drop_table("freqs_acars")
