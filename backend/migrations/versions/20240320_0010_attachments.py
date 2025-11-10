"""create attachments table"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from migrations.utils.postgres import (
    create_enum_if_not_exists,
    create_index_if_not_exists,
    drop_enum_if_exists,
)

revision: str = "20240320_0010_attachments"
down_revision: str | None = "20240320_0009_contacts"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


OWNER_TYPE_VALUES = ("structure", "event")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    create_enum_if_not_exists("attachment_owner_type", OWNER_TYPE_VALUES)
    owner_type_enum = postgresql.ENUM(
        *OWNER_TYPE_VALUES,
        name="attachment_owner_type",
        create_type=False,
    )

    if not inspector.has_table("attachments"):
        op.create_table(
            "attachments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_type", owner_type_enum, nullable=False),
            sa.Column("owner_id", sa.Integer(), nullable=False),
            sa.Column("storage_key", sa.String(length=512), nullable=False),
            sa.Column("filename", sa.String(length=255), nullable=False),
            sa.Column("mime", sa.String(length=100), nullable=False),
            sa.Column("size", sa.Integer(), nullable=False),
            sa.Column(
                "created_by",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.UniqueConstraint("storage_key", name="uq_attachments_storage_key"),
        )

    create_index_if_not_exists(
        'CREATE INDEX IF NOT EXISTS ix_attachments_owner ON "attachments" (owner_type, owner_id)'
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    op.execute("DROP INDEX IF EXISTS ix_attachments_owner")
    if inspector.has_table("attachments"):
        op.drop_table("attachments")
    drop_enum_if_exists("attachment_owner_type")
