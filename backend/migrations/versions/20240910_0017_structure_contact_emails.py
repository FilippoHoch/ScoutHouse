"""Add contact emails to structures

Revision ID: 20240910_0017
Revises: 20240905_0016
Create Date: 2024-09-10 00:17:00.000000
"""

from __future__ import annotations

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20240910_0017"
down_revision: str | None = "20240905_0016"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "structures",
        sa.Column("contact_emails", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("structures", "contact_emails")
