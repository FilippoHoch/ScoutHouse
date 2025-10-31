"""Structure water sources array

Revision ID: 20240820_0015
Revises: 20240730_0014
Create Date: 2024-08-20 00:15:00.000000
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20240820_0015"
down_revision: str | None = "20240730_0014"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    water_source_enum = sa.Enum(
        "none",
        "fountain",
        "tap",
        "river",
        name="water_source",
        create_type=False,
    )

    op.add_column(
        "structures",
        sa.Column("water_sources", sa.JSON(), nullable=True),
    )

    op.execute(
        """
        UPDATE structures
        SET water_sources = json_build_array(water_source)
        WHERE water_source IS NOT NULL
        """
    )

    op.drop_column("structures", "water_source")


def downgrade() -> None:
    water_source_enum = sa.Enum(
        "none",
        "fountain",
        "tap",
        "river",
        name="water_source",
        create_type=False,
    )

    op.add_column(
        "structures",
        sa.Column("water_source", water_source_enum, nullable=True),
    )

    op.execute(
        """
        UPDATE structures
        SET water_source = water_sources->>0
        WHERE water_sources IS NOT NULL AND json_array_length(water_sources) >= 1
        """
    )

    op.drop_column("structures", "water_sources")
