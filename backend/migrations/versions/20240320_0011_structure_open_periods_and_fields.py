"""Add structure open periods and adjust structure fields"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision: str = "20240320_0011_structure_open_periods_and_fields"
down_revision: str | None = "20240701_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("structures", "dining_capacity", new_column_name="indoor_activity_rooms")

    op.drop_column("structures", "max_vehicle_height_m")
    op.drop_column("structures", "max_tents")
    op.drop_column("structures", "toilets_on_field")
    op.drop_column("structures", "winter_open")

    op.add_column(
        "structures",
        sa.Column(
            "pit_latrine_allowed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    bind = op.get_bind()
    kind_enum = sa.Enum(
        "season",
        "range",
        name="structure_open_period_kind",
    )
    season_enum = sa.Enum(
        "spring",
        "summer",
        "autumn",
        "winter",
        name="structure_open_period_season",
    )
    kind_enum.create(bind, checkfirst=True)
    season_enum.create(bind, checkfirst=True)

    kind_enum_column = sa.Enum(
        "season",
        "range",
        name="structure_open_period_kind",
        create_type=False,
    )
    season_enum_column = sa.Enum(
        "spring",
        "summer",
        "autumn",
        "winter",
        name="structure_open_period_season",
        create_type=False,
    )

    op.create_table(
        "structure_open_periods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "structure_id",
            sa.Integer(),
            sa.ForeignKey("structures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", kind_enum_column, nullable=False),
        sa.Column("season", season_enum_column, nullable=True),
        sa.Column("date_start", sa.Date(), nullable=True),
        sa.Column("date_end", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "(kind='season' AND season IS NOT NULL AND date_start IS NULL AND date_end IS NULL)"
            " OR (kind='range' AND season IS NULL AND date_start IS NOT NULL AND date_end IS NOT NULL AND date_start<=date_end)",
            name="ck_structure_open_periods_kind_constraints",
        ),
    )
    op.create_index(
        "ix_structure_open_periods_structure_kind",
        "structure_open_periods",
        ["structure_id", "kind"],
    )
    op.create_index(
        "ix_structure_open_periods_structure_season",
        "structure_open_periods",
        ["structure_id", "season"],
    )
    op.create_index(
        "ix_structure_open_periods_structure_dates",
        "structure_open_periods",
        ["structure_id", "date_start", "date_end"],
    )

    op.alter_column("structures", "pit_latrine_allowed", server_default=None)


def downgrade() -> None:
    op.alter_column("structures", "pit_latrine_allowed", server_default=sa.text("false"))

    op.drop_index("ix_structure_open_periods_structure_dates", table_name="structure_open_periods")
    op.drop_index("ix_structure_open_periods_structure_season", table_name="structure_open_periods")
    op.drop_index("ix_structure_open_periods_structure_kind", table_name="structure_open_periods")
    op.drop_table("structure_open_periods")

    bind = op.get_bind()
    season_enum = sa.Enum(name="structure_open_period_season")
    kind_enum = sa.Enum(name="structure_open_period_kind")
    season_enum.drop(bind, checkfirst=True)
    kind_enum.drop(bind, checkfirst=True)

    op.drop_column("structures", "pit_latrine_allowed")

    op.add_column(
        "structures",
        sa.Column("winter_open", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("structures", sa.Column("toilets_on_field", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("max_tents", sa.Integer(), nullable=True))
    op.add_column(
        "structures",
        sa.Column("max_vehicle_height_m", sa.Numeric(4, 2), nullable=True),
    )

    op.alter_column("structures", "indoor_activity_rooms", new_column_name="dining_capacity")
