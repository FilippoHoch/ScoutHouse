"""Add min/max totals to structure cost options

Revision ID: 20241105_0020
Revises: 20241020_0019
Create Date: 2024-11-05 00:20:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241105_0020"
down_revision = "20241020_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "structure_cost_option",
        sa.Column("min_total", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "structure_cost_option",
        sa.Column("max_total", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("structure_cost_option", "max_total")
    op.drop_column("structure_cost_option", "min_total")
