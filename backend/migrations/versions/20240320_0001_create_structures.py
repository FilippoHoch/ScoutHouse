"""create structures table"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20240320_0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


structure_type = sa.Enum(
    "community",
    "event",
    "training",
    name="structure_type",
)


def upgrade() -> None:
    op.create_table(
        "structures",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False, unique=True),
        sa.Column("province", sa.String(length=100), nullable=True),
        sa.Column("type", structure_type, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("structures")
    structure_type.drop(op.get_bind(), checkfirst=True)
