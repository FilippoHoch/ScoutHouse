from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from migrations.utils.postgres import (
    add_column_if_not_exists,
    add_constraint_if_not_exists,
    create_enum_if_not_exists,
    create_index_if_not_exists,
    drop_enum_if_exists,
)

# revision identifiers, used by Alembic.
revision: str = "20240320_0006"
down_revision: str | None = "20240320_0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("users"):
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

    if not inspector.has_table("refresh_tokens"):
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

    create_index_if_not_exists(
        "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id_revoked "
        'ON "refresh_tokens" (user_id, revoked)'
    )

    create_enum_if_not_exists("event_member_role", ("owner", "collab", "viewer"))
    event_member_role = postgresql.ENUM(
        "owner", "collab", "viewer", name="event_member_role", create_type=False
    )

    if not inspector.has_table("event_members"):
        op.create_table(
            "event_members",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("event_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("role", event_member_role, nullable=False),
            sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("event_id", "user_id"),
        )

    create_index_if_not_exists(
        'CREATE INDEX IF NOT EXISTS ix_event_members_event_id ON "event_members" (event_id)'
    )

    add_column_if_not_exists("event_structure_candidate", "assigned_user_id VARCHAR(36)")
    add_constraint_if_not_exists(
        "event_structure_candidate",
        "event_structure_candidate_assigned_user_id_fkey",
        'ALTER TABLE "event_structure_candidate" ADD CONSTRAINT '
        "event_structure_candidate_assigned_user_id_fkey "
        'FOREIGN KEY (assigned_user_id) REFERENCES "users" (id) ON DELETE SET NULL',
    )

    add_column_if_not_exists("event_contact_task", "assigned_user_id VARCHAR(36)")
    add_constraint_if_not_exists(
        "event_contact_task",
        "event_contact_task_assigned_user_id_fkey",
        'ALTER TABLE "event_contact_task" ADD CONSTRAINT '
        "event_contact_task_assigned_user_id_fkey "
        'FOREIGN KEY (assigned_user_id) REFERENCES "users" (id) ON DELETE SET NULL',
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    op.execute(
        'ALTER TABLE "event_contact_task" '
        "DROP CONSTRAINT IF EXISTS event_contact_task_assigned_user_id_fkey"
    )
    op.execute('ALTER TABLE "event_contact_task" DROP COLUMN IF EXISTS assigned_user_id')

    op.execute(
        'ALTER TABLE "event_structure_candidate" '
        "DROP CONSTRAINT IF EXISTS event_structure_candidate_assigned_user_id_fkey"
    )
    op.execute('ALTER TABLE "event_structure_candidate" DROP COLUMN IF EXISTS assigned_user_id')

    op.execute("DROP INDEX IF EXISTS ix_event_members_event_id")
    if inspector.has_table("event_members"):
        op.drop_table("event_members")

    op.execute("DROP INDEX IF EXISTS ix_refresh_tokens_user_id_revoked")
    if inspector.has_table("refresh_tokens"):
        op.drop_table("refresh_tokens")

    if inspector.has_table("users"):
        op.drop_table("users")

    drop_enum_if_exists("event_member_role")
