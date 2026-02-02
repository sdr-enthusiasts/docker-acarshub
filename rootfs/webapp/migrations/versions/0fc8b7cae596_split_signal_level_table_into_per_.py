"""Split signal level table into per-decoder tables

Revision ID: 0fc8b7cae596
Revises: e7991f1644b1
Create Date: 2026-02-02 11:31:40.223243

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0fc8b7cae596'
down_revision: Union[str, Sequence[str], None] = 'e7991f1644b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Split signal level table into per-decoder tables.

    Strategy:
    - Drop old 'level' table (no decoder column, can't migrate that data)
    - Create 5 new per-decoder tables: level_acars, level_vdlm2, level_hfdl, level_imsl, level_irdm
    - Rebuild signal level statistics from messages table (which has message_type column)
    - Each table stores: level (float), count (integer)
    """
    from sqlalchemy import text

    # Get connection for raw SQL queries
    conn = op.get_bind()

    # Drop the old level table (can't migrate - no decoder column)
    op.drop_table('level')

    # Create per-decoder signal level tables
    # All decoders use the same schema: id (PK), level (REAL/float), count (INTEGER)

    # ACARS - Classic VHF ACARS
    op.create_table('level_acars',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('level', sa.Float(), nullable=True),
        sa.Column('count', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # VDL-M2 - VHF Data Link Mode 2
    op.create_table('level_vdlm2',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('level', sa.Float(), nullable=True),
        sa.Column('count', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # HFDL - HF Data Link
    op.create_table('level_hfdl',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('level', sa.Float(), nullable=True),
        sa.Column('count', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # IMSL - Inmarsat L-Band (satellite)
    op.create_table('level_imsl',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('level', sa.Float(), nullable=True),
        sa.Column('count', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # IRDM - Iridium (satellite)
    op.create_table('level_irdm',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('level', sa.Float(), nullable=True),
        sa.Column('count', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes on level column for each table (for fast lookups by signal level)
    op.create_index('ix_level_acars_level', 'level_acars', ['level'], unique=False)
    op.create_index('ix_level_vdlm2_level', 'level_vdlm2', ['level'], unique=False)
    op.create_index('ix_level_hfdl_level', 'level_hfdl', ['level'], unique=False)
    op.create_index('ix_level_imsl_level', 'level_imsl', ['level'], unique=False)
    op.create_index('ix_level_irdm_level', 'level_irdm', ['level'], unique=False)

    # Rebuild signal level statistics from messages table
    # Map decoder types to their table names
    decoder_to_table = {
        'ACARS': 'level_acars',
        'VDL-M2': 'level_vdlm2',
        'VDLM2': 'level_vdlm2',  # Alternative spelling
        'HFDL': 'level_hfdl',
        'IMSL': 'level_imsl',
        'IRDM': 'level_irdm',
    }

    # For each decoder type, aggregate signal levels from messages
    for message_type, table_name in decoder_to_table.items():
        # Query messages table for this decoder type and aggregate by level
        query = text(f"""
            INSERT INTO {table_name} (level, count)
            SELECT CAST(level AS REAL) as level_float, COUNT(*) as msg_count
            FROM messages
            WHERE message_type = :msg_type
              AND level IS NOT NULL
              AND level != ''
            GROUP BY level_float
        """)
        conn.execute(query, {'msg_type': message_type})


def downgrade() -> None:
    """Rollback to single level table.

    WARNING: This will lose all per-decoder signal level data!
    """
    # Drop indexes
    op.drop_index('ix_level_irdm_level', table_name='level_irdm')
    op.drop_index('ix_level_imsl_level', table_name='level_imsl')
    op.drop_index('ix_level_hfdl_level', table_name='level_hfdl')
    op.drop_index('ix_level_vdlm2_level', table_name='level_vdlm2')
    op.drop_index('ix_level_acars_level', table_name='level_acars')

    # Drop all per-decoder tables
    op.drop_table('level_irdm')
    op.drop_table('level_imsl')
    op.drop_table('level_hfdl')
    op.drop_table('level_vdlm2')
    op.drop_table('level_acars')

    # Recreate the old level table (empty)
    op.create_table('level',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('level', sa.Integer(), nullable=True),
        sa.Column('count', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
