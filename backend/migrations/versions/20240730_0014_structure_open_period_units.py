"""Add units to structure open periods"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20240730_0014"
down_revision = "20240715_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "structure_open_periods",
        sa.Column("units", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("structure_open_periods", "units")
