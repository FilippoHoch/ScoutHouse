"""Add postal_code to structures"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20250220_0025"
down_revision: str | None = "20250110_0024_attachment_description_backfill"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("structures", sa.Column("postal_code", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("structures", "postal_code")
