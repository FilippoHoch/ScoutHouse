"""Drop legacy activity and inclusion columns"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "20250615_0031"
down_revision: Union[str, None] = "20250530_0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names() -> set[str]:
    bind = op.get_bind()
    inspector = inspect(bind)
    return {column["name"] for column in inspector.get_columns("structures")}


def upgrade() -> None:
    existing_columns = _column_names()
    if "activity_spaces" in existing_columns:
        op.drop_column("structures", "activity_spaces")
    if "inclusion_services" in existing_columns:
        op.drop_column("structures", "inclusion_services")


def downgrade() -> None:
    existing_columns = _column_names()
    if "activity_spaces" not in existing_columns:
        op.add_column("structures", sa.Column("activity_spaces", sa.JSON(), nullable=True))
    if "inclusion_services" not in existing_columns:
        op.add_column("structures", sa.Column("inclusion_services", sa.JSON(), nullable=True))
