"""Add events and contact tracking tables

Revision ID: 20240320_0004
Revises: 20240320_0003
Create Date: 2024-03-20 00:04:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from migrations.utils.postgres import (
    create_enum_if_not_exists,
    create_index_if_not_exists,
    drop_enum_if_exists,
)

# revision identifiers, used by Alembic.
revision = "20240320_0004"
down_revision = "20240320_0003"
branch_labels = None
depends_on = None

BRANCH_VALUES = ("LC", "EG", "RS", "ALL")
STATUS_VALUES = ("draft", "planning", "booked", "archived")
CANDIDATE_STATUS_VALUES = (
    "to_contact",
    "contacting",
    "available",
    "unavailable",
    "followup",
    "confirmed",
    "option",
)
CONTACT_STATUS_VALUES = ("todo", "in_progress", "done", "n_a")
CONTACT_OUTCOME_VALUES = ("pending", "positive", "negative")

json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    bind = op.get_bind()

    create_enum_if_not_exists("event_branch", BRANCH_VALUES)
    create_enum_if_not_exists("event_status", STATUS_VALUES)
    create_enum_if_not_exists("event_candidate_status", CANDIDATE_STATUS_VALUES)
    create_enum_if_not_exists("event_contact_task_status", CONTACT_STATUS_VALUES)
    create_enum_if_not_exists(
        "event_contact_task_outcome", CONTACT_OUTCOME_VALUES
    )

    branch_enum = postgresql.ENUM(
        *BRANCH_VALUES, name="event_branch", create_type=False
    )
    status_enum = postgresql.ENUM(
        *STATUS_VALUES, name="event_status", create_type=False
    )
    candidate_status_enum = postgresql.ENUM(
        *CANDIDATE_STATUS_VALUES, name="event_candidate_status", create_type=False
    )
    contact_status_enum = postgresql.ENUM(
        *CONTACT_STATUS_VALUES, name="event_contact_task_status", create_type=False
    )
    contact_outcome_enum = postgresql.ENUM(
        *CONTACT_OUTCOME_VALUES, name="event_contact_task_outcome", create_type=False
    )

    inspector = sa.inspect(bind)

    if not inspector.has_table("events"):
        op.create_table(
            "events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("slug", sa.String(length=255), nullable=False, unique=True),
            sa.Column("title", sa.Text(), nullable=False),
            sa.Column("branch", branch_enum, nullable=False),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=False),
            sa.Column(
                "participants",
                json_type,
                nullable=False,
                server_default=sa.text(
                    "jsonb_build_object('lc', 0, 'eg', 0, 'rs', 0, 'leaders', 0)"
                ),
            ),
            sa.Column("budget_total", sa.Numeric(10, 2), nullable=True),
            sa.Column("status", status_enum, nullable=False, server_default="draft"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
                onupdate=sa.func.now(),
            ),
        )

    if not inspector.has_table("event_structure_candidate"):
        op.create_table(
            "event_structure_candidate",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "event_id",
                sa.Integer(),
                sa.ForeignKey("events.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "structure_id",
                sa.Integer(),
                sa.ForeignKey("structures.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "status", candidate_status_enum, nullable=False, server_default="to_contact"
            ),
            sa.Column("assigned_user", sa.Text(), nullable=True),
            sa.Column(
                "last_update",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
                onupdate=sa.func.now(),
            ),
            sa.UniqueConstraint("event_id", "structure_id", name="uq_event_structure"),
        )

    create_index_if_not_exists(
        'CREATE INDEX IF NOT EXISTS ix_event_structure_candidate_event_status '
        'ON "event_structure_candidate" (event_id, status)'
    )

    if not inspector.has_table("event_contact_task"):
        op.create_table(
            "event_contact_task",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "event_id",
                sa.Integer(),
                sa.ForeignKey("events.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "structure_id",
                sa.Integer(),
                sa.ForeignKey("structures.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("assigned_user", sa.Text(), nullable=True),
            sa.Column(
                "status", contact_status_enum, nullable=False, server_default="todo"
            ),
            sa.Column(
                "outcome",
                contact_outcome_enum,
                nullable=False,
                server_default="pending",
            ),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
                onupdate=sa.func.now(),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("event_contact_task"):
        op.drop_table("event_contact_task")
    op.execute('DROP INDEX IF EXISTS ix_event_structure_candidate_event_status')
    if inspector.has_table("event_structure_candidate"):
        op.drop_table("event_structure_candidate")
    if inspector.has_table("events"):
        op.drop_table("events")

    drop_enum_if_exists("event_contact_task_outcome")
    drop_enum_if_exists("event_contact_task_status")
    drop_enum_if_exists("event_candidate_status")
    drop_enum_if_exists("event_status")
    drop_enum_if_exists("event_branch")
