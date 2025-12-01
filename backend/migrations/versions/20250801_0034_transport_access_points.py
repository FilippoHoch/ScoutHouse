"""transport access points field"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20250801_0034"
down_revision: str | None = "20250715_0033_structure_attachment_categories"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("structures", sa.Column("transport_access_points", sa.JSON(), nullable=True))
    op.execute(
        """
        UPDATE structures
        SET transport_access_points = jsonb_build_array(
            jsonb_build_object('type', 'bus_stop', 'coordinates', NULL, 'note', nearest_bus_stop)
        )
        WHERE nearest_bus_stop IS NOT NULL
        """
    )
    op.drop_column("structures", "nearest_bus_stop")


def downgrade() -> None:
    op.add_column("structures", sa.Column("nearest_bus_stop", sa.String(length=255), nullable=True))
    op.execute(
        """
        UPDATE structures
        SET nearest_bus_stop = COALESCE(
            transport_access_point ->> 'note',
            transport_access_point ->> 'type'
        )
        FROM (
            SELECT id, (transport_access_points -> 0) AS transport_access_point
            FROM structures
        ) AS first_point
        WHERE structures.id = first_point.id
        """
    )
    op.drop_column("structures", "transport_access_points")
