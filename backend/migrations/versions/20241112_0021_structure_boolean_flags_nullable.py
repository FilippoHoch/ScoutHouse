"""Allow nullable utility flags for structures

Revision ID: 20241112_0021
Revises: 20241105_0020
Create Date: 2024-11-12 00:21:00.000000
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


description = "Allow nullable utility flags for structures"
revision: str = "20241112_0021"
down_revision: str | None = "20241105_0020"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


FLAG_COLUMNS = [
    "has_kitchen",
    "hot_water",
    "shelter_on_field",
    "electricity_available",
    "access_by_car",
    "access_by_coach",
    "access_by_public_transport",
    "coach_turning_area",
    "weekend_only",
    "has_field_poles",
    "pit_latrine_allowed",
]


def upgrade() -> None:
    for column in FLAG_COLUMNS:
        op.alter_column(
            "structures",
            column,
            existing_type=sa.Boolean(),
            nullable=True,
            existing_server_default=sa.text("false"),
            server_default=None,
        )


def downgrade() -> None:
    for column in FLAG_COLUMNS:
        op.execute(
            sa.text(
                "UPDATE structures SET " + column + " = false WHERE " + column + " IS NULL"
            )
        )
        op.alter_column(
            "structures",
            column,
            existing_type=sa.Boolean(),
            nullable=False,
            existing_server_default=None,
            server_default=sa.text("false"),
        )
