"""convert_icao_to_hex_string

Revision ID: 3168c906fb9e
Revises: 94d97e655180
Create Date: 2026-02-03 16:30:57.164692

Convert ICAO column from decimal integer strings to hex strings.

Before: "11268872" (decimal representation)
After:  "ABF308" (hex representation)

This enables partial ICAO hex matching in search (e.g., "ABF" matches "ABF308").
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "3168c906fb9e"
down_revision: Union[str, Sequence[str], None] = "94d97e655180"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Convert ICAO from decimal to hex format."""
    connection = op.get_bind()

    # Convert messages table
    print("Converting ICAO values in messages table from decimal to hex...")
    connection.execute(
        text(
            """
        UPDATE messages
        SET icao = printf('%06X', CAST(icao AS INTEGER))
        WHERE icao != ''
        AND icao IS NOT NULL
        AND CAST(icao AS INTEGER) > 0
    """
        )
    )

    # Convert messages_saved table
    print("Converting ICAO values in messages_saved table from decimal to hex...")
    connection.execute(
        text(
            """
        UPDATE messages_saved
        SET icao = printf('%06X', CAST(icao AS INTEGER))
        WHERE icao != ''
        AND icao IS NOT NULL
        AND CAST(icao AS INTEGER) > 0
    """
        )
    )

    print("ICAO conversion to hex format complete.")


def downgrade() -> None:
    """Convert ICAO from hex back to decimal format."""
    connection = op.get_bind()

    # Convert messages table
    print("Converting ICAO values in messages table from hex to decimal...")
    connection.execute(
        text(
            """
        UPDATE messages
        SET icao = CAST(printf('%d', ('0x' || icao)) AS TEXT)
        WHERE icao != ''
        AND icao IS NOT NULL
        AND length(icao) = 6
    """
        )
    )

    # Convert messages_saved table
    print("Converting ICAO values in messages_saved table from hex to decimal...")
    connection.execute(
        text(
            """
        UPDATE messages_saved
        SET icao = CAST(printf('%d', ('0x' || icao)) AS TEXT)
        WHERE icao != ''
        AND icao IS NOT NULL
        AND length(icao) = 6
    """
        )
    )

    print("ICAO conversion to decimal format complete.")
