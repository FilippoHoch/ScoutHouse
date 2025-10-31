"""Allow multiple water sources for structures"""

"""Allow multiple water sources for structures"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20240718_0014_water_sources"
down_revision = "20240715_0013_contacts_refactor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    water_source_enum = postgresql.ENUM(
        "none",
        "fountain",
        "tap",
        "river",
        name="water_source",
        create_type=False,
    )
    op.add_column(
        "structures",
        sa.Column(
            "water_sources",
            postgresql.ARRAY(water_source_enum),
            nullable=False,
            server_default="{}",
        ),
    )
    op.execute(
        "UPDATE structures SET water_sources = ARRAY[water_source]::water_source[] "
        "WHERE water_source IS NOT NULL;"
    )
    op.execute(
        "UPDATE structures SET water_sources = ARRAY[]::water_source[] WHERE water_source IS NULL;"
    )
    op.drop_column("structures", "water_source")


def downgrade() -> None:
    water_source_enum = postgresql.ENUM(
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
        "UPDATE structures SET water_source = water_sources[1] "
        "WHERE array_length(water_sources, 1) >= 1;"
    )
    op.drop_column("structures", "water_sources")
