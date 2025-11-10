"""structure availability and cost options"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from migrations.utils.postgres import (
    create_enum_if_not_exists,
    create_index_if_not_exists,
    drop_enum_if_exists,
)

revision = "20240320_0003"
down_revision = "20240320_0002"
branch_labels = None
depends_on = None


STRUCTURE_SEASON_VALUES = ("winter", "spring", "summer", "autumn")
STRUCTURE_COST_MODEL_VALUES = ("per_person_day", "per_person_night", "forfait")


def upgrade() -> None:
    bind = op.get_bind()
    create_enum_if_not_exists("structure_season", STRUCTURE_SEASON_VALUES)
    create_enum_if_not_exists("structure_cost_model", STRUCTURE_COST_MODEL_VALUES)
    structure_season = postgresql.ENUM(
        *STRUCTURE_SEASON_VALUES, name="structure_season", create_type=False
    )
    structure_cost_model = postgresql.ENUM(
        *STRUCTURE_COST_MODEL_VALUES,
        name="structure_cost_model",
        create_type=False,
    )

    inspector = sa.inspect(bind)

    if not inspector.has_table("structure_season_availability"):
        op.create_table(
            "structure_season_availability",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "structure_id",
                sa.Integer(),
                sa.ForeignKey("structures.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("season", structure_season, nullable=False),
            sa.Column("units", sa.JSON(), nullable=False),
            sa.Column("capacity_min", sa.Integer(), nullable=True),
            sa.Column("capacity_max", sa.Integer(), nullable=True),
        )

    create_index_if_not_exists(
        "CREATE INDEX IF NOT EXISTS ix_structure_season_availability_structure_id "
        'ON "structure_season_availability" (structure_id)'
    )
    create_index_if_not_exists(
        "CREATE INDEX IF NOT EXISTS ix_structure_season_availability_season "
        'ON "structure_season_availability" (season)'
    )

    if not inspector.has_table("structure_cost_option"):
        op.create_table(
            "structure_cost_option",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "structure_id",
                sa.Integer(),
                sa.ForeignKey("structures.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("model", structure_cost_model, nullable=False),
            sa.Column("amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="EUR"),
            sa.Column("deposit", sa.Numeric(10, 2), nullable=True),
            sa.Column("city_tax_per_night", sa.Numeric(10, 2), nullable=True),
            sa.Column("utilities_flat", sa.Numeric(10, 2), nullable=True),
            sa.Column("age_rules", sa.JSON(), nullable=True),
        )

    create_index_if_not_exists(
        "CREATE INDEX IF NOT EXISTS ix_structure_cost_option_structure_id "
        'ON "structure_cost_option" (structure_id)'
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    op.execute("DROP INDEX IF EXISTS ix_structure_cost_option_structure_id")
    if inspector.has_table("structure_cost_option"):
        op.drop_table("structure_cost_option")

    op.execute("DROP INDEX IF EXISTS ix_structure_season_availability_season")
    op.execute("DROP INDEX IF EXISTS ix_structure_season_availability_structure_id")
    if inspector.has_table("structure_season_availability"):
        op.drop_table("structure_season_availability")

    drop_enum_if_exists("structure_cost_model")
    drop_enum_if_exists("structure_season")
