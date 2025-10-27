"""Add performance indexes for public lookups"""

from __future__ import annotations

from typing import Sequence

from alembic import op

revision: str = "20240320_0008_perf_indexes"
down_revision: str | None = "20240320_0007_roles_audit"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_structures_lower_name
        ON structures (lower(name))
        """.strip()
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_structures_province
        ON structures (province)
        """.strip()
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_structures_type
        ON structures (type)
        """.strip()
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_structure_season_availability_structure_id_season
        ON structure_season_availability (structure_id, season)
        """.strip()
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_structure_cost_option_structure_id_model
        ON structure_cost_option (structure_id, model)
        """.strip()
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS ix_structure_cost_option_structure_id_model"
    )
    op.execute(
        "DROP INDEX IF EXISTS ix_structure_season_availability_structure_id_season"
    )
    op.execute("DROP INDEX IF EXISTS ix_structures_type")
    op.execute("DROP INDEX IF EXISTS ix_structures_province")
    op.execute("DROP INDEX IF EXISTS ix_structures_lower_name")

