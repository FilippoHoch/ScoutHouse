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

branch_enum_type = postgresql.ENUM("LC", "EG", "RS", "ALL", name="event_branch")
status_enum_type = postgresql.ENUM(
    "draft", "planning", "booked", "archived", name="event_status"
)
candidate_status_enum_type = postgresql.ENUM(
    "to_contact",
    "contacting",
    "available",
    "unavailable",
    "followup",
    "confirmed",
    "option",
    name="event_candidate_status",
)
contact_status_enum_type = postgresql.ENUM(
    "todo", "in_progress", "done", "n_a", name="event_contact_task_status"
)
contact_outcome_enum_type = postgresql.ENUM(
    "pending", "positive", "negative", name="event_contact_task_outcome"
)


def _enum_for_column(enum_type: postgresql.ENUM) -> postgresql.ENUM:
    enum_copy = enum_type.copy()
    enum_copy.create_type = False
    return enum_copy


branch_enum = _enum_for_column(branch_enum_type)
status_enum = _enum_for_column(status_enum_type)
candidate_status_enum = _enum_for_column(candidate_status_enum_type)
contact_status_enum = _enum_for_column(contact_status_enum_type)
contact_outcome_enum = _enum_for_column(contact_outcome_enum_type)

json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    bind = op.get_bind()

    branch_enum_type.create(bind, checkfirst=True)
    status_enum_type.create(bind, checkfirst=True)
    candidate_status_enum_type.create(bind, checkfirst=True)
    contact_status_enum_type.create(bind, checkfirst=True)
    contact_outcome_enum_type.create(bind, checkfirst=True)

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

    bind = op.get_bind()
    contact_outcome_enum_type.drop(bind, checkfirst=True)
    contact_status_enum_type.drop(bind, checkfirst=True)
    candidate_status_enum_type.drop(bind, checkfirst=True)
    status_enum_type.drop(bind, checkfirst=True)
    branch_enum_type.drop(bind, checkfirst=True)
