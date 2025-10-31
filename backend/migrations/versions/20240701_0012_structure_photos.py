"""create structure photos table"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import reflection

revision: str = "20240701_0012_structure_photos"
down_revision: str | None = "20240611_0011_structure_extra_details"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = reflection.Inspector.from_engine(bind)
    if not inspector.has_table("structure_photos"):
        op.create_table(
            "structure_photos",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "structure_id",
                sa.Integer(),
                sa.ForeignKey("structures.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "attachment_id",
                sa.Integer(),
                sa.ForeignKey("attachments.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.create_index(
            "ix_structure_photos_structure_id",
            "structure_photos",
            ["structure_id"],
        )
        op.create_index(
            "ix_structure_photos_position",
            "structure_photos",
            ["structure_id", "position"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = reflection.Inspector.from_engine(bind)
    if inspector.has_table("structure_photos"):
        op.drop_index("ix_structure_photos_position", table_name="structure_photos")
        op.drop_index("ix_structure_photos_structure_id", table_name="structure_photos")
        op.drop_table("structure_photos")
