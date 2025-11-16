"""Add connectivity fields to structures

Revision ID: 20250530_0030
Revises: 20250425_0029
Create Date: 2025-05-30 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20250530_0030"
down_revision: Union[str, None] = "20250505_0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


cell_coverage_enum = sa.Enum(
    "none",
    "limited",
    "good",
    "excellent",
    name="structure_cell_coverage",
    create_type=False,
)


def upgrade() -> None:
    op.add_column(
        "structures",
        sa.Column("cell_data_quality", cell_coverage_enum, nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column("cell_voice_quality", cell_coverage_enum, nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column("wifi_available", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column("landline_available", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("structures", "landline_available")
    op.drop_column("structures", "wifi_available")
    op.drop_column("structures", "cell_voice_quality")
    op.drop_column("structures", "cell_data_quality")
