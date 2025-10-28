"""structure availability and cost options"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20240320_0003"
down_revision = "20240320_0002"
branch_labels = None
depends_on = None


structure_season = sa.Enum(
    "winter",
    "spring",
    "summer",
    "autumn",
    name="structure_season",
)

cost_model = sa.Enum(
    "per_person_day",
    "per_person_night",
    "forfait",
    name="structure_cost_model",
)


def upgrade() -> None:
    op.create_table(
        "structure_season_availability",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("structure_id", sa.Integer(), sa.ForeignKey("structures.id", ondelete="CASCADE"), nullable=False),
        sa.Column("season", structure_season, nullable=False),
        sa.Column("units", sa.JSON(), nullable=False),
        sa.Column("capacity_min", sa.Integer(), nullable=True),
        sa.Column("capacity_max", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_structure_season_availability_structure_id",
        "structure_season_availability",
        ["structure_id"],
    )
    op.create_index(
        "ix_structure_season_availability_season",
        "structure_season_availability",
        ["season"],
    )

    op.create_table(
        "structure_cost_option",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("structure_id", sa.Integer(), sa.ForeignKey("structures.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model", cost_model, nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="EUR"),
        sa.Column("deposit", sa.Numeric(10, 2), nullable=True),
        sa.Column("city_tax_per_night", sa.Numeric(10, 2), nullable=True),
        sa.Column("utilities_flat", sa.Numeric(10, 2), nullable=True),
        sa.Column("age_rules", sa.JSON(), nullable=True),
    )
    op.create_index(
        "ix_structure_cost_option_structure_id",
        "structure_cost_option",
        ["structure_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_structure_cost_option_structure_id", table_name="structure_cost_option")
    op.drop_table("structure_cost_option")
    cost_model.drop(op.get_bind(), checkfirst=False)

    op.drop_index("ix_structure_season_availability_season", table_name="structure_season_availability")
    op.drop_index(
        "ix_structure_season_availability_structure_id",
        table_name="structure_season_availability",
    )
    op.drop_table("structure_season_availability")
    structure_season.drop(op.get_bind(), checkfirst=False)
