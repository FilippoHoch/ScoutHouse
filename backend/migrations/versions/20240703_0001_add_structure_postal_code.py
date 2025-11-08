"""add postal_code to structures"""

from collections.abc import Sequence

from alembic import op

from migrations.utils.postgres import add_column_if_not_exists

revision: str = "20240703_0001"
down_revision: str | None = "20240320_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    add_column_if_not_exists("structures", "postal_code VARCHAR(16)")


def downgrade() -> None:
    op.execute('ALTER TABLE "structures" DROP COLUMN IF EXISTS postal_code')
