"""Add contact emails to structures

Revision ID: 20240920_0017
Revises: 20240905_0016_structure_altitude
Create Date: 2024-09-20
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20240920_0017"
down_revision = "20240905_0016_structure_altitude"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("structures", sa.Column("contact_emails", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("structures", "contact_emails")
