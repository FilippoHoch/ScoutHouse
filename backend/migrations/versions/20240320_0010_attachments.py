"""create attachments table"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20240320_0010_attachments"
down_revision: str | None = "20240320_0009_contacts"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


owner_type_enum = sa.Enum("structure", "event", name="attachment_owner_type")


def upgrade() -> None:
    owner_type_enum.create(op.get_bind(), checkfirst=True)

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
    op.create_index(
        "ix_attachments_owner",
        "attachments",
        ["owner_type", "owner_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_attachments_owner", table_name="attachments")
    op.drop_table("attachments")
    owner_type_enum.drop(op.get_bind(), checkfirst=True)
