"""remove legacy activity spaces and inclusion services columns

Revision ID: 20250505_0030
Revises: 20250425_0029
Create Date: 2025-05-05 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20250505_0030"
down_revision: Union[str, None] = "20250425_0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("structures", "activity_spaces")
    op.drop_column("structures", "inclusion_services")


def downgrade() -> None:
    op.add_column("structures", sa.Column("inclusion_services", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("activity_spaces", sa.JSON(), nullable=True))
