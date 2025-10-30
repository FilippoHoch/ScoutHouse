"""Refactor structure indoor/outdoor fields and amenities"""

from __future__ import annotations

from typing import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20240701_0012"
down_revision: str | None = "20240611_0011"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("structures", "beds", new_column_name="indoor_beds")
    op.alter_column("structures", "bathrooms", new_column_name="indoor_bathrooms")
    op.alter_column("structures", "showers", new_column_name="indoor_showers")

    fire_policy_enum = sa.Enum(
        "allowed",
        "with_permit",
        "forbidden",
        name="fire_policy",
    )
    water_source_enum = sa.Enum(
        "none",
        "fountain",
        "tap",
        "river",
        name="water_source",
    )

    bind = op.get_bind()
    fire_policy_enum.create(bind, checkfirst=True)
    water_source_enum.create(bind, checkfirst=True)

    op.add_column(
        "structures",
        sa.Column("hot_water", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "structures",
        sa.Column("land_area_m2", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column("max_tents", sa.Integer(), nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column(
            "shelter_on_field",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "structures",
        sa.Column("toilets_on_field", sa.Integer(), nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column("water_source", water_source_enum, nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column(
            "electricity_available",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "structures",
        sa.Column("fire_policy", fire_policy_enum, nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column(
            "access_by_car",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "structures",
        sa.Column(
            "access_by_coach",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "structures",
        sa.Column(
            "access_by_public_transport",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "structures",
        sa.Column(
            "coach_turning_area",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "structures",
        sa.Column("max_vehicle_height_m", sa.Numeric(4, 2), nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column("nearest_bus_stop", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column(
            "winter_open",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "structures",
        sa.Column(
            "weekend_only",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "structures",
        sa.Column(
            "has_field_poles",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "structures",
        sa.Column("notes_logistics", sa.Text(), nullable=True),
    )

    op.execute("DROP INDEX IF EXISTS ix_structures_province")
    op.execute("DROP INDEX IF EXISTS ix_structures_type")

    op.create_index(
        "ix_structures_province",
        "structures",
        ["province"],
        postgresql_where=sa.text("province IS NOT NULL"),
    )
    op.create_index(
        "ix_structures_type",
        "structures",
        ["type"],
        postgresql_where=sa.text("type IS NOT NULL"),
    )
    op.create_index(
        "ix_structures_fire_policy",
        "structures",
        ["fire_policy"],
        postgresql_where=sa.text("fire_policy IS NOT NULL"),
    )
    op.create_index(
        "ix_structures_access_by_coach",
        "structures",
        ["access_by_coach"],
        postgresql_where=sa.text("access_by_coach IS TRUE"),
    )
    op.create_index(
        "ix_structures_access_by_public_transport",
        "structures",
        ["access_by_public_transport"],
        postgresql_where=sa.text("access_by_public_transport IS TRUE"),
    )

    op.alter_column("structures", "hot_water", server_default=None)
    op.alter_column("structures", "shelter_on_field", server_default=None)
    op.alter_column("structures", "electricity_available", server_default=None)
    op.alter_column("structures", "access_by_car", server_default=None)
    op.alter_column("structures", "access_by_coach", server_default=None)
    op.alter_column("structures", "access_by_public_transport", server_default=None)
    op.alter_column("structures", "coach_turning_area", server_default=None)
    op.alter_column("structures", "winter_open", server_default=None)
    op.alter_column("structures", "weekend_only", server_default=None)
    op.alter_column("structures", "has_field_poles", server_default=None)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_structures_access_by_public_transport")
    op.execute("DROP INDEX IF EXISTS ix_structures_access_by_coach")
    op.execute("DROP INDEX IF EXISTS ix_structures_fire_policy")
    op.execute("DROP INDEX IF EXISTS ix_structures_type")
    op.execute("DROP INDEX IF EXISTS ix_structures_province")

    op.create_index(
        "ix_structures_type",
        "structures",
        ["type"],
    )
    op.create_index(
        "ix_structures_province",
        "structures",
        ["province"],
    )

    op.drop_column("structures", "notes_logistics")
    op.drop_column("structures", "has_field_poles")
    op.drop_column("structures", "weekend_only")
    op.drop_column("structures", "winter_open")
    op.drop_column("structures", "nearest_bus_stop")
    op.drop_column("structures", "max_vehicle_height_m")
    op.drop_column("structures", "coach_turning_area")
    op.drop_column("structures", "access_by_public_transport")
    op.drop_column("structures", "access_by_coach")
    op.drop_column("structures", "access_by_car")
    op.drop_column("structures", "fire_policy")
    op.drop_column("structures", "electricity_available")
    op.drop_column("structures", "water_source")
    op.drop_column("structures", "toilets_on_field")
    op.drop_column("structures", "shelter_on_field")
    op.drop_column("structures", "max_tents")
    op.drop_column("structures", "land_area_m2")
    op.drop_column("structures", "hot_water")

    bind = op.get_bind()
    fire_policy_enum = sa.Enum(
        "allowed",
        "with_permit",
        "forbidden",
        name="fire_policy",
    )
    water_source_enum = sa.Enum(
        "none",
        "fountain",
        "tap",
        "river",
        name="water_source",
    )

    fire_policy_enum.drop(bind, checkfirst=True)
    water_source_enum.drop(bind, checkfirst=True)

    op.alter_column("structures", "indoor_showers", new_column_name="showers")
    op.alter_column("structures", "indoor_bathrooms", new_column_name="bathrooms")
    op.alter_column("structures", "indoor_beds", new_column_name="beds")
