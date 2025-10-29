"""create structures table"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from migrations.utils.postgres import create_enum_if_not_exists, drop_enum_if_exists

revision: str = "20240320_0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


STRUCTURE_TYPE_VALUES = ("community", "event", "training")


def upgrade() -> None:
    create_enum_if_not_exists("structure_type", STRUCTURE_TYPE_VALUES)

    op.create_table(
        "structures",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False, unique=True),
        sa.Column("province", sa.String(length=100), nullable=True),
        sa.Column(
            "type",
            postgresql.ENUM(
                *STRUCTURE_TYPE_VALUES,
                name="structure_type",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("structures")
    drop_enum_if_exists("structure_type")
