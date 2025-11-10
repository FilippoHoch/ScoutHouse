"""Add contact emails to structures

Revision ID: 20240920_0017
Revises: 20240905_0016
Create Date: 2024-09-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20240920_0017"
down_revision = "20240905_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("structures", sa.Column("contact_emails", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("structures", "contact_emails")
