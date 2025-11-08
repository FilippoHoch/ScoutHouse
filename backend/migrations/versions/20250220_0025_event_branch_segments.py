"""Add event branch segments table"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from migrations.utils.postgres import create_enum_if_not_exists, drop_enum_if_exists

# revision identifiers, used by Alembic.
revision = "20250220_0025"
down_revision = "20250110_0024"
branch_labels = None
depends_on = None

BRANCH_VALUES = ("LC", "EG", "RS", "ALL")
ACCOMMODATION_VALUES = ("indoor", "tents")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    create_enum_if_not_exists("event_accommodation", ACCOMMODATION_VALUES)

    branch_enum = postgresql.ENUM(
        *BRANCH_VALUES,
        name="event_branch",
        create_type=False,
    )
    accommodation_enum = postgresql.ENUM(
        *ACCOMMODATION_VALUES,
        name="event_accommodation",
        create_type=False,
    )

    if not inspector.has_table("event_branch_segments"):
        op.create_table(
            "event_branch_segments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "event_id",
                sa.Integer(),
                sa.ForeignKey("events.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("branch", branch_enum, nullable=False),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=False),
            sa.Column(
                "youth_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "leaders_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column("accommodation", accommodation_enum, nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
        )
        op.create_index(
            "ix_event_branch_segments_event_id",
            "event_branch_segments",
            ["event_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("event_branch_segments"):
        op.drop_index(
            "ix_event_branch_segments_event_id",
            table_name="event_branch_segments",
        )
        op.drop_table("event_branch_segments")

    drop_enum_if_exists("event_accommodation")
