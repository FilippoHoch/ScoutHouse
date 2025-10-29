"""add geolocation fields to structures"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.utils.postgres import (
    add_column_if_not_exists,
    add_constraint_if_not_exists,
    create_enum_if_not_exists,
    create_index_if_not_exists,
    drop_enum_if_exists,
    enum_value_exists,
)

revision: str = "20240320_0002"
down_revision: str | None = "20240320_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

NEW_STRUCTURE_TYPE_VALUES = ("house", "land", "mixed")
OLD_STRUCTURE_TYPE_VALUES = ("community", "event", "training")


def upgrade() -> None:
    bind = op.get_bind()

    if not enum_value_exists("structure_type", "house"):
        op.execute("ALTER TYPE structure_type RENAME TO structure_type_old")
        create_enum_if_not_exists("structure_type", NEW_STRUCTURE_TYPE_VALUES)
        op.execute(
            "ALTER TABLE structures "
            "ALTER COLUMN type TYPE structure_type USING type::text::structure_type"
        )
        drop_enum_if_exists("structure_type_old")

    add_column_if_not_exists("structures", 'address TEXT')
    add_column_if_not_exists("structures", 'latitude NUMERIC(9, 6)')
    add_column_if_not_exists("structures", 'longitude NUMERIC(9, 6)')

    inspector = sa.inspect(bind)
    unique_constraints = {
        constraint["name"] for constraint in inspector.get_unique_constraints("structures")
    }
    if "structures_slug_key" in unique_constraints:
        op.drop_constraint("structures_slug_key", "structures", type_="unique")

    create_index_if_not_exists(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_structures_slug_unique ON "structures" (slug)'
    )
    create_index_if_not_exists(
        'CREATE INDEX IF NOT EXISTS idx_structures_province ON "structures" (province)'
    )
    create_index_if_not_exists(
        'CREATE INDEX IF NOT EXISTS idx_structures_name_lower ON "structures" (lower(name))'
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS idx_structures_name_lower')
    op.execute('DROP INDEX IF EXISTS idx_structures_province')
    op.execute('DROP INDEX IF EXISTS idx_structures_slug_unique')
    add_constraint_if_not_exists(
        "structures",
        "structures_slug_key",
        'ALTER TABLE "structures" ADD CONSTRAINT structures_slug_key UNIQUE (slug)',
    )

    op.execute('ALTER TABLE "structures" DROP COLUMN IF EXISTS longitude')
    op.execute('ALTER TABLE "structures" DROP COLUMN IF EXISTS latitude')
    op.execute('ALTER TABLE "structures" DROP COLUMN IF EXISTS address')

    if not enum_value_exists("structure_type", "community"):
        op.execute("ALTER TYPE structure_type RENAME TO structure_type_new")
        create_enum_if_not_exists("structure_type", OLD_STRUCTURE_TYPE_VALUES)
        op.execute(
            "ALTER TABLE structures "
            "ALTER COLUMN type TYPE structure_type USING type::text::structure_type"
        )
        drop_enum_if_exists("structure_type_new")
