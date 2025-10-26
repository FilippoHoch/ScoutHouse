"""Add events and contact tracking tables

Revision ID: 20240320_0004
Revises: 20240320_0003
Create Date: 2024-03-20 00:04:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20240320_0004"
down_revision = "20240320_0003"
branch_labels = None
depends_on = None

branch_enum = sa.Enum("LC", "EG", "RS", "ALL", name="event_branch")
status_enum = sa.Enum("draft", "planning", "booked", "archived", name="event_status")
candidate_status_enum = sa.Enum(
    "to_contact",
    "contacting",
    "available",
    "unavailable",
    "followup",
    "confirmed",
    "option",
    name="event_candidate_status",
)
contact_status_enum = sa.Enum(
    "todo", "in_progress", "done", "n_a", name="event_contact_task_status"
)
contact_outcome_enum = sa.Enum(
    "pending", "positive", "negative", name="event_contact_task_outcome"
)

json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    branch_enum.create(op.get_bind(), checkfirst=True)
    status_enum.create(op.get_bind(), checkfirst=True)
    candidate_status_enum.create(op.get_bind(), checkfirst=True)
    contact_status_enum.create(op.get_bind(), checkfirst=True)
    contact_outcome_enum.create(op.get_bind(), checkfirst=True)

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
            server_default=sa.text("'{""lc"":0,""eg"":0,""rs"":0,""leaders"":0}'"),
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
    op.create_index(
        "ix_event_structure_candidate_event_status",
        "event_structure_candidate",
        ["event_id", "status"],
    )

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
            "outcome", contact_outcome_enum, nullable=False, server_default="pending"
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
    op.drop_table("event_contact_task")
    op.drop_index(
        "ix_event_structure_candidate_event_status",
        table_name="event_structure_candidate",
    )
    op.drop_table("event_structure_candidate")
    op.drop_table("events")

    contact_outcome_enum.drop(op.get_bind(), checkfirst=True)
    contact_status_enum.drop(op.get_bind(), checkfirst=True)
    candidate_status_enum.drop(op.get_bind(), checkfirst=True)
    status_enum.drop(op.get_bind(), checkfirst=True)
    branch_enum.drop(op.get_bind(), checkfirst=True)
