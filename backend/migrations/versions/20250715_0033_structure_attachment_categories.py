"""structure categorized attachments"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from migrations.utils.postgres import create_enum_if_not_exists, create_index_if_not_exists, drop_enum_if_exists

revision: str = "20250715_0033_structure_attachment_categories"
down_revision: str | None = "20250701_0032_data_quality_status"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


STRUCTURE_ATTACHMENT_KIND_VALUES = ("map_resource", "required_document")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    create_enum_if_not_exists("structure_attachment_kind", STRUCTURE_ATTACHMENT_KIND_VALUES)
    attachment_kind_enum = postgresql.ENUM(
        *STRUCTURE_ATTACHMENT_KIND_VALUES, name="structure_attachment_kind", create_type=False
    )

    if not inspector.has_table("structure_attachments"):
        op.create_table(
            "structure_attachments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("structure_id", sa.Integer(), sa.ForeignKey("structures.id", ondelete="CASCADE")),
            sa.Column("attachment_id", sa.Integer(), sa.ForeignKey("attachments.id", ondelete="CASCADE")),
            sa.Column("kind", attachment_kind_enum, nullable=False),
            sa.UniqueConstraint("structure_id", "attachment_id", name="uq_structure_attachment"),
        )

    create_index_if_not_exists(
        'CREATE INDEX IF NOT EXISTS ix_structure_attachments_kind ON "structure_attachments" (structure_id, kind)'
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    op.execute("DROP INDEX IF EXISTS ix_structure_attachments_kind")
    if inspector.has_table("structure_attachments"):
        op.drop_table("structure_attachments")
    drop_enum_if_exists("structure_attachment_kind")
