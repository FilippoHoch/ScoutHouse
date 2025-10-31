"""Add altitude column to structures

Revision ID: 20240905_0016
Revises: 20240820_0015
Create Date: 2024-09-05 00:16:00.000000
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20240905_0016"
down_revision: str | None = "20240820_0015"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "structures",
        sa.Column("altitude", sa.Numeric(7, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("structures", "altitude")
