"""auth security tables"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20240320_0006_auth_security"
down_revision: str | None = "20240320_0005_quotes"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_refresh_tokens_user_id_revoked",
        "refresh_tokens",
        ["user_id", "revoked"],
    )

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    event_member_role = sa.Enum("owner", "collab", "viewer", name="event_member_role")
    event_member_role.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "event_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column(
            "role",
            event_member_role,
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("event_id", "user_id"),
    )
    op.create_index(op.f("ix_event_members_event_id"), "event_members", ["event_id"])

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "ts",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("actor_user_id", sa.String(length=36), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.String(length=255), nullable=False),
        sa.Column("entity_id", sa.String(length=255), nullable=False),
        sa.Column("diff", sa.JSON(), nullable=True),
        sa.Column("ip", sa.String(length=255), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
    )

    op.add_column(
        "event_structure_candidate",
        sa.Column("assigned_user_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "event_structure_candidate_assigned_user_id_fkey",
        "event_structure_candidate",
        "users",
        ["assigned_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "event_contact_task",
        sa.Column("assigned_user_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "event_contact_task_assigned_user_id_fkey",
        "event_contact_task",
        "users",
        ["assigned_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "event_contact_task_assigned_user_id_fkey", "event_contact_task", type_="foreignkey"
    )
    op.drop_column("event_contact_task", "assigned_user_id")

    op.drop_constraint(
        "event_structure_candidate_assigned_user_id_fkey",
        "event_structure_candidate",
        type_="foreignkey",
    )
    op.drop_column("event_structure_candidate", "assigned_user_id")

    op.drop_table("audit_log")

    op.drop_index(op.f("ix_event_members_event_id"), table_name="event_members")
    op.drop_table("event_members")

    op.drop_table("password_reset_tokens")
    op.drop_index("ix_refresh_tokens_user_id_revoked", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_table("users")

    event_member_role = sa.Enum("owner", "collab", "viewer", name="event_member_role")
    event_member_role.drop(op.get_bind(), checkfirst=True)
